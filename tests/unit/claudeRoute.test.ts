import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeFirestore, ts, type Data } from "./helpers/fakeFirestore";
import type { AnswerInput } from "@/lib/claude/answer";
import type { Memory } from "@/lib/claude/context";
import type { Room } from "@/lib/claude/rooms";

let fake: ReturnType<typeof createFakeFirestore>;
let failJobUpdate = false;

vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => fake.db }));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => ts(Date.now()) },
}));

const answer = vi.fn<(input: AnswerInput) => Promise<string>>();
const consumeClaudeQuota = vi.fn<(uid: string, now: number) => Promise<"ok" | "user" | "daily">>();
const recallMemories = vi.fn<(db: unknown, room: Room, asker: string, question: string) => Promise<Memory[]>>();
const rememberSince = vi.fn<(db: unknown, room: Room, until: unknown) => Promise<{ judged: number; saved: number }>>();
const sleep = vi.fn<(ms: number) => Promise<void>>();

vi.mock("@/lib/claude/answer", () => ({ answer: (input: AnswerInput) => answer(input) }));
vi.mock("@/lib/claude/limits", () => ({
  consumeClaudeQuota: (uid: string, now: number) => consumeClaudeQuota(uid, now),
}));
vi.mock("@/lib/claude/memory", () => ({
  recallMemories: (db: unknown, room: Room, asker: string, question: string) => recallMemories(db, room, asker, question),
  rememberSince: (db: unknown, room: Room, until: unknown) => rememberSince(db, room, until),
}));
vi.mock("@/lib/claude/sleep", () => ({ sleep: (ms: number) => sleep(ms) }));

/** after() 에 넘긴 일. 시험이 runAfter 로 직접 돌린다. 안에서 다시 after() 를 부르면 이어서 돈다. */
const afterTasks: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (task: () => unknown) => void afterTasks.push(task) }));
async function runAfter() {
  while (afterTasks.length > 0) await afterTasks.shift()!();
}
const fetchMock = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>();

import { POST, maxDuration } from "@/app/api/claude/route";
import { getPersonaConfig } from "@/lib/claude/personas";
import { CHAIN_HEADER, chainToken } from "@/lib/claude/chainToken";

const REPLY_TEXT = getPersonaConfig("bianca")!.replyText;
const NOW = Date.UTC(2026, 10, 11, 3, 0);
const OWNER = "n_" + "0123456789abcdef".repeat(2);
const OTHER = "n_" + "fedcba9876543210".repeat(2);
const DM = `dm_bianca_${OWNER}`;
const DM_MESSAGES = `rooms/${DM}/messages`;
const DM_JOBS = `rooms/${DM}/claudeJobs`;

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function putMessage(id: string, uid: string, nickname: string, text: string, ms: number, path = "messages") {
  fake.col(path).set(id, { uid, nickname, text, createdAt: ts(ms) });
}

const BOT_UIDS = ["bot_bianca", "bot_lucia"];
const botReplies = (path = "messages") =>
  [...fake.col(path).values()].filter((m: Data) => BOT_UIDS.includes(m.uid as string) && m.replyTo !== undefined);
const job = (id: string, path = "claudeJobs") => fake.col(path).get(id);

beforeEach(() => {
  failJobUpdate = false;
  fake = createFakeFirestore({ failUpdate: (path) => failJobUpdate && path.endsWith("claudeJobs") });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  answer.mockReset().mockResolvedValue("반가워");
  consumeClaudeQuota.mockReset().mockResolvedValue("ok");
  recallMemories.mockReset().mockResolvedValue([]);
  rememberSince.mockReset().mockResolvedValue({ judged: 0, saved: 0 });
  sleep.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  afterTasks.length = 0;
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  putMessage("q", "u1", "철수", "@비앙카 안녕", NOW - 1000);
});

