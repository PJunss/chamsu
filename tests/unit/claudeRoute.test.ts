import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeFirestore, ts, type Data } from "./helpers/fakeFirestore";
import type { AnswerInput } from "@/lib/claude/answer";
import type { Memory } from "@/lib/claude/context";
import type { Room } from "@/lib/claude/rooms";
import type { GuardResult } from "@/lib/claude/guard";

let fake: ReturnType<typeof createFakeFirestore>;
let failJobUpdate = false;
let failMessageUpdate = false;

vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => fake.db }));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => ts(Date.now()) },
  Timestamp: { fromMillis: (ms: number) => ts(ms) },
}));

const answer = vi.fn<(input: AnswerInput) => Promise<string>>();
const consumeClaudeQuota = vi.fn<(uid: string, now: number) => Promise<"ok" | "user" | "daily">>();
const recallMemories = vi.fn<(room: Room, asker: string, question: string, deps?: unknown) => Promise<Memory[]>>();
const rememberSince = vi.fn<(db: unknown, room: Room, until: unknown) => Promise<{ judged: number; saved: number }>>();
const sleep = vi.fn<(ms: number) => Promise<void>>();

vi.mock("@/lib/claude/answer", () => ({ answer: (input: AnswerInput) => answer(input) }));
vi.mock("@/lib/claude/limits", () => ({
  consumeClaudeQuota: (uid: string, now: number) => consumeClaudeQuota(uid, now),
}));
vi.mock("@/lib/claude/memory", () => ({
  recallMemories: (room: Room, asker: string, question: string, deps?: unknown) => recallMemories(room, asker, question, deps),
  rememberSince: (db: unknown, room: Room, until: unknown) => rememberSince(db, room, until),
}));
vi.mock("@/lib/claude/sleep", () => ({ sleep: (ms: number) => sleep(ms) }));
const verifyRequestUser = vi.fn<(req: Request) => Promise<string | null>>();
vi.mock("@/lib/authToken", () => ({ verifyRequestUser: (r: Request) => verifyRequestUser(r) }));
const guardScore = vi.fn<(nickname: string, text: string) => Promise<GuardResult>>();
vi.mock("@/lib/claude/guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/claude/guard")>()),
  guardScore: (nickname: string, text: string) => guardScore(nickname, text),
}));

import { POST, maxDuration } from "@/app/api/claude/route";
import { getPersonaConfig } from "@/lib/claude/personas";

const REPLY_TEXT = getPersonaConfig("bianca")!.replyText;
const NOW = Date.UTC(2026, 10, 11, 3, 0);
const OWNER = "ownerUid0000000000000000001";
const OTHER = "otherUid0000000000000000002";
const DM = `${OWNER}_bianca`;
const DM_MESSAGES = `rooms/${DM}/messages`;
const DM_JOBS = `rooms/${DM}/claudeJobs`;
const LUCIA = `${OWNER}_lucia`;
const LUCIA_MESSAGES = `rooms/${LUCIA}/messages`;
const AFF = `${DM}_bianca_${OWNER}`;

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function putMessage(id: string, uid: string, nickname: string, text: string, ms: number, path = DM_MESSAGES) {
  fake.col(path).set(id, { uid, nickname, text, createdAt: ts(ms) });
}

const BOT_UIDS = ["bot_bianca", "bot_lucia"];
const botReplies = (path = DM_MESSAGES) =>
  [...fake.col(path).values()].filter((m: Data) => BOT_UIDS.includes(m.uid as string) && m.replyTo !== undefined);
const job = (id: string, path = DM_JOBS) => fake.col(path).get(id);
const ask = (messageId: string, roomId = DM) => POST(req({ roomId, messageId }));

