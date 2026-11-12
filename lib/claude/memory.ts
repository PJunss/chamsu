import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  JUDGE_BATCH, JUDGE_READ_MAX, JUDGE_THRESHOLD, RECALL_CANDIDATES, RECALL_MAX, RECALL_THRESHOLD,
} from "@/lib/claude/constants";
import type { Memory } from "@/lib/claude/context";
import { askJev, jevConfigured, type NoulQuestion } from "@/lib/claude/jev";
import { isBotUid } from "@/lib/claude/personas/info";
import type { Room } from "@/lib/claude/rooms";

export type StoredMemory = Memory & { id: string; score: number };
type Deps = { askJev?: typeof askJev; env?: NodeJS.ProcessEnv };

const RECALL_QUESTION = "이 기억이 위 채팅 질문에 답하는 데 직접 도움이 되는가?";
const JUDGE_QUESTION =
  "이 채팅 메시지에 나중에도 기억해 둘 만한, 말한 사람이나 그 주변 사람에 대한 오래 가는 사실(취향, 생일, 직장, 계획, 약속 등)이 들어 있는가?";

/** candidates[i] 의 점수는 scores[`k${i}`]. 기준 이상을 점수 순으로 최대 개수만큼, score 는 이번 점수로 바꿔 돌려준다. */
export function pickMemories(scores: Record<string, number>, candidates: StoredMemory[]): StoredMemory[] {
  return candidates
    .map((m, i) => ({ ...m, score: scores[`k${i}`] ?? 0 }))
    .filter((m) => m.score >= RECALL_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, RECALL_MAX);
}

/** 그 방의 기억 중 질문에 도움이 되는 것을 오래된 순으로. 키가 없거나 후보가 없거나 Jev 가 실패하면 빈 목록. */
export async function recallMemories(
  db: Firestore,
  room: Room,
  asker: string,
  question: string,
  deps: Deps = {},
): Promise<Memory[]> {
  const env = deps.env ?? process.env;
  if (!jevConfigured(env)) return [];
  const snap = await db
    .collection("memories")
    .where("roomId", "==", room.id)
    .orderBy("createdAt", "desc")
    .limit(RECALL_CANDIDATES)
    .get();
  if (snap.empty) return [];
  const candidates: StoredMemory[] = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      text: x.text,
      nickname: x.nickname,
      context: Array.isArray(x.context) ? x.context : [],
      createdAt: (x.createdAt as Timestamp).toDate(),
      score: 0,
    };
  });
  const questions: Record<string, NoulQuestion> = {};
  candidates.forEach((m, i) => {
    questions[`k${i}`] = { type: "noul", instructions: { memory: `${m.nickname}: ${m.text}`, question: RECALL_QUESTION } };
  });
  try {
    const scores = await (deps.askJev ?? askJev)(`${asker}: ${question}`, questions, { env });
    return pickMemories(scores, candidates)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(({ text, nickname, context, createdAt }) => ({ text, nickname, context, createdAt }));
  } catch (e) {
    console.error("recall failed", e instanceof Error ? e.name : "unknown");
    return [];
  }
}

export type JudgeMessage = { id: string; uid: string; nickname: string; text: string; createdAtMs: number };

/** 봇 메시지를 뺀 판단 대상과, 대상마다 바로 앞 사람 메시지 최대 2개("닉네임: 본문", 오래된 순). */
export function judgeRange(
  messages: JudgeMessage[],
  isBot: (uid: string) => boolean,
): { targets: JudgeMessage[]; context: Map<string, string[]> } {
  const targets: JudgeMessage[] = [];
  const context = new Map<string, string[]>();
  for (const m of messages) {
    if (isBot(m.uid)) continue;
    context.set(m.id, targets.slice(-2).map((p) => `${p.nickname}: ${p.text}`));
    targets.push(m);
  }
  return { targets, context };
}

/**
 * 지난 판단 이후 untilMs 까지 그 방의 메시지를 Jev 로 판단해 기억할 것을 원문 그대로 memories 에 복사한다.
 * 한 묶음이라도 실패하면 memoryState 를 갱신하지 않고 throw 해 다음 호출이 다시 판단하게 한다.
 */
export async function rememberSince(
  db: Firestore,
  room: Room,
  untilMs: number,
  deps: Deps = {},
): Promise<{ judged: number; saved: number }> {
  const env = deps.env ?? process.env;
  if (!jevConfigured(env)) return { judged: 0, saved: 0 };
  const ask = deps.askJev ?? askJev;
  const stateRef = db.collection("memoryState").doc(room.id);
  const stateSnap = await stateRef.get();
  const last = stateSnap.exists ? (stateSnap.data()?.lastJudgedAt as Timestamp | undefined) : undefined;
  const until = Timestamp.fromMillis(untilMs);
  const messages = db.collection(room.messagesPath);
  const docs = last
    ? (
        await messages
          .where("createdAt", ">", last)
          .where("createdAt", "<=", until)
          .orderBy("createdAt", "asc")
          .limit(JUDGE_READ_MAX)
          .get()
      ).docs
    : (await messages.where("createdAt", "<=", until).orderBy("createdAt", "desc").limit(JUDGE_READ_MAX).get()).docs.reverse();
  if (docs.length === 0) return { judged: 0, saved: 0 };

  const range: JudgeMessage[] = docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      uid: x.uid,
      nickname: x.nickname,
      text: x.text,
      createdAtMs: (x.createdAt as Timestamp).toMillis(),
    };
  });
  const { targets, context } = judgeRange(range, (uid) => isBotUid(uid));

  let saved = 0;
  for (let start = 0; start < targets.length; start += JUDGE_BATCH) {
    const batch = targets.slice(start, start + JUDGE_BATCH);
    const questions: Record<string, NoulQuestion> = {};
    batch.forEach((m, i) => {
      questions[`m${i}`] = { type: "noul", instructions: { message: `${m.nickname}: ${m.text}`, question: JUDGE_QUESTION } };
    });
    const scores = await ask(room.judgeState, questions, { env });
    const keep = batch
      .map((m, i) => ({ m, score: scores[`m${i}`] ?? 0 }))
      .filter((x) => x.score >= JUDGE_THRESHOLD);
    await Promise.all(
      keep.map(({ m, score }) =>
        db
          .collection("memories")
          .doc(`${room.id}_${m.id}`)
          .set({
            text: m.text,
            nickname: m.nickname,
            uid: m.uid,
            context: context.get(m.id) ?? [],
            roomId: room.id,
            messageId: m.id,
            createdAt: Timestamp.fromMillis(m.createdAtMs),
            score,
          }),
      ),
    );
    saved += keep.length;
  }

  const endMs = range[range.length - 1].createdAtMs;
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(stateRef);
    const prev = cur.exists ? (cur.data()?.lastJudgedAt as Timestamp | undefined) : undefined;
    if (prev && prev.toMillis() >= endMs) return;
    tx.set(stateRef, { lastJudgedAt: Timestamp.fromMillis(endMs) });
  });
  return { judged: targets.length, saved };
}