describe("POST /api/claude 단체방", () => {
  test("함수 시간은 120초", () => expect(maxDuration).toBe(120));
  test("JSON 이 아니면 400", async () => expect((await POST(req("{"))).status).toBe(400));
  test("messageId 가 문자열이 아니면 400", async () => {
    expect((await POST(req({ messageId: 3 }))).status).toBe(400);
    expect((await POST(req(null))).status).toBe(400);
    expect((await POST(req({ messageId: "" }))).status).toBe(400);
  });
  test("roomId 가 문자열이 아니거나 풀리지 않으면 400", async () => {
    expect((await POST(req({ roomId: 3, messageId: "q" }))).status).toBe(400);
    expect((await POST(req({ roomId: "dm_nobody_" + OWNER, messageId: "q" }))).status).toBe(400);
    expect((await POST(req({ roomId: "x", messageId: "q" }))).status).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  });
  test("메시지가 없으면 404", async () => expect((await POST(req({ messageId: "none" }))).status).toBe(404));
  test("부르는 말이 없으면 400 이고 답하지 않는다", async () => {
    putMessage("p", "u1", "철수", "그냥 말", NOW - 1000);
    expect((await POST(req({ roomId: "main", messageId: "p" }))).status).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  });
  test("연쇄 토큰 없이 봇 메시지로 부르면 403", async () => {
    putMessage("b", "bot_bianca", "비앙카", "@루치아 안녕", NOW - 1000);
    expect((await POST(req({ messageId: "b" }))).status).toBe(403);
    expect((await POST(req({ messageId: "b" }, { [CHAIN_HEADER]: "wrong" }))).status).toBe(403);
    expect(answer).not.toHaveBeenCalled();
  });
  test("2분이 지난 질문은 410", async () => {
    putMessage("old", "u1", "철수", "@비앙카 안녕", NOW - 180_000);
    expect((await POST(req({ messageId: "old" }))).status).toBe(410);
    expect(answer).not.toHaveBeenCalled();
  });
  test("같은 질문으로 두 번 부르면 두 번째는 409 이고 답은 한 번만", async () => {
    expect((await POST(req({ messageId: "q" }))).status).toBe(200);
    expect((await POST(req({ messageId: "q" }))).status).toBe(409);
    expect(answer).toHaveBeenCalledTimes(1);
    expect(botReplies()).toHaveLength(1);
  });
  test("사람당 한도를 넘으면 429 user_limited 와 페르소나 안내 문구", async () => {
    consumeClaudeQuota.mockResolvedValue("user");
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "user_limited" });
    expect(consumeClaudeQuota).toHaveBeenCalledWith("u1", NOW);
    expect(answer).not.toHaveBeenCalled();
    expect(botReplies()).toEqual([expect.objectContaining({ text: REPLY_TEXT.userLimited, replyTo: "q" })]);
    expect(job("q_bianca")?.status).toBe("done");
  });
  test("방 전체 한도를 넘으면 429 daily_limited", async () => {
    consumeClaudeQuota.mockResolvedValue("daily");
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_limited" });
    expect(botReplies()).toEqual([expect.objectContaining({ text: REPLY_TEXT.dailyLimited, replyTo: "q" })]);
  });
  test("roomId 를 생략하면 main 이고, 맥락·기억으로 답해 비앙카 이름으로 쓴다", async () => {
    putMessage("a", "u2", "영희", "점심 뭐 먹지", NOW - 5000);
    putMessage("c", "bot_bianca", "비앙카", "김밥", NOW - 4000);
    const memories = [{ text: "고수 싫어", nickname: "영희", context: [], createdAt: new Date(NOW - 86_400_000) }];
    recallMemories.mockResolvedValue(memories);
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, personas: ["bianca"] });
    expect(sleep).not.toHaveBeenCalled();
    const [db, room, asker, question] = recallMemories.mock.calls[0];
    expect(db).toBe(fake.db);
    expect(room.id).toBe("main");
    expect(asker).toBe("철수");
    expect(question).toBe("@비앙카 안녕");
    const input = answer.mock.calls[0][0];
    expect(input.room.id).toBe("main");
    expect(input.persona.info.id).toBe("bianca");
    expect(input.memories).toBe(memories);
    expect(input.history.map((m) => m.id)).toEqual(["a", "c", "q"]);
    expect(botReplies()).toEqual([
      expect.objectContaining({ text: "반가워", nickname: "비앙카", uid: "bot_bianca", replyTo: "q", chainDepth: 1, chainRootUid: "u1" }),
    ]);
    expect(job("q_bianca")).toEqual(expect.objectContaining({ status: "done", askedBy: "u1", personaId: "bianca" }));
    expect(rememberSince).toHaveBeenCalledWith(fake.db, expect.objectContaining({ id: "main" }), fake.col("messages").get("q")!.createdAt);
  });
  test("질문보다 나중 메시지는 맥락에 넣지 않는다", async () => {
    putMessage("later", "u2", "영희", "나중 말", NOW - 500);
    await POST(req({ messageId: "q" }));
    expect(answer.mock.calls[0][0].history.map((m) => m.id)).toEqual(["q"]);
  });
  test("맥락은 최근 30개까지", async () => {
    for (let i = 0; i < 40; i++) putMessage(`m${i}`, "u2", "영희", `말${i}`, NOW - 100_000 + i);
    await POST(req({ messageId: "q" }));
    const ids = answer.mock.calls[0][0].history.map((m) => m.id);
    expect(ids).toHaveLength(30);
    expect(ids[0]).toBe("m11");
    expect(ids.at(-1)).toBe("q");
  });
  test("답 쓰기가 실패하면 502, 실패 문구를 쓰고 job 은 failed, 기억 저장은 하지 않는다", async () => {
    answer.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "claude_failed" });
    expect(botReplies()).toEqual([expect.objectContaining({ text: REPLY_TEXT.failed, replyTo: "q" })]);
    expect(job("q_bianca")?.status).toBe("failed");
    expect(rememberSince).not.toHaveBeenCalled();
  });
  test("기억 고르기가 throw 해도 기억 없이 답한다", async () => {
    recallMemories.mockRejectedValue(new Error("index"));
    expect((await POST(req({ messageId: "q" }))).status).toBe(200);
    expect(answer.mock.calls[0][0].memories).toEqual([]);
  });
  test("기억 저장이 throw 해도 200 이고 답은 쓰인다", async () => {
    rememberSince.mockRejectedValue(new Error("jev_500"));
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(200);
    expect(botReplies()).toEqual([expect.objectContaining({ text: "반가워" })]);
    expect(job("q_bianca")?.status).toBe("done");
  });
  test("답을 쓴 뒤 job 갱신이 실패해도 200 이고 실패 문구를 더 쓰지 않는다", async () => {
    failJobUpdate = true;
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(200);
    expect(botReplies()).toEqual([expect.objectContaining({ text: "반가워", replyTo: "q" })]);
  });
  test("사용량 확인이 실패하면 500 이고 job 은 failed", async () => {
    consumeClaudeQuota.mockRejectedValue(new Error("db"));
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(500);
    expect(answer).not.toHaveBeenCalled();
    expect(job("q_bianca")?.status).toBe("failed");
  });
});