beforeEach(() => {
  failJobUpdate = false;
  failMessageUpdate = false;
  fake = createFakeFirestore({
    failUpdate: (path) => (failJobUpdate && path.endsWith("claudeJobs")) || (failMessageUpdate && path.endsWith("messages")),
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  answer.mockReset().mockResolvedValue("반가워");
  consumeClaudeQuota.mockReset().mockResolvedValue("ok");
  recallMemories.mockReset().mockResolvedValue([]);
  rememberSince.mockReset().mockResolvedValue({ judged: 0, saved: 0 });
  sleep.mockReset().mockResolvedValue(undefined);
  guardScore.mockReset().mockResolvedValue(null);
  verifyRequestUser.mockReset().mockResolvedValue(OWNER);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.unstubAllEnvs();
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  putMessage("q", OWNER, "준", "안녕", NOW - 1000);
});

describe("POST /api/claude 요청 확인", () => {
  test("함수 시간은 120초", () => expect(maxDuration).toBe(120));
  test("JSON 이 아니면 400", async () => expect((await POST(req("{"))).status).toBe(400));
  test("messageId 가 문자열이 아니면 400", async () => {
    expect((await POST(req({ roomId: DM, messageId: 3 }))).status).toBe(400);
    expect((await POST(req(null))).status).toBe(400);
    expect((await POST(req({ roomId: DM, messageId: "" }))).status).toBe(400);
  });
  test("roomId 가 없으면 400", async () => {
    expect((await POST(req({ messageId: "q" }))).status).toBe(400);
  });
  test("roomId 가 문자열이 아니거나 풀리지 않으면 400", async () => {
    expect((await POST(req({ roomId: 3, messageId: "q" }))).status).toBe(400);
    expect((await ask("q", `${OWNER}_nobody`)).status).toBe(400);
    expect((await ask("q", "main")).status).toBe(400);
    expect((await ask("q", `dm_bianca_${OWNER}`)).status).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  });
  test("토큰이 없거나 틀리면 401 이고 메시지를 읽지 않는다", async () => {
    verifyRequestUser.mockResolvedValue(null);
    expect((await POST(req({ roomId: DM, messageId: "q" }))).status).toBe(401);
    expect(answer).not.toHaveBeenCalled();
    expect(fake.reads).toEqual([]);
  });
  test("남의 방을 부르면 403", async () => {
    verifyRequestUser.mockResolvedValue(OTHER);
    expect((await POST(req({ roomId: DM, messageId: "q" }))).status).toBe(403);
    expect(answer).not.toHaveBeenCalled();
    expect(fake.reads).toEqual([]);
  });
  test("주인이 부르면 답을 쓰고 호감도·한도는 주인 uid 로 센다", async () => {
    expect((await POST(req({ roomId: DM, messageId: "q" }))).status).toBe(200);
    expect(consumeClaudeQuota).toHaveBeenCalledWith(OWNER, NOW);
    expect(botReplies(DM_MESSAGES)).toHaveLength(1);
  });
  test("메시지가 없으면 404", async () => expect((await ask("none")).status).toBe(404));
  test("다른 방 경로의 메시지 id 는 404", async () => {
    putMessage("l1", OWNER, "준", "안녕", NOW - 1000, LUCIA_MESSAGES);
    expect((await ask("l1")).status).toBe(404);
  });
  test("봇이 쓴 메시지로 부르면 400 이고 답하지 않는다", async () => {
    putMessage("b", "bot_bianca", "비앙카", "흐흥", NOW - 1000);
    expect((await ask("b")).status).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  });
  test("주인이 아닌 uid 의 메시지는 400", async () => {
    putMessage("o1", OTHER, "민수", "안녕", NOW - 1000);
    expect((await ask("o1")).status).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  });
  test("2분이 지난 질문은 410", async () => {
    putMessage("old", OWNER, "준", "안녕", NOW - 180_000);
    expect((await ask("old")).status).toBe(410);
    expect(answer).not.toHaveBeenCalled();
  });
});

describe("POST /api/claude 답하기", () => {
  test("같은 질문으로 두 번 부르면 두 번째는 409 이고 답은 한 번만", async () => {
    expect((await ask("q")).status).toBe(200);
    expect((await ask("q")).status).toBe(409);
    expect(answer).toHaveBeenCalledTimes(1);
    expect(botReplies()).toHaveLength(1);
  });
  test("사람당 한도를 넘으면 429 user_limited 와 페르소나 안내 문구", async () => {
    consumeClaudeQuota.mockResolvedValue("user");
    const res = await ask("q");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "user_limited" });
    expect(consumeClaudeQuota).toHaveBeenCalledWith(OWNER, NOW);
    expect(answer).not.toHaveBeenCalled();
    expect(botReplies()).toEqual([expect.objectContaining({ text: REPLY_TEXT.userLimited, replyTo: "q" })]);
    expect(job("q_bianca")?.status).toBe("done");
  });
  test("하루 한도를 넘으면 429 daily_limited", async () => {
    consumeClaudeQuota.mockResolvedValue("daily");
    const res = await ask("q");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_limited" });
    expect(botReplies()).toEqual([expect.objectContaining({ text: REPLY_TEXT.dailyLimited, replyTo: "q" })]);
  });
  test("그 방 맥락·기억으로 답하고 답·작업을 그 방 경로에 쓴다", async () => {
    putMessage("a", OWNER, "준", "점심 뭐 먹지", NOW - 5000);
    putMessage("c", "bot_bianca", "비앙카", "김밥", NOW - 4000);
    putMessage("x", OWNER, "준", "다른 방 말", NOW - 2000, LUCIA_MESSAGES);
    const memories = [{ text: "고수 싫어", nickname: "준", context: [], createdAt: new Date(NOW - 86_400_000) }];
    recallMemories.mockResolvedValue(memories);
    const res = await ask("q");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, personas: ["bianca"] });
    expect(sleep).toHaveBeenCalledWith(1500);
    const [room, asker, question] = recallMemories.mock.calls[0];
    expect(room.id).toBe(DM);
    expect(asker).toBe("준");
    expect(question).toBe("안녕");
    const input = answer.mock.calls[0][0];
    expect(input.room.id).toBe(DM);
    expect(input.persona.info.id).toBe("bianca");
    expect(input.memories).toBe(memories);
    expect(input.history.map((m) => m.id)).toEqual(["a", "c", "q"]);
    expect(botReplies()).toEqual([
      { text: "반가워", nickname: "비앙카", uid: "bot_bianca", createdAt: expect.anything(), replyTo: "q" },
    ]);
    expect(botReplies(LUCIA_MESSAGES)).toEqual([]);
    expect(job("q_bianca")).toEqual(expect.objectContaining({ status: "done", askedBy: OWNER, personaId: "bianca" }));
    expect(job("q")).toBeUndefined();
    expect(rememberSince).toHaveBeenCalledWith(fake.db, expect.objectContaining({ id: DM }), fake.col(DM_MESSAGES).get("q")!.createdAt);
  });
  test("루치아 방은 루치아가 답한다", async () => {
    putMessage("l1", OWNER, "준", "안녕", NOW - 1000, LUCIA_MESSAGES);
    expect((await ask("l1", LUCIA)).status).toBe(200);
    expect(answer.mock.calls[0][0].persona.info.id).toBe("lucia");
    expect(botReplies(LUCIA_MESSAGES)).toEqual([expect.objectContaining({ uid: "bot_lucia", replyTo: "l1" })]);
    expect(botReplies()).toEqual([]);
  });
  test("질문보다 나중 메시지는 맥락에 넣지 않는다", async () => {
    putMessage("later", "bot_bianca", "비앙카", "나중 말", NOW - 500);
    await ask("q");
    expect(answer.mock.calls[0][0].history.map((m) => m.id)).toEqual(["q"]);
  });
  test("맥락은 최근 30개까지", async () => {
    for (let i = 0; i < 40; i++) putMessage(`m${i}`, OWNER, "준", `말${i}`, NOW - 100_000 + i);
    await ask("q");
    const ids = answer.mock.calls[0][0].history.map((m) => m.id);
    expect(ids).toHaveLength(30);
    expect(ids[0]).toBe("m11");
    expect(ids.at(-1)).toBe("q");
  });
  test("답 만들기가 실패하면 502, 실패 문구를 쓰고 job 은 failed, 기억 저장은 하지 않는다", async () => {
    answer.mockRejectedValue(new Error("boom"));
    const res = await ask("q");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "claude_failed" });
    expect(botReplies()).toEqual([expect.objectContaining({ text: REPLY_TEXT.failed, replyTo: "q" })]);
    expect(job("q_bianca")?.status).toBe("failed");
    expect(rememberSince).not.toHaveBeenCalled();
  });
  test("기억 고르기가 throw 해도 기억 없이 답한다", async () => {
    recallMemories.mockRejectedValue(new Error("index"));
    expect((await ask("q")).status).toBe(200);
    expect(answer.mock.calls[0][0].memories).toEqual([]);
  });
  test("기억 저장이 throw 해도 200 이고 답은 쓰인다", async () => {
    rememberSince.mockRejectedValue(new Error("jev_500"));
    const res = await ask("q");
    expect(res.status).toBe(200);
    expect(botReplies()).toEqual([expect.objectContaining({ text: "반가워" })]);
    expect(job("q_bianca")?.status).toBe("done");
  });
  test("답을 쓴 뒤 job 갱신이 실패해도 200 이고 실패 문구를 더 쓰지 않는다", async () => {
    failJobUpdate = true;
    const res = await ask("q");
    expect(res.status).toBe(200);
    expect(botReplies()).toEqual([expect.objectContaining({ text: "반가워", replyTo: "q" })]);
  });
  test("사용량 확인이 실패하면 500 이고 job 은 failed", async () => {
    consumeClaudeQuota.mockRejectedValue(new Error("db"));
    const res = await ask("q");
    expect(res.status).toBe(500);
    expect(answer).not.toHaveBeenCalled();
    expect(job("q_bianca")?.status).toBe("failed");
  });
  test("작업 생성이 실패하면 500 이고 답은 쓰지 않는다", async () => {
    vi.spyOn(fake.db, "runTransaction").mockImplementation(async () => {
      throw new Error("tx");
    });
    const res = await ask("q");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error" });
    expect(job("q_bianca")).toBeUndefined();
    expect(answer).not.toHaveBeenCalled();
    expect(botReplies()).toEqual([]);
    expect(rememberSince).not.toHaveBeenCalled();
  });
  test("답 쓰기가 throw 하면 500 이고 job 은 failed", async () => {
    const collection = fake.db.collection;
    vi.spyOn(fake.db, "collection").mockImplementation((path: string) => {
      const c = collection(path);
      return {
        ...c,
        add: async () => {
          throw new Error("write");
        },
      };
    });
    const res = await ask("q");
    expect(res.status).toBe(500);
    expect(botReplies()).toEqual([]);
    expect(job("q_bianca")?.status).toBe("failed");
  });
  test("기다리는 동안 주인의 새 메시지가 오면 skipped 이고 답하지 않는다", async () => {
    sleep.mockImplementation(async () => {
      putMessage("q2", OWNER, "준", "아 그리고", NOW - 200);
    });
    const res = await ask("q");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: true });
    expect(answer).not.toHaveBeenCalled();
    expect(consumeClaudeQuota).not.toHaveBeenCalled();
    expect(job("q_bianca")?.status).toBe("skipped");
    expect(botReplies()).toEqual([]);
  });
  test("기다리는 동안 온 봇 메시지는 건너뛸 이유가 아니다", async () => {
    sleep.mockImplementation(async () => {
      putMessage("b1", "bot_bianca", "비앙카", "앞 답", NOW - 200);
    });
    expect((await ask("q")).status).toBe(200);
    expect(answer).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/claude 요청 검사", () => {
  const memories = [{ text: "고수 싫어", nickname: "준", context: [], createdAt: new Date(NOW - 86_400_000) }];
  const timingLines = () =>
    vi.mocked(console.log).mock.calls.filter((c) => c[0] === "claude timing").map((c) => c.slice(1).join(" "));

  test("점수가 0.6 이상이면 기억 없이 걸린 질문으로 답하고 답은 방에 쓴다", async () => {
    guardScore.mockResolvedValue({ guard: 0.6, pos: 0, neg: 0, threat: 0 });
    recallMemories.mockResolvedValue(memories);
    expect((await ask("q")).status).toBe(200);
    expect(guardScore).toHaveBeenCalledWith("준", "안녕");
    const input = answer.mock.calls[0][0];
    expect(input.guarded).toBe(true);
    expect(input.memories).toEqual([]);
    expect(botReplies()).toEqual([expect.objectContaining({ text: "반가워", replyTo: "q" })]);
    expect(timingLines()[0]).toContain("guard=0.6");
  });

  test("걸린 메시지에는 guarded 를 남기고, 기억 저장은 그 뒤에 돈다", async () => {
    guardScore.mockResolvedValue({ guard: 0.9, pos: 0, neg: 0, threat: 0 });
    rememberSince.mockImplementation(async () => {
      expect(fake.col(DM_MESSAGES).get("q")?.guarded).toBe(true);
      return { judged: 0, saved: 0 };
    });
    expect((await ask("q")).status).toBe(200);
    expect(fake.col(DM_MESSAGES).get("q")?.guarded).toBe(true);
    expect(rememberSince).toHaveBeenCalledTimes(1);
  });

  test("guarded 남기기가 실패해도 답은 나간다", async () => {
    guardScore.mockResolvedValue({ guard: 0.9, pos: 0, neg: 0, threat: 0 });
    failMessageUpdate = true;
    expect((await ask("q")).status).toBe(200);
    expect(botReplies()).toEqual([expect.objectContaining({ text: "반가워", replyTo: "q" })]);
    expect(console.error).toHaveBeenCalledWith("claude guarded mark failed", "Error");
  });

  test("걸리지 않은 메시지에는 guarded 를 남기지 않는다", async () => {
    guardScore.mockResolvedValue({ guard: 0.59, pos: 0, neg: 0, threat: 0 });
    await ask("q");
    expect(fake.col(DM_MESSAGES).get("q")?.guarded).toBeUndefined();
  });

  test("점수가 0.59 면 걸리지 않고 기억을 쓴다", async () => {
    guardScore.mockResolvedValue({ guard: 0.59, pos: 0, neg: 0, threat: 0 });
    recallMemories.mockResolvedValue(memories);
    await ask("q");
    const input = answer.mock.calls[0][0];
    expect(input.guarded).toBe(false);
    expect(input.memories).toBe(memories);
    expect(timingLines()[0]).toContain("guard=0.59");
  });

  test("키가 없거나 검사가 실패하면 걸리지 않은 것으로 보고 진행한다", async () => {
    recallMemories.mockResolvedValue(memories);
    await ask("q");
    expect(answer.mock.calls[0][0].guarded).toBe(false);
    expect(timingLines()[0]).not.toContain("guard");

    guardScore.mockResolvedValue({ error: "TimeoutError" });
    putMessage("q2", OWNER, "준", "또", NOW - 900);
    expect((await ask("q2")).status).toBe(200);
    expect(answer.mock.calls[1][0].guarded).toBe(false);
    expect(answer.mock.calls[1][0].memories).toBe(memories);
    expect(timingLines()[1]).toContain("guard_error=TimeoutError");
  });
});

