import Anthropic from "@anthropic-ai/sdk";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { answer } from "@/lib/claude/answer";
import { CONTEXT_SIZE, DM_SETTLE_MS, QUESTION_TTL_MS } from "@/lib/claude/constants";
import type { CtxMessage, Memory } from "@/lib/claude/context";
import { consumeClaudeQuota } from "@/lib/claude/limits";
import { recallMemories, rememberSince } from "@/lib/claude/memory";
import { getPersonaConfig, type PersonaConfig } from "@/lib/claude/personas";
import { MAIN_ROOM_ID, pickTargets, resolveRoom } from "@/lib/claude/rooms";
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

type QuestionDoc = {
  text: unknown;
  uid: string;
  nickname: string;
  createdAt: Timestamp;
  chainDepth?: unknown;
  chainRootUid?: unknown;
};

/** 봇 하나의 처리 결과. user·daily·failed 는 안내 문구를 방에 쓴 경우, error 는 아무것도 쓰지 못한 경우다. */
type BotResult = "ok" | "user" | "daily" | "failed" | "error";

type JobStatus = "done" | "failed" | "skipped";

/** 작업 문서를 만든 봇 하나. 봇마다 타이밍 로그 한 줄을 남긴다. */
type BotJob = { persona: PersonaConfig; timing: Timing; mark: (status: JobStatus) => Promise<void> };

export async function POST(req: Request) {
  let body: { roomId?: unknown; messageId?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", 400);
  }
  const { roomId = MAIN_ROOM_ID, messageId } = body ?? {};
  if (typeof messageId !== "string" || !messageId) return fail("bad_request", 400);
  if (typeof roomId !== "string") return fail("bad_request", 400);
  const room = resolveRoom(roomId);
  if (!room) return fail("bad_request", 400);
  const id = messageId;

  try {
    const db = getAdminDb();
    const messages = db.collection(room.messagesPath);
    const snap = await messages.doc(id).get();
    if (!snap.exists) return fail("not_found", 404);
    const q = snap.data() as QuestionDoc;
    const target = typeof q.text === "string" ? pickTargets(room, { ...q, text: q.text }) : null;
    const personas = (target?.personas ?? []).map((p) => getPersonaConfig(p.id)).filter((p) => p !== null);
    if (!target || personas.length === 0) return fail("bad_request", 400);
    const now = Date.now();
    if (!q.createdAt || now - q.createdAt.toMillis() > QUESTION_TTL_MS) return fail("expired", 410);
    const { question, chainDepth, chainRootUid } = target;

    /** 작업 문서는 봇마다 `{messageId}_{personaId}` 로 만든다. 이미 있는 봇은 다른 호출이 처리 중이라 건너뛴다. */
    const created = await Promise.all(
      personas.map(async (persona): Promise<BotJob | null> => {
        const timing = createTiming();
        const ref = db.collection(room.jobsPath).doc(`${id}_${persona.info.id}`);
        const ok = await db.runTransaction(async (tx) => {
          if ((await tx.get(ref)).exists) return false;
          tx.set(ref, {
            status: "pending",
            createdAt: FieldValue.serverTimestamp(),
            askedBy: chainRootUid,
            personaId: persona.info.id,
          });
          return true;
        });
        if (!ok) return null;
        timing.note("room", room.kind);
        timing.note("lag", now - q.createdAt.toMillis());
        timing.lap("accept");
        /** 작업 상태 갱신 실패는 답의 성공·실패를 바꾸지 않는다. 표시는 2분 뒤 사라진다. */
        const mark = (status: JobStatus) =>
          ref.update({ status }).then(
            () => {},
            (e: unknown) => {
              console.error("claude job update failed", errName(e));
            },
          );
        return { persona, timing, mark };
      }),
    );
    const jobs = created.filter((j) => j !== null);
    if (jobs.length === 0) return fail("duplicate", 409);
    const logTimings = () => {
      for (const j of jobs) console.log("claude timing", `persona=${j.persona.info.id}`, j.timing.line());
    };

    if (room.ownerUid !== null) {
      try {
        await sleep(DM_SETTLE_MS);
        const newer = await messages.where("createdAt", ">", q.createdAt).orderBy("createdAt").limit(50).get();
        const skip = newer.docs.some((d) => d.data().uid === room.ownerUid);
        for (const j of jobs) j.timing.lap("settle");
        if (skip) {
          await Promise.all(jobs.map((j) => j.mark("skipped")));
          for (const j of jobs) j.timing.note("result", "skipped");
          logTimings();
          return Response.json({ skipped: true });
        }
      } catch (e) {
        await Promise.all(jobs.map((j) => j.mark("failed")));
        logTimings();
        throw e;
      }
    }

    const runBot = async ({ persona, timing, mark }: BotJob): Promise<BotResult> => {
      const reply = (text: string) =>
        messages.add({
          text,
          nickname: persona.info.nickname,
          uid: persona.info.uid,
          createdAt: FieldValue.serverTimestamp(),
          replyTo: id,
          chainDepth,
          chainRootUid,
        });
      try {
        const quota = await consumeClaudeQuota(chainRootUid, now);
        timing.lap("quota");
        if (quota !== "ok") {
          await reply(quota === "user" ? persona.replyText.userLimited : persona.replyText.dailyLimited);
          await mark("done");
          timing.note("result", `${quota}_limited`);
          return quota;
        }

        const historySnap = await messages.orderBy("createdAt").endAt(q.createdAt).limitToLast(CONTEXT_SIZE).get();
        const history: CtxMessage[] = historySnap.docs.map((d) => {
          const x = d.data();
          return { id: d.id, uid: x.uid, nickname: x.nickname, text: x.text };
        });
        timing.lap("history");

        let memories: Memory[] = [];
        if (persona.useMemory !== false) {
          try {
            memories = await recallMemories(db, room, q.nickname, question);
          } catch (e) {
            console.error("recall failed", errName(e));
            timing.note("recall_error", errName(e));
          }
          timing.lap("recall");
          timing.note("recalled", memories.length);
        }

        let text: string;
        try {
          text = await answer({ room, persona, history, memories }, { onStep: (n, ms) => timing.note(n, ms) });
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

    let results: BotResult[];
    try {
      results = await Promise.all(jobs.map(runBot));
    } finally {
      logTimings();
    }

    /** 기억 저장은 요청 하나에서 모든 봇의 답을 쓴 뒤 한 번만 돈다. */
    if (jobs.some((j, i) => results[i] === "ok" && j.persona.useMemory !== false)) {
      try {
        const r = await rememberSince(db, room, q.createdAt);
        console.log("claude remember", `judged=${r.judged}`, `saved=${r.saved}`);
      } catch (e) {
        console.error("remember failed", errName(e));
        console.log("claude remember", `error=${errName(e)}`);
      }
    }

    const wrote = jobs.filter((_, i) => results[i] !== "error").map((j) => j.persona.info.id);
    if (wrote.length === 0) return fail("server_error", 500);
    if (results.every((r) => r === "failed")) return fail("claude_failed", 502);
    if (results.every((r) => r === "user")) return fail("user_limited", 429);
    if (results.every((r) => r === "user" || r === "daily")) return fail("daily_limited", 429);
    return Response.json({ ok: true, personas: wrote });
  } catch (e) {
    console.error("claude route failed", errName(e));
    return fail("server_error", 500);
  }
}
