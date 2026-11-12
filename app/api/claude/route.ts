import Anthropic from "@anthropic-ai/sdk";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { after } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { answer } from "@/lib/claude/answer";
import { CHAIN_HEADER, chainOrigin, chainToken, isChainRequest } from "@/lib/claude/chainToken";
import { AFFINITY_DEFAULT, CONTEXT_SIZE, DM_SETTLE_MS, QUESTION_TTL_MS } from "@/lib/claude/constants";
import type { CtxMessage, Memory } from "@/lib/claude/context";
import { consumeClaudeQuota } from "@/lib/claude/limits";
import { recallMemories, rememberSince } from "@/lib/claude/memory";
import { getPersonaConfig, type PersonaConfig } from "@/lib/claude/personas";
import { PERSONAS, isBotUid } from "@/lib/claude/personas/info";
import { affinityNeg } from "@/lib/claude/affinityNeg";
import { applyAffinity, readAffinity } from "@/lib/claude/affinityStore";
import { guardScore, isGuarded, type GuardResult } from "@/lib/claude/guard";
import { decideOutcome, type BotResult } from "@/lib/claude/outcome";
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

type JobStatus = "done" | "failed" | "skipped";

/** 작업 문서를 만든 봇 하나. 봇마다 타이밍 로그 한 줄을 남긴다. */
type BotJob = { persona: PersonaConfig; timing: Timing; mark: (status: JobStatus) => Promise<void> };

/** 연쇄 요청은 접수(202)까지만 기다린다. */
const CHAIN_TIMEOUT_MS = 10_000;

/** 봇 답 메시지마다 자기 /api/claude 를 불러 다음 봇이 잇게 한다. 실패하면 로그만 남기고 연쇄는 거기서 멈춘다. */
async function chainNext(url: URL, roomId: string, messageIds: readonly string[]): Promise<void> {
  await Promise.all(
    messageIds.map(async (messageId) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", [CHAIN_HEADER]: chainToken() },
          body: JSON.stringify({ roomId, messageId }),
          signal: AbortSignal.timeout(CHAIN_TIMEOUT_MS),
        });
        if (res.status !== 202) console.error("claude chain failed", `message=${messageId}`, `status=${res.status}`);
      } catch (e) {
        console.error("claude chain failed", `message=${messageId}`, errName(e));
      }
    }),
  );
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
  const internal = isChainRequest(req);

  try {
    const db = getAdminDb();
    const messages = db.collection(room.messagesPath);
    const snap = await messages.doc(id).get();
    if (!snap.exists) return fail("not_found", 404);
    const q = snap.data() as QuestionDoc;
    if (isBotUid(q.uid) && !internal) return fail("forbidden", 403);
    const target = typeof q.text === "string" ? pickTargets(room, { ...q, text: q.text }, PERSONAS, { internal }) : null;
    const personas = (target?.personas ?? []).map((p) => getPersonaConfig(p.id)).filter((p) => p !== null);
    if (!target || personas.length === 0) return fail("bad_request", 400);
    const now = Date.now();
    if (!q.createdAt || now - q.createdAt.toMillis() > QUESTION_TTL_MS) return fail("expired", 410);
    const { question, chainDepth, chainRootUid } = target;

    /** 작업 문서는 봇마다 `{messageId}_{personaId}` 로 만든다. 이미 있는 봇은 다른 호출이 처리 중이라 건너뛴다. */
    const settled = await Promise.allSettled(
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
    const jobs = settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
    const logTimings = () => {
      for (const j of jobs) console.log("claude timing", `persona=${j.persona.info.id}`, j.timing.line());
    };
    const rejected = settled.find((r) => r.status === "rejected");
    if (rejected) {
      console.error("claude job create failed", errName(rejected.reason));
      await Promise.all(jobs.map((j) => j.mark("failed")));
      for (const j of jobs) j.timing.note("result", "job_create_failed");
      logTimings();
      return fail("server_error", 500);
    }
    if (jobs.length === 0) return fail("duplicate", 409);

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

    /** 실제 답을 쓴 봇의 답 메시지. 다음 연쇄를 고르는 데 쓴다. */
    const answered: { id: string; uid: string; text: string }[] = [];

    const runBot = async ({ persona, timing, mark }: BotJob, guardP: Promise<GuardResult>): Promise<BotResult> => {
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

        /** 기억 꺼내기와 요청 검사는 함께 기다린다. 검사에 걸리면 꺼낸 기억은 쓰지 않는다. */
        const useMemory = persona.useMemory !== false;
        const recallP: Promise<Memory[]> = useMemory
          ? recallMemories(db, room, q.nickname, question).catch((e: unknown) => {
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

        /** 사람 메시지만 호감도를 정한다. Jev 점수가 있으면 답 만들기 전에 저장하고, 없으면 읽기만 한다. */
        let affinity: { nickname: string; score: number } | undefined;
        if (!isBotUid(q.uid)) {
          const key = { roomId: room.id, personaId: persona.info.id, uid: q.uid, now };
          let score: number;
          try {
            if (checked && "guard" in checked) {
              const neg = affinityNeg(checked.neg, typeof q.text === "string" ? q.text : "", guarded);
              const r = await applyAffinity(db, { ...key, pos: checked.pos, neg });
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
          affinity = { nickname: q.nickname, score };
        }

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
        const ref = await reply(text);
        answered.push({ id: ref.id, uid: persona.info.uid, text });
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

    /** 답 만들기·쓰기·기억 저장·다음 연쇄 예약. 사람 요청은 이 결과로 응답하고, 연쇄 요청은 after() 안에서 돌린다. */
    const finish = async (): Promise<Response> => {
      /** 사람 메시지만 요청 하나에 한 번 검사하고, 부른 봇 모두가 같은 결과를 쓴다. */
      const guardP: Promise<GuardResult> = isBotUid(q.uid) ? Promise.resolve(null) : guardScore(q.nickname, question);
      /** 걸린 메시지에는 guarded 를 남겨 기억 판정에서 빠지게 한다. 실패해도 답에는 영향이 없다. */
      const guardMarked = guardP.then(async (g) => {
        if (!isGuarded(g)) return;
        try {
          await messages.doc(id).update({ guarded: true });
        } catch (e) {
          console.error("claude guarded mark failed", errName(e));
        }
      });
      let results: BotResult[];
      try {
        results = await Promise.all(jobs.map((j) => runBot(j, guardP)));
      } finally {
        logTimings();
      }

      await guardMarked;

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

      const next = answered
        .filter((a) => pickTargets(room, { uid: a.uid, text: a.text, chainDepth, chainRootUid }, PERSONAS, { internal: true }))
        .map((a) => a.id);
      if (next.length > 0) {
        const origin = chainOrigin(process.env, req.url);
        if (origin) {
          const url = new URL("/api/claude", origin);
          after(() => chainNext(url, room.id, next));
        } else {
          console.log("claude chain skipped", "reason=no_origin");
        }
      }

      const outcome = decideOutcome(results);
      if (outcome !== "ok") return fail(outcome.error, outcome.status);
      return Response.json({ ok: true, personas: jobs.filter((_, i) => results[i] === "ok").map((j) => j.persona.info.id) });
    };

    if (internal) {
      after(async () => {
        try {
          await finish();
        } catch (e) {
          console.error("claude route failed", errName(e));
        }
      });
      return Response.json({ accepted: jobs.map((j) => j.persona.info.id) }, { status: 202 });
    }
    return await finish();
  } catch (e) {
    console.error("claude route failed", errName(e));
    return fail("server_error", 500);
  }
}