describe("POST /api/claude 호감도", () => {
  const aff = (id: string) => fake.col("affinity").get(id);

  test("자기 현재 값으로 변화량을 저장하고 새 값을 답에 넘긴다", async () => {
    guardScore.mockResolvedValue({ guard: 0.01, pos: 0.98, neg: 0, threat: 0 });
    expect((await ask("q")).status).toBe(200);
    expect(aff(AFF)).toEqual(expect.objectContaining({ roomId: DM, personaId: "bianca", uid: OWNER }));
    expect(aff(AFF)?.score).toBeCloseTo(50.49, 10);
    const input = answer.mock.calls[0][0];
    expect(input.affinity?.nickname).toBe("준");
    expect(input.affinity?.score).toBeCloseTo(50.49, 10);
    const lines = vi.mocked(console.log).mock.calls.filter((c) => c[0] === "claude timing").map((c) => c.slice(1).join(" "));
    const bianca = lines.find((l) => l.includes("persona=bianca"))!;
    expect(bianca).toMatch(/affinity_delta=0\.490 .*affinity=50\.490 affinity_ms=\d+/);
    expect(bianca.match(/ affinity=/g)).toHaveLength(1);
  });

  test("값이 높을수록 덜 오른다", async () => {
    guardScore.mockResolvedValue({ guard: 0.01, pos: 0.98, neg: 0, threat: 0 });
    fake.col("affinity").set(AFF, { roomId: DM, personaId: "bianca", uid: OWNER, score: 80, updatedAt: ts(NOW) });
    expect((await ask("q")).status).toBe(200);
    expect(aff(AFF)?.score).toBeCloseTo(80.196, 10);
    expect(answer.mock.calls[0][0].affinity?.score).toBeCloseTo(80.196, 10);
  });

  test("Jev 가 실패하면 호감도를 바꾸지 않고 읽은 값으로 답한다", async () => {
    guardScore.mockResolvedValue({ error: "TimeoutError" });
    fake.col("affinity").set(AFF, { roomId: DM, personaId: "bianca", uid: OWNER, score: 30, updatedAt: ts(NOW) });
    await ask("q");
    expect(aff(AFF)?.score).toBe(30);
    expect(answer.mock.calls[0][0].affinity).toEqual({ nickname: "준", score: 30 });
  });

  test("키가 없고 문서도 없으면 문서를 만들지 않고 50 으로 답한다", async () => {
    await ask("q");
    expect(aff(AFF)).toBeUndefined();
    expect(answer.mock.calls[0][0].affinity).toEqual({ nickname: "준", score: 50 });
  });

  test("호감도 저장이 실패해도 읽은 값으로 답한다", async () => {
    guardScore.mockResolvedValue({ guard: 0, pos: 1, neg: 0, threat: 0 });
    fake.col("affinity").set(AFF, { roomId: DM, personaId: "bianca", uid: OWNER, score: 70, updatedAt: ts(NOW) });
    const original = fake.db.runTransaction;
    vi.spyOn(fake.db, "runTransaction").mockImplementation((fn) =>
      original((tx) =>
        fn({
          ...tx,
          get: async (r) => {
            if (r.path.startsWith("affinity/")) throw new Error("tx");
            return tx.get(r);
          },
        }),
      ),
    );
    expect((await ask("q")).status).toBe(200);
    expect(aff(AFF)?.score).toBe(70);
    expect(answer.mock.calls[0][0].affinity).toEqual({ nickname: "준", score: 70 });
    expect(console.error).toHaveBeenCalledWith("claude affinity failed", "persona=bianca", "Error");
  });

  test("방마다 호감도 문서는 따로다", async () => {
    guardScore.mockResolvedValue({ guard: 0, pos: 0, neg: 1, threat: 0 });
    putMessage("d1", OWNER, "준", "닥쳐", NOW - 900);
    putMessage("l1", OWNER, "준", "닥쳐", NOW - 1000, LUCIA_MESSAGES);
    fake.col(DM_MESSAGES).delete("q");
    await ask("d1");
    await ask("l1", LUCIA);
    expect(aff(AFF)?.score).toBeCloseTo(48.5, 10);
    expect(aff(`${LUCIA}_lucia_${OWNER}`)?.score).toBeCloseTo(48.5, 10);
    expect(aff(AFF)?.roomId).toBe(DM);
  });
});