describe("POST /api/claude 단체방 여러 봇과 연쇄", () => {
  const LUCIA_TEXT = getPersonaConfig("lucia")!.replyText;
  beforeEach(() => {
    putMessage("m2", "u1", "철수", "@비앙카 @루치아 안녕", NOW - 1000);
    answer.mockImplementation(async (input) => `${input.persona.info.nickname} 답`);
  });

  test("두 봇을 부른 메시지는 봇마다 작업을 만들고 따로 답한다", async () => {
    const res = await POST(req({ messageId: "m2" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, personas: ["bianca", "lucia"] });
    expect(answer).toHaveBeenCalledTimes(2);
    for (const call of answer.mock.calls) expect(call[0].history.map((m) => m.id)).toEqual(["q", "m2"]);
    expect(botReplies()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "비앙카 답", uid: "bot_bianca", replyTo: "m2", chainDepth: 1, chainRootUid: "u1" }),
        expect.objectContaining({ text: "루치아 답", uid: "bot_lucia", replyTo: "m2", chainDepth: 1, chainRootUid: "u1" }),
      ]),
    );
    expect(botReplies()).toHaveLength(2);
    expect(job("m2_bianca")).toEqual(expect.objectContaining({ status: "done", askedBy: "u1", personaId: "bianca" }));
    expect(job("m2_lucia")).toEqual(expect.objectContaining({ status: "done", askedBy: "u1", personaId: "lucia" }));
    expect(job("m2")).toBeUndefined();
    expect(rememberSince).toHaveBeenCalledTimes(1);
  });

  test("한 봇만 이미 작업이 있으면 다른 봇만 답하고 200", async () => {
    fake.col("claudeJobs").set("m2_bianca", { status: "pending", personaId: "bianca" });
    const res = await POST(req({ messageId: "m2" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, personas: ["lucia"] });
    expect(botReplies()).toEqual([expect.objectContaining({ uid: "bot_lucia", replyTo: "m2" })]);
  });

  test("두 봇 모두 이미 작업이 있으면 409 이고 답하지 않는다", async () => {
    fake.col("claudeJobs").set("m2_bianca", { status: "pending" });
    fake.col("claudeJobs").set("m2_lucia", { status: "pending" });
    expect((await POST(req({ messageId: "m2" }))).status).toBe(409);
    expect(answer).not.toHaveBeenCalled();
    expect(rememberSince).not.toHaveBeenCalled();
  });

  test("한 봇이 답에 실패하면 그 봇만 실패 안내를 쓰고 나머지는 답한다", async () => {
    answer.mockImplementation(async (input) => {
      if (input.persona.info.id === "bianca") throw new Error("boom");
      return "루치아 답";
    });
    const res = await POST(req({ messageId: "m2" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, personas: ["lucia"] });
    expect(botReplies()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uid: "bot_bianca", text: REPLY_TEXT.failed, chainDepth: 1, chainRootUid: "u1" }),
        expect.objectContaining({ uid: "bot_lucia", text: "루치아 답" }),
      ]),
    );
    expect(job("m2_bianca")?.status).toBe("failed");
    expect(job("m2_lucia")?.status).toBe("done");
    expect(rememberSince).toHaveBeenCalledTimes(1);
  });

  test("두 봇 모두 답에 실패하면 502", async () => {
    answer.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ messageId: "m2" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "claude_failed" });
    expect(job("m2_bianca")?.status).toBe("failed");
    expect(job("m2_lucia")?.status).toBe("failed");
    expect(botReplies().map((m) => m.text).sort()).toEqual([LUCIA_TEXT.failed, REPLY_TEXT.failed].sort());
    expect(rememberSince).not.toHaveBeenCalled();
  });

  test("한 봇의 작업 생성이 실패하면 만든 작업을 모두 failed 로 두고 500, 답은 쓰지 않는다", async () => {
    const original = fake.db.runTransaction;
    vi.spyOn(fake.db, "runTransaction").mockImplementation((fn) =>
      original((tx) =>
        fn({
          ...tx,
          get: async (r) => {
            if (r.id === "m2_lucia") throw new Error("tx");
            return tx.get(r);
          },
        }),
      ),
    );
    const res = await POST(req({ messageId: "m2" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error" });
    expect(job("m2_bianca")?.status).toBe("failed");
    expect(job("m2_lucia")).toBeUndefined();
    expect(answer).not.toHaveBeenCalled();
    expect(botReplies()).toEqual([]);
    expect(rememberSince).not.toHaveBeenCalled();
  });

  test("한 봇의 답 쓰기가 throw 해도 다른 봇이 답하면 200 이고 실패 봇 작업은 failed", async () => {
    const collection = fake.db.collection;
    vi.spyOn(fake.db, "collection").mockImplementation((path: string) => {
      const c = collection(path);
      return {
        ...c,
        add: async (data: Data) => {
          if (data.uid === "bot_lucia") throw new Error("write");
          return c.add(data);
        },
      };
    });
    const res = await POST(req({ messageId: "m2" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, personas: ["bianca"] });
    expect(botReplies()).toEqual([expect.objectContaining({ uid: "bot_bianca", text: "비앙카 답" })]);
    expect(job("m2_bianca")?.status).toBe("done");
    expect(job("m2_lucia")?.status).toBe("failed");
  });

  test("한 봇은 실패 안내, 다른 봇은 아무것도 못 쓰면 502", async () => {
    answer.mockRejectedValue(new Error("boom"));
    const collection = fake.db.collection;
    vi.spyOn(fake.db, "collection").mockImplementation((path: string) => {
      const c = collection(path);
      return {
        ...c,
        add: async (data: Data) => {
          if (data.uid === "bot_lucia") throw new Error("write");
          return c.add(data);
        },
      };
    });
    const res = await POST(req({ messageId: "m2" }));
    expect(res.status).toBe(502);
    expect(botReplies()).toEqual([expect.objectContaining({ uid: "bot_bianca", text: REPLY_TEXT.failed })]);
  });

  test("두 봇을 부른 요청에서 기억 저장은 한 번만 돈다", async () => {
    expect((await POST(req({ messageId: "m2" }))).status).toBe(200);
    expect(answer).toHaveBeenCalledTimes(2);
    expect(rememberSince).toHaveBeenCalledTimes(1);
  });

  const chain = () => ({ [CHAIN_HEADER]: chainToken() });
  const putBot = (id: string, uid: string, text: string, chainDepth: number) =>
    fake.col("messages").set(id, { uid, nickname: "봇", text, createdAt: ts(NOW - 500), chainDepth, chainRootUid: "u1" });

  test("토큰이 맞는 봇 메시지는 작업을 만들고 202, 답은 after 에서 단계를 올려 쓴다", async () => {
    putBot("b3", "bot_bianca", "@루치아 너는?", 3);
    const res = await POST(req({ messageId: "b3" }, chain()));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: ["lucia"] });
    expect(job("b3_lucia")).toEqual(expect.objectContaining({ status: "pending", askedBy: "u1", personaId: "lucia" }));
    expect(answer).not.toHaveBeenCalled();
    await runAfter();
    expect(consumeClaudeQuota).toHaveBeenCalledWith("u1", NOW);
    expect(job("b3_lucia")?.status).toBe("done");
    expect(botReplies().filter((m) => m.replyTo === "b3")).toEqual([
      expect.objectContaining({ uid: "bot_lucia", chainDepth: 4, chainRootUid: "u1" }),
    ]);
    expect(rememberSince).toHaveBeenCalledTimes(1);
  });

  test("토큰이 맞아도 chainDepth 4 인 봇 메시지는 400 이고 답하지 않는다", async () => {
    putBot("b4", "bot_bianca", "@루치아 너는?", 4);
    expect((await POST(req({ messageId: "b4" }, chain()))).status).toBe(400);
    await runAfter();
    expect(answer).not.toHaveBeenCalled();
  });

  test("토큰이 맞아도 봇이 자기 자신만 부른 메시지는 400", async () => {
    putBot("self", "bot_bianca", "나 @비앙카 야", 1);
    expect((await POST(req({ messageId: "self" }, chain()))).status).toBe(400);
  });

  test("답이 다른 봇을 부르면 after 에서 내부 요청을 한 번 보낸다", async () => {
    answer.mockResolvedValue("@루치아 너는 어때?");
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    await runAfter();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const reply = botReplies().find((m) => m.replyTo === "q")!;
    const replyId = [...fake.col("messages").entries()].find(([, m]) => m === reply)?.[0];
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://localhost/api/claude");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json", [CHAIN_HEADER]: chainToken() });
    expect(JSON.parse(init.body as string)).toEqual({ roomId: "main", messageId: replyId });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("단계 4 인 답은 다른 봇을 불러도 내부 요청을 보내지 않는다", async () => {
    putBot("b3", "bot_lucia", "@비앙카 너는?", 3);
    answer.mockResolvedValue("@루치아 너도?");
    expect((await POST(req({ messageId: "b3" }, chain()))).status).toBe(202);
    await runAfter();
    expect(botReplies().filter((m) => m.replyTo === "b3")).toEqual([expect.objectContaining({ chainDepth: 4 })]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("답이 자기 자신만 부르면 내부 요청을 보내지 않는다", async () => {
    answer.mockResolvedValue("나 @비앙카 는 잘 지내");
    await POST(req({ messageId: "q" }));
    await runAfter();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("내부 요청이 실패하거나 202 가 아니면 throw 없이 로그만 남긴다", async () => {
    answer.mockResolvedValue("@루치아 너는 어때?");
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect((await POST(req({ messageId: "q" }))).status).toBe(200);
    await expect(runAfter()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("claude chain failed", expect.stringMatching(/^message=/), "Error");

    putMessage("q2", "u1", "철수", "@비앙카 또", NOW - 900);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
    expect((await POST(req({ messageId: "q2" }))).status).toBe(200);
    await runAfter();
    expect(console.error).toHaveBeenCalledWith("claude chain failed", expect.stringMatching(/^message=/), "status=409");
  });
});

describe("POST /api/claude 1:1 방", () => {
  beforeEach(() => {
    putMessage("d1", OWNER, "현석", "오늘 뭐하지", NOW - 1000, DM_MESSAGES);
  });

  test("주인 메시지면 그 방 맥락으로 답하고 답·작업을 그 방 경로에 쓴다", async () => {
    putMessage("d0", "bot_bianca", "비앙카", "흐흥", NOW - 3000, DM_MESSAGES);
    putMessage("x", "u1", "철수", "단체방 말", NOW - 2000);
    const res = await POST(req({ roomId: DM, messageId: "d1" }));
    expect(res.status).toBe(200);
    expect(sleep).toHaveBeenCalledWith(1500);
    const input = answer.mock.calls[0][0];
    expect(input.room.id).toBe(DM);
    expect(input.history.map((m) => m.id)).toEqual(["d0", "d1"]);
    expect(recallMemories.mock.calls[0][3]).toBe("오늘 뭐하지");
    expect(botReplies(DM_MESSAGES)).toEqual([
      expect.objectContaining({ text: "반가워", nickname: "비앙카", uid: "bot_bianca", replyTo: "d1" }),
    ]);
    expect(botReplies("messages")).toEqual([]);
    expect(job("d1_bianca", DM_JOBS)).toEqual(expect.objectContaining({ status: "done", askedBy: OWNER, personaId: "bianca" }));
    expect(job("d1_bianca", "claudeJobs")).toBeUndefined();
    expect(rememberSince).toHaveBeenCalledWith(fake.db, expect.objectContaining({ id: DM }), fake.col(DM_MESSAGES).get("d1")!.createdAt);
  });

  test("주인이 아닌 uid 의 메시지는 400", async () => {
    putMessage("o1", OTHER, "민수", "안녕", NOW - 1000, DM_MESSAGES);
    expect((await POST(req({ roomId: DM, messageId: "o1" }))).status).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  });

  test("다른 방 경로의 메시지 id 는 404", async () => {
    expect((await POST(req({ roomId: DM, messageId: "q" }))).status).toBe(404);
  });

  test("기다리는 동안 주인의 새 메시지가 오면 skipped 이고 답하지 않는다", async () => {
    sleep.mockImplementation(async () => {
      putMessage("d2", OWNER, "현석", "아 그리고", NOW - 200, DM_MESSAGES);
    });
    const res = await POST(req({ roomId: DM, messageId: "d1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: true });
    expect(answer).not.toHaveBeenCalled();
    expect(consumeClaudeQuota).not.toHaveBeenCalled();
    expect(job("d1_bianca", DM_JOBS)?.status).toBe("skipped");
    expect(botReplies(DM_MESSAGES)).toEqual([]);
  });

  test("기다리는 동안 온 봇 메시지는 건너뛸 이유가 아니다", async () => {
    sleep.mockImplementation(async () => {
      putMessage("b1", "bot_bianca", "비앙카", "앞 답", NOW - 200, DM_MESSAGES);
    });
    expect((await POST(req({ roomId: DM, messageId: "d1" }))).status).toBe(200);
    expect(answer).toHaveBeenCalledTimes(1);
  });
});
