import Anthropic from "@anthropic-ai/sdk";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { answer } from "@/lib/claude/answer";
import { verifyRequestUser } from "@/lib/authToken";
import { AFFINITY_DEFAULT, CONTEXT_SIZE, DM_SETTLE_MS, QUESTION_TTL_MS } from "@/lib/claude/constants";
import type { CtxMessage, Memory } from "@/lib/claude/context";
import { consumeClaudeQuota } from "@/lib/claude/limits";
import { recallMemories, rememberSince } from "@/lib/claude/memory";
import { getPersonaConfig, type PersonaConfig } from "@/lib/claude/personas";
import { affinityScores } from "@/lib/claude/affinityNeg";
import { applyAffinity, readAffinity } from "@/lib/claude/affinityStore";
import { guardScore, isGuarded, type GuardResult } from "@/lib/claude/guard";
import { decideOutcome, type BotResult } from "@/lib/claude/outcome";
import { pickTarget, resolveRoom, type Room } from "@/lib/claude/rooms";
import { isClearCommand } from "@/lib/claude/clear";
import { clearRoom } from "@/lib/claude/clearRoom";
import { readClearedAt } from "@/lib/claude/roomState";
import { sleep } from "@/lib/claude/sleep";
import { createTiming, type Timing } from "@/lib/claude/timing";

/** 러너 두 번(최대 90초)에 모델·Jev 호출이 더해진다. */
export const maxDuration = 120;

const fail = (error: string, status: number) => Response.json({ error }, { status });
const errName = (e: unknown) => (e instanceof Error ? e.name : "unknown");

/** 서버 로그에 남길 오류 종류와 상태 코드. 키·본문은 남기지 않는다. */
function describeError(e: unknown): [string, number | ""] {
  if (e instanceof Anthropic.RateLimitError) return ["rate_limit", e.status ?? ""];
  if (e instanceof Anthropic.APIError) return ["api_error", e.status ?? ""];
  return [errName(e), ""];
}

type QuestionDoc = { text: unknown; uid: string; nickname: string; createdAt: Timestamp };

type JobStatus = "done" | "failed" | "skipped";

/**
 * /clear: 작업 문서·연속 메시지 대기·요청 검사 없이 그 방을 지우고, 봇이 처음 만난 것처럼 인사 한 줄을 쓴다.
 * 인사를 만들지 못하면 아무것도 쓰지 않는다(빈 방).
 */
async function clearAndGreet(
  db: ReturnType<typeof getAdminDb>,
  room: Room,
  persona: PersonaConfig,
  q: QuestionDoc,
  messageId: string,
): Promise<Response> {
  const { clearedAt } = await clearRoom(db, room);
  console.log("claude clear", `room=${room.id}`, `clearedAt=${clearedAt.toMillis()}`);
  try {
    const text = await answer({
      room,
      persona,
      history: [],
      memories: [],
      affinity: { nickname: q.nickname, score: AFFINITY_DEFAULT },
      greeting: { nickname: q.nickname },
    });
    await db.collection(room.messagesPath).add({
      text,
      nickname: persona.info.nickname,
      uid: persona.info.uid,
      createdAt: FieldValue.serverTimestamp(),
      replyTo: messageId,
    });
  } catch (e) {
    console.error("claude clear greeting failed", `persona=${persona.info.id}`, ...describeError(e));
  }
  return Response.json({ cleared: true });
}

