import Anthropic from "@anthropic-ai/sdk";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { answer } from "@/lib/claude/answer";
import { CONTEXT_SIZE, DM_SETTLE_MS, QUESTION_TTL_MS } from "@/lib/claude/constants";
import type { CtxMessage, Memory } from "@/lib/claude/context";
import { consumeClaudeQuota } from "@/lib/claude/limits";
import { recallMemories, rememberSince } from "@/lib/claude/memory";
import { getPersonaConfig } from "@/lib/claude/personas";
import { MAIN_ROOM_ID, pickTargets, resolveRoom } from "@/lib/claude/rooms";
import { sleep } from "@/lib/claude/sleep";
import { createTiming } from "@/lib/claude/timing";

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

  const timing = createTiming();
  try {
    const db = getAdminDb();
    const messages = db.collection(room.messagesPath);
    const snap = await messages.doc(id).get();
    if (!snap.exists) return fail("not_found", 404);
    const q = snap.data() as { text: unknown; uid: string; nickname: string; createdAt: Timestamp; chainDepth?: unknown; chainRootUid?: unknown };
    const target = typeof q.text === "string" ? pickTargets(room, { ...q, text: q.text }) : null;
    const persona = target ? getPersonaConfig(target.personas[0].id) : null;
    if (!target || !persona) return fail("bad_request", 400);
    const now = Date.now();
    if (!q.createdAt || now - q.createdAt.toMillis() > QUESTION_TTL_MS) return fail("expired", 410);

    const jobRef = db.collection(room.jobsPath).doc(id);
    const created = await db.runTransaction(async (tx) => {
      if ((await tx.get(jobRef)).exists) return false;
      tx.set(jobRef, {
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        askedBy: q.uid,
        personaId: persona.info.id,
      });
      return true;
    });
    if (!created) return fail("duplicate", 409);
    timing.note("room", room.kind);
    timing.note("lag", now - q.createdAt.toMillis());
    timing.lap("accept");

    const reply = (text: string) =>
      messages.add({
        text,
        nickname: persona.info.nickname,
        uid: persona.info.uid,
        createdAt: FieldValue.serverTimestamp(),
        replyTo: id,
      });
    /** 작업 상태 갱신 실패는 답의 성공·실패를 바꾸지 않는다. 표시는 2분 뒤 사라진다. */
    const markJob = (status: "done" | "failed" | "skipped") =>
      jobRef.update({ status }).catch((e: unknown) => {
        console.error("claude job update failed", errName(e));
      });

    try {
      if (room.ownerUid !== null) {
        await sleep(DM_SETTLE_MS);
        const newer = await messages.where("createdAt", ">", q.createdAt).orderBy("createdAt").limit(50).get();
        if (newer.docs.some((d) => d.data().uid === room.ownerUid)) {
          await markJob("skipped");
          timing.lap("settle");
          timing.note("result", "skipped");
          return Response.json({ skipped: true });
        }
        timing.lap("settle");
      }

      const quota = await consumeClaudeQuota(q.uid, now);
      timing.lap("quota");
      if (quota !== "ok") {
        await reply(quota === "user" ? persona.replyText.userLimited : persona.replyText.dailyLimited);
        await markJob("done");
        return fail(quota === "user" ? "user_limited" : "daily_limited", 429);
      }

      const historySnap = await messages.orderBy("createdAt").endAt(q.createdAt).limitToLast(CONTEXT_SIZE).get();
      const history: CtxMessage[] = historySnap.docs.map((d) => {
        const x = d.data();
        return { id: d.id, uid: x.uid, nickname: x.nickname, text: x.text };
      });
      timing.lap("history");

      const useMemory = persona.useMemory !== false;
      let memories: Memory[] = [];
      if (useMemory) {
        try {
          memories = await recallMemories(db, room, q.nickname, target.question);
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
        console.error("answer failed", ...describeError(e));
        await reply(persona.replyText.failed);
        await markJob("failed");
        return fail("claude_failed", 502);
      }
      await reply(text);
      await markJob("done");
      timing.lap("reply");

      if (useMemory) {
        try {
          const r = await rememberSince(db, room, q.createdAt);
          timing.note("judged", r.judged);
          timing.note("saved", r.saved);
        } catch (e) {
          console.error("remember failed", errName(e));
          timing.note("remember_error", errName(e));
        }
        timing.lap("remember");
      }
      timing.note("result", "ok");
      return Response.json({ ok: true });
    } catch (e) {
      await markJob("failed");
      throw e;
    } finally {
      console.log("claude timing", timing.line());
    }
  } catch (e) {
    console.error("claude route failed", errName(e));
    return fail("server_error", 500);
  }
}
