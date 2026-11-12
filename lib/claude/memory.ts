import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  JUDGE_BATCH, JUDGE_READ_MAX, JUDGE_THRESHOLD, RECALL_CANDIDATES, RECALL_MAX, RECALL_THRESHOLD,
} from "@/lib/claude/constants";
import type { Memory } from "@/lib/claude/context";
import { askJev, jevConfigured, type NoulQuestion } from "@/lib/claude/jev";
import { isBotUid } from "@/lib/claude/personas/info";
import type { Room } from "@/lib/claude/rooms";
import { mongoCollection, mongoConfigured } from "@/lib/mongo";

export type StoredMemory = Memory & { id: string; score: number };

/** MongoDB memories 문서. _id 는 `{roomId}_{messageId}`, createdAt 은 원래 메시지 시각(밀리초). */
export type MemoryDoc = {
  _id: string;
  text: string;
  nickname: string;
  uid: string;
  context: string[];
  roomId: string;
  messageId: string;
  createdAt: Date;
  score: number;
};

/** MongoDB memoryState 문서. _id 는 방 id. Firestore 메시지 시각을 밀리초로 자르지 않고 두 수로 둔다. */
export type MemoryStateDoc = { _id: string; lastJudgedAt: { seconds: number; nanoseconds: number } };

const DUPLICATE_KEY = 11000;
type Deps = { askJev?: typeof askJev; env?: NodeJS.ProcessEnv };
/** clearedAt 은 그 방을 /clear 한 시각. 있으면 그 뒤에 만들어진 기억만 꺼낸다. */
type RecallDeps = Deps & { clearedAt?: Timestamp | null };

const RECALL_QUESTION = "이 기억이 위 채팅 질문에 답하는 데 직접 도움이 되는가?";
const JUDGE_QUESTION =
  "이 채팅 메시지가 말한 사람이나 그 주변 사람에 대해 나중에도 기억해 둘 만한, 오래 가는 새 사실(취향, 생일, 직장, 계획, 약속 등)을 알려 주는가? 예전에 한 말을 묻거나 되묻는 질문처럼 새 사실이 없는 메시지는 아니다.";

/** candidates[i] 의 점수는 scores[`k${i}`]. 기준 이상을 점수 순으로 최대 개수만큼, score 는 이번 점수로 바꿔 돌려준다. */
export function pickMemories(scores: Record<string, number>, candidates: StoredMemory[]): StoredMemory[] {
  return candidates
    .map((m, i) => ({ ...m, score: scores[`k${i}`] ?? 0 }))
    .filter((m) => m.score >= RECALL_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, RECALL_MAX);
}

/**
 * 그 방의 기억 중 질문에 도움이 되는 것을 오래된 순으로. /clear 이전 기억은 후보에 넣지 않는다.
 * MongoDB·Jev 설정이 없거나 후보가 없거나 Jev 가 실패하면 빈 목록.
 */
