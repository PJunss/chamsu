import Anthropic from "@anthropic-ai/sdk";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { askClaude } from "@/lib/claude/client";
import { CONTEXT_SIZE, QUESTION_TTL_MS } from "@/lib/claude/constants";
import { buildClaudeMessages, type CtxMessage } from "@/lib/claude/context";
import { consumeClaudeQuota } from "@/lib/claude/limits";
import { REPLY_TEXT } from "@/lib/claude/reply";
import { getPersonaConfig } from "@/lib/claude/personas";
import { findPersonaByTrigger, isBotUid } from "@/lib/claude/personas/info";

const fail = (error: string, status: number) => Response.json({ error }, { status });

/** 서버 로그에 남길 오류 종류와 상태 코드. 키·본문은 남기지 않는다. */
function describeError(e: unknown): [string, number | ""] {
  if (e instanceof Anthropic.RateLimitError) return ["rate_limit", e.status ?? ""];
  if (e instanceof Anthropic.APIError) return ["api_error", e.status ?? ""];
  return [e instanceof Error ? e.name : "unknown", ""];
}

export async function POST(req: Request) {
  let messageId: unknown;
  try {
    ({ messageId } = await req.json());
  } catch {
    return fail("bad_request", 400);
  }
  if (typeof messageId !== "string" || !messageId) return fail("bad_request", 400);
  const id = messageId;

  try {
    const db = getAdminDb();
    const snap = await db.collection("messages").doc(id).get();
    if (!snap.exists) return fail("not_found", 404);
    const q = snap.data() as { text: string; uid: string; nickname: string; createdAt: Timestamp };
    const target = typeof q.text === "string" ? findPersonaByTrigger(q.text) : null;
    if (!target) return fail("bad_request", 400);
    if (isBotUid(q.uid)) return fail("bad_request", 400);
    const persona = getPersonaConfig(target.persona.id);
    if (!persona) return fail("bad_request", 400);
    const now = Date.now();
    if (!q.createdAt || now - q.createdAt.toMillis() > QUESTION_TTL_MS) return fail("expired", 410);

    const jobRef = db.collection("claudeJobs").doc(id);
    const created = await db.runTransaction(async (tx) => {
      if ((await tx.get(jobRef)).exists) return false;
      tx.set(jobRef, { status: "pending", createdAt: FieldValue.serverTimestamp(), askedBy: q.uid });
      return true;
    });
    if (!created) return fail("duplicate", 409);

    const reply = (text: string) =>
      db.collection("messages").add({
        text,
        nickname: persona.info.nickname,
        uid: persona.info.uid,
        createdAt: FieldValue.serverTimestamp(),
        replyTo: id,
      });
    /** 작업 상태 갱신 실패는 답의 성공·실패를 바꾸지 않는다. 표시는 2분 뒤 사라진다. */
    const markJob = (status: "done" | "failed") =>
      jobRef.update({ status }).catch((e: unknown) => {
        console.error("claude job update failed", e instanceof Error ? e.name : "unknown");
      });

    try {
      const quota = await consumeClaudeQuota(q.uid, now);
      if (quota !== "ok") {
        await reply(quota === "user" ? REPLY_TEXT.userLimited : REPLY_TEXT.dailyLimited);
        await markJob("done");
        return fail(quota === "user" ? "user_limited" : "daily_limited", 429);
      }

      const historySnap = await db
        .collection("messages")
        .orderBy("createdAt")
        .endAt(q.createdAt)
        .limitToLast(CONTEXT_SIZE)
        .get();
      const history: CtxMessage[] = historySnap.docs.map((d) => {
        const x = d.data();
        return { id: d.id, uid: x.uid, nickname: x.nickname, text: x.text };
      });

      let answer: string;
      try {
        answer = await askClaude(persona.character, buildClaudeMessages(history));
      } catch (e) {
        console.error("claude failed", ...describeError(e));
        await reply(REPLY_TEXT.failed);
        await markJob("failed");
        return fail("claude_failed", 502);
      }
      await reply(answer);
      await markJob("done");
      return Response.json({ ok: true });
    } catch (e) {
      await markJob("failed");
      throw e;
    }
  } catch (e) {
    console.error("claude route failed", e instanceof Error ? e.name : "unknown");
    return fail("server_error", 500);
  }
}