describe("POST /api/claude /clear", () => {
  const seedRoom = () => {
    putMessage("old1", OWNER, "준", "예전 말", NOW - 60_000);
    putMessage("old2", "bot_bianca", "비앙카", "예전 답", NOW - 50_000);
    fake.col(DM_JOBS).set("old1_bianca", { status: "done" });
    fake.col("affinity").set(AFF, { roomId: DM, personaId: "bianca", uid: OWNER, score: 90, updatedAt: ts(NOW) });
  };
  beforeEach(() => {
    fake.col(DM_MESSAGES).delete("q");
  });

  test("주인의 /clear 는 문서를 지우지 않고 방에 지운 시각을 쓴 뒤 처음 만난 것처럼 인사한다", async () => {
    seedRoom();
    answer.mockResolvedValue("흐흥, 처음 보는 얼굴이로구나.");
    putMessage("c1", OWNER, "준", " /clear ", NOW - 1000);
    const res = await ask("c1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cleared: true });
    expect(sleep).not.toHaveBeenCalled();
    expect(guardScore).not.toHaveBeenCalled();
    expect(rememberSince).not.toHaveBeenCalled();
    expect((fake.col("rooms").get(DM)?.clearedAt as { toMillis: () => number }).toMillis()).toBe(NOW);
    expect(fake.col(DM_JOBS).size).toBe(1);
    expect(fake.col("affinity").has(AFF)).toBe(true);
    expect(fake.col(DM_MESSAGES).has("old1")).toBe(true);
    expect(fake.col(DM_MESSAGES).has("c1")).toBe(true);
    expect(botReplies().filter((m) => m.replyTo === "c1")).toEqual([
      {
        text: "흐흥, 처음 보는 얼굴이로구나.",
        nickname: "비앙카",
        uid: "bot_bianca",
        createdAt: expect.anything(),
        replyTo: "c1",
      },
    ]);
    const input = answer.mock.calls[0][0];
    expect(input.greeting).toEqual({ nickname: "준" });
    expect(input.affinity).toEqual({ nickname: "준", score: 50 });
    expect(input.history).toEqual([]);
    expect(input.memories).toEqual([]);
    expect(console.log).toHaveBeenCalledWith("claude clear", `room=${DM}`, `clearedAt=${NOW}`);
  });

  test("다시 /clear 하면 지운 시각이 바뀐다", async () => {
    putMessage("c1", OWNER, "준", "/clear", NOW - 1000);
    await ask("c1");
    vi.setSystemTime(NOW + 5000);
    putMessage("c2", OWNER, "준", "/clear", NOW + 4000);
    await ask("c2");
    expect((fake.col("rooms").get(DM)?.clearedAt as { toMillis: () => number }).toMillis()).toBe(NOW + 5000);
  });

  test("인사를 만들지 못하면 아무것도 쓰지 않고 200", async () => {
    seedRoom();
    answer.mockRejectedValue(new Error("boom"));
    putMessage("c1", OWNER, "준", "/clear", NOW - 1000);
    const res = await ask("c1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cleared: true });
    expect(fake.col(DM_MESSAGES).size).toBe(3);
    expect(fake.col("rooms").get(DM)?.clearedAt).toBeDefined();
  });

  test("/clear 뒤 질문은 지운 시각 이후 대화·기억·호감도만 쓴다", async () => {
    seedRoom();
    fake.col("rooms").set(DM, { clearedAt: ts(NOW - 10_000) });
    fake.col("affinity").set(AFF, { roomId: DM, personaId: "bianca", uid: OWNER, score: 90, updatedAt: ts(NOW - 20_000) });
    putMessage("new1", OWNER, "준", "새 말", NOW - 5000);
    putMessage("d1", OWNER, "준", "오늘 뭐하지", NOW - 1000);
    expect((await ask("d1")).status).toBe(200);
    const input = answer.mock.calls[0][0];
    expect(input.history.map((m) => m.id)).toEqual(["new1", "d1"]);
    expect(input.affinity).toEqual({ nickname: "준", score: 50 });
    expect(recallMemories.mock.calls[0][3]).toEqual({ clearedAt: fake.col("rooms").get(DM)!.clearedAt });
  });

  test("앱 시계가 지운 시각보다 뒤처져도 /clear 뒤 저장한 호감도가 지운 이전으로 보이지 않는다", async () => {
    guardScore.mockResolvedValue({ guard: 0, pos: 0.98, neg: 0, threat: 0 });
    fake.col("rooms").set(DM, { clearedAt: ts(NOW + 3000) });
    putMessage("d1", OWNER, "준", "고마워", NOW + 4000);
    expect((await ask("d1")).status).toBe(200);
    const saved = fake.col("affinity").get(AFF)!;
    expect((saved.updatedAt as { toMillis: () => number }).toMillis()).toBe(NOW + 3001);
    expect(answer.mock.calls[0][0].affinity?.score).toBeCloseTo(50.49, 10);

    putMessage("d2", OWNER, "준", "안녕", NOW + 4500);
    guardScore.mockResolvedValue({ guard: 0, pos: 0, neg: 0, threat: 0 });
    await ask("d2");
    expect(answer.mock.calls[1][0].affinity?.score).toBeCloseTo(50.49, 3);
  });

  test("방 문서가 없으면 조건 없이 대화 기록을 읽고 호감도도 그대로 쓴다", async () => {
    seedRoom();
    putMessage("d1", OWNER, "준", "오늘 뭐하지", NOW - 1000);
    await ask("d1");
    const input = answer.mock.calls[0][0];
    expect(input.history.map((m) => m.id)).toEqual(["old1", "old2", "d1"]);
    expect(input.affinity).toEqual({ nickname: "준", score: 90 });
    expect(recallMemories.mock.calls[0][3]).toEqual({ clearedAt: null });
  });

  test("주인이 아닌 uid 가 쓴 /clear 메시지는 지우지 않는다", async () => {
    seedRoom();
    putMessage("c1", OTHER, "민수", "/clear", NOW - 1000);
    expect((await ask("c1")).status).toBe(400);
    expect(fake.col(DM_MESSAGES).size).toBe(3);
    expect(fake.col("rooms").get(DM)).toBeUndefined();
  });

  test("/clear 해줘 는 평범한 메시지로 답한다", async () => {
    seedRoom();
    putMessage("c1", OWNER, "준", "/clear 해줘", NOW - 1000);
    expect((await ask("c1")).status).toBe(200);
    expect(answer.mock.calls[0][0].greeting).toBeUndefined();
    expect(fake.col(DM_MESSAGES).has("old1")).toBe(true);
    expect(job("c1_bianca")?.status).toBe("done");
  });
});