export async function recallMemories(
  room: Room,
  asker: string,
  question: string,
  deps: RecallDeps = {},
): Promise<Memory[]> {
  const env = deps.env ?? process.env;
  if (!jevConfigured(env) || !mongoConfigured(env)) return [];
  const memories = await mongoCollection<MemoryDoc>("memories", env);
  const filter = deps.clearedAt
    ? { roomId: room.id, createdAt: { $gt: deps.clearedAt.toDate() } }
    : { roomId: room.id };
  const docs = await memories.find(filter).sort({ createdAt: -1 }).limit(RECALL_CANDIDATES).toArray();
  if (docs.length === 0) return [];
  const candidates: StoredMemory[] = docs.map((x) => ({
    id: x._id,
    text: x.text,
    nickname: x.nickname,
    context: Array.isArray(x.context) ? x.context : [],
    createdAt: x.createdAt,
    score: 0,
  }));
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

/** guarded 는 Jev 요청 검사에 걸린 사람 메시지다. */
export type JudgeMessage = { id: string; uid: string; nickname: string; text: string; createdAtMs: number; guarded?: boolean };

/** 봇 메시지와 검사에 걸린 메시지를 뺀 판단 대상과, 대상마다 바로 앞 사람 메시지 최대 2개("닉네임: 본문", 오래된 순). */
export function judgeRange(
  messages: JudgeMessage[],
  isBot: (uid: string) => boolean,
): { targets: JudgeMessage[]; context: Map<string, string[]> } {
  const targets: JudgeMessage[] = [];
  const context = new Map<string, string[]>();
  for (const m of messages) {
    if (isBot(m.uid) || m.guarded === true) continue;
    context.set(m.id, targets.slice(-2).map((p) => `${p.nickname}: ${p.text}`));
    targets.push(m);
  }
  return { targets, context };
}

/**
 * 지난 판단 이후 until(질문 메시지 시각, 이하 포함)까지 그 방의 Firestore 메시지를 Jev 로 판단해 기억할 것을 원문 그대로 MongoDB memories 에 복사한다.
 * 판정 상태(memoryState)는 MongoDB 에 두고 앞으로만 옮긴다. MongoDB·Jev 설정이 없으면 아무것도 하지 않는다.
 * 한 묶음이라도 실패하면 memoryState 를 갱신하지 않고 throw 해 다음 호출이 다시 판단하게 한다.
 */
export async function rememberSince(
  db: Firestore,
  room: Room,
  until: Timestamp,
  deps: Deps = {},
): Promise<{ judged: number; saved: number }> {
  const env = deps.env ?? process.env;
  if (!jevConfigured(env) || !mongoConfigured(env)) return { judged: 0, saved: 0 };
  const ask = deps.askJev ?? askJev;
  const [memories, states] = await Promise.all([
    mongoCollection<MemoryDoc>("memories", env),
    mongoCollection<MemoryStateDoc>("memoryState", env),
  ]);
  const state = await states.findOne({ _id: room.id });
  const last = state ? new Timestamp(state.lastJudgedAt.seconds, state.lastJudgedAt.nanoseconds) : undefined;
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
      guarded: x.guarded === true,
    };
  });
  const stamps = new Map(docs.map((d) => [d.id, d.data().createdAt as Timestamp]));
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
    if (keep.length > 0) {
      await memories.bulkWrite(
        keep.map(({ m, score }) => {
          const doc: MemoryDoc = {
            _id: `${room.id}_${m.id}`,
            text: m.text,
            nickname: m.nickname,
            uid: m.uid,
            context: context.get(m.id) ?? [],
            roomId: room.id,
            messageId: m.id,
            createdAt: stamps.get(m.id)!.toDate(),
            score,
          };
          return { replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } };
        }),
      );
    }
    saved += keep.length;
  }

  await advanceMemoryState(room.id, stamps.get(range[range.length - 1].id)!, env);
  return { judged: targets.length, saved };
}

/**
 * 판정 상태를 end 로 옮긴다. 저장값보다 클 때만 바꾸는 조건부 upsert 이고,
 * 저장값이 이미 앞서 있어 새로 넣으려다 생긴 중복 키 오류는 무시한다.
 */
export async function advanceMemoryState(
  roomId: string,
  end: { seconds: number; nanoseconds: number },
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const states = await mongoCollection<MemoryStateDoc>("memoryState", env);
  const { seconds, nanoseconds } = end;
  try {
    await states.updateOne(
      {
        _id: roomId,
        $or: [
          { "lastJudgedAt.seconds": { $lt: seconds } },
          { "lastJudgedAt.seconds": seconds, "lastJudgedAt.nanoseconds": { $lt: nanoseconds } },
        ],
      },
      { $set: { lastJudgedAt: { seconds, nanoseconds } } },
      { upsert: true },
    );
  } catch (e) {
    if ((e as { code?: unknown }).code !== DUPLICATE_KEY) throw e;
  }
}