export async function POST(req: Request) {
  let body: { roomId?: unknown; messageId?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", 400);
  }
  const { roomId, messageId } = body ?? {};
  if (typeof messageId !== "string" || !messageId) return fail("bad_request", 400);
  if (typeof roomId !== "string") return fail("bad_request", 400);
  const room = resolveRoom(roomId);
  if (!room) return fail("bad_request", 400);
  const id = messageId;

  /** 요청자는 ID 토큰으로 확인하고, 방 주인일 때만 받는다. Firestore 는 그 뒤에 읽는다. */
  const uid = await verifyRequestUser(req);
  if (!uid) return fail("unauthorized", 401);
  if (uid !== room.ownerUid) return fail("forbidden", 403);

  try {
    const db = getAdminDb();
    const messages = db.collection(room.messagesPath);
    const snap = await messages.doc(id).get();
    if (!snap.exists) return fail("not_found", 404);
    const q = snap.data() as QuestionDoc;
    const target = typeof q.text === "string" ? pickTarget(room, { uid: q.uid, text: q.text }) : null;
    const persona = target ? getPersonaConfig(target.persona.id) : null;
    if (!target || !persona) return fail("bad_request", 400);
    const now = Date.now();
    if (!q.createdAt || now - q.createdAt.toMillis() > QUESTION_TTL_MS) return fail("expired", 410);
    const { question } = target;

    if (isClearCommand(room, q)) return await clearAndGreet(db, room, persona, q, id);

    /** 대화 기록·기억·호감도는 방을 지운 시각 이후만 본다. */
    const clearedAt = await readClearedAt(db, room.id);
    const clearedAtMs = clearedAt ? clearedAt.toMillis() : null;
    /** 호감도 시각은 앱 서버 시계라 Firestore 서버 시각인 clearedAt 보다 뒤처질 수 있다. 지운 뒤 저장한 값이 지운 이전으로 보이지 않게 맞춘다. */
    const affinityNow = clearedAtMs !== null ? Math.max(now, clearedAtMs + 1) : now;

    /** 작업 문서는 `{messageId}_{personaId}` 로 만든다. 이미 있으면 다른 호출이 처리 중이라 받지 않는다. */
    const timing: Timing = createTiming();
    const logTiming = () => console.log("claude timing", `persona=${persona.info.id}`, timing.line());
    const jobRef = db.collection(room.jobsPath).doc(`${id}_${persona.info.id}`);
    let created: boolean;
    try {
      created = await db.runTransaction(async (tx) => {
        if ((await tx.get(jobRef)).exists) return false;
        tx.set(jobRef, {
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
          askedBy: uid,
          personaId: persona.info.id,
        });
        return true;
      });
    } catch (e) {
      console.error("claude job create failed", errName(e));
      return fail("server_error", 500);
    }
    if (!created) return fail("duplicate", 409);
    timing.note("lag", now - q.createdAt.toMillis());
    timing.lap("accept");
    /** 작업 상태 갱신 실패는 답의 성공·실패를 바꾸지 않는다. 표시는 2분 뒤 사라진다. */
    const mark = (status: JobStatus) =>
      jobRef.update({ status }).then(
        () => {},
        (e: unknown) => {
          console.error("claude job update failed", errName(e));
        },
      );

    /** 주인이 이어서 보낸 메시지가 있으면 이 질문은 건너뛰고, 마지막 메시지의 호출이 한 번에 답한다. */
    try {
      await sleep(DM_SETTLE_MS);
      const newer = await messages.where("createdAt", ">", q.createdAt).orderBy("createdAt").limit(50).get();
      const skip = newer.docs.some((d) => d.data().uid === room.ownerUid);
      timing.lap("settle");
      if (skip) {
        await mark("skipped");
        timing.note("result", "skipped");
        logTiming();
        return Response.json({ skipped: true });
      }
    } catch (e) {
      await mark("failed");
      logTiming();
      throw e;
    }

    const guardP: Promise<GuardResult> = guardScore(q.nickname, question);
    /** 걸린 메시지에는 guarded 를 남겨 기억 판정에서 빠지게 한다. 실패해도 답에는 영향이 없다. */
    const guardMarked = guardP.then(async (g) => {
      if (!isGuarded(g)) return;
      try {
        await messages.doc(id).update({ guarded: true });
      } catch (e) {
        console.error("claude guarded mark failed", errName(e));
      }
    });

    const runBot = async (): Promise<BotResult> => {
      const reply = (text: string) =>
        messages.add({
          text,
          nickname: persona.info.nickname,
          uid: persona.info.uid,
          createdAt: FieldValue.serverTimestamp(),
          replyTo: id,
        });
      try {
        const quota = await consumeClaudeQuota(uid, now);
        timing.lap("quota");
        if (quota !== "ok") {
          await reply(quota === "user" ? persona.replyText.userLimited : persona.replyText.dailyLimited);
          await mark("done");
          timing.note("result", `${quota}_limited`);
          return quota;
        }

        const historyQuery = clearedAt ? messages.where("createdAt", ">", clearedAt) : messages;
        const historySnap = await historyQuery.orderBy("createdAt").endAt(q.createdAt).limitToLast(CONTEXT_SIZE).get();
        const history: CtxMessage[] = historySnap.docs.map((d) => {
          const x = d.data();
          return { id: d.id, uid: x.uid, nickname: x.nickname, text: x.text };
        });
        timing.lap("history");

        /** 기억 꺼내기와 요청 검사는 함께 기다린다. 검사에 걸리면 꺼낸 기억은 쓰지 않는다. */
        const useMemory = persona.useMemory !== false;
        const recallP: Promise<Memory[]> = useMemory
          ? recallMemories(room, q.nickname, question, { clearedAt }).catch((e: unknown) => {
              console.error("recall failed", errName(e));
              timing.note("recall_error", errName(e));
              return [];
            })
          : Promise.resolve([]);
        const [checked, recalled] = await Promise.all([guardP, recallP]);
        if (checked && "guard" in checked) timing.note("guard", checked.guard);
        else if (checked) timing.note("guard_error", checked.error);
        const guarded = isGuarded(checked);
        const memories = guarded ? [] : recalled;
        timing.lap(useMemory ? "recall" : "guard");
        if (useMemory) timing.note("recalled", memories.length);

        /** Jev 점수가 있으면 답 만들기 전에 호감도를 저장하고, 없으면 읽기만 한다. */
        const key = { roomId: room.id, personaId: persona.info.id, uid, now: affinityNow, clearedAtMs };
        let score: number;
        try {
          if (checked && "guard" in checked) {
            const s = affinityScores(checked, typeof q.text === "string" ? q.text : "", guarded);
            const r = await applyAffinity(db, { ...key, pos: s.pos, neg: s.neg });
            score = r.score;
            timing.note("affinity_delta", r.delta.toFixed(3));
          } else {
            score = await readAffinity(db, key);
          }
        } catch (e) {
          console.error("claude affinity failed", `persona=${persona.info.id}`, errName(e));
          timing.note("affinity_error", errName(e));
          score = await readAffinity(db, key).catch(() => AFFINITY_DEFAULT);
        }
        timing.note("affinity", score.toFixed(3));
        timing.lap("affinity_ms");
        const affinity = { nickname: q.nickname, score };

        let text: string;
        try {
          text = await answer({ room, persona, history, memories, guarded, affinity }, { onStep: (n, ms) => timing.note(n, ms) });
          timing.lap("answer");
        } catch (e) {
          timing.lap("answer");
          timing.note("result", "answer_failed");
          console.error("answer failed", `persona=${persona.info.id}`, ...describeError(e));
          await reply(persona.replyText.failed);
          await mark("failed");
          return "failed";
        }
        await reply(text);
        await mark("done");
        timing.lap("reply");
        timing.note("result", "ok");
        return "ok";
      } catch (e) {
        console.error("claude bot failed", `persona=${persona.info.id}`, errName(e));
        timing.note("result", "error");
        await mark("failed");
        return "error";
      }
    };

    let result: BotResult;
    try {
      result = await runBot();
    } finally {
      logTiming();
    }

    await guardMarked;

    if (result === "ok" && persona.useMemory !== false) {
      try {
        const r = await rememberSince(db, room, q.createdAt);
        console.log("claude remember", `judged=${r.judged}`, `saved=${r.saved}`);
      } catch (e) {
        console.error("remember failed", errName(e));
        console.log("claude remember", `error=${errName(e)}`);
      }
    }

    const outcome = decideOutcome([result]);
    if (outcome !== "ok") return fail(outcome.error, outcome.status);
    return Response.json({ ok: true, personas: [persona.info.id] });
  } catch (e) {
    console.error("claude route failed", errName(e));
    return fail("server_error", 500);
  }
}
