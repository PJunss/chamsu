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
const rememberSince = vi.fn<(db: unknown, room: Room, untilMs: number) => Promise<{ judged: number; saved: number }>>();
const sleep = vi.fn<(ms: number) => Promise<void>>();

vi.mock("@/lib/claude/answer", () => ({ answer: (input: AnswerInput) => answer(input) }));
vi.mock("@/lib/claude/limits", () => ({
  consumeClaudeQuota: (uid: string, now: number) => consumeClaudeQuota(uid, now),
}));
vi.mock("@/lib/claude/memory", () => ({
  recallMemories: (db: unknown, room: Room, asker: string, question: string) => recallMemories(db, room, asker, question),
  rememberSince: (db: unknown, room: Room, untilMs: number) => rememberSince(db, room, untilMs),
}));
vi.mock("@/lib/claude/sleep", () => ({ sleep: (ms: number) => sleep(ms) }));

import { POST, maxDuration } from "@/app/api/claude/route";
import { getPersonaConfig } from "@/lib/claude/personas";

const REPLY_TEXT = getPersonaConfig("bianca")!.replyText;
const NOW = Date.UTC(2026, 10, 11, 3, 0);
const OWNER = "n_" + "0123456789abcdef".repeat(2);
const OTHER = "n_" + "fedcba9876543210".repeat(2);
const DM = `dm_bianca_${OWNER}`;
const DM_MESSAGES = `rooms/${DM}/messages`;
const DM_JOBS = `rooms/${DM}/claudeJobs`;

function req(body: unknown) {
  return new Request("http://localhost/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function putMessage(id: string, uid: string, nickname: string, text: string, ms: number, path = "messages") {
  fake.col(path).set(id, { uid, nickname, text, createdAt: ts(ms) });
}

const botReplies = (path = "messages") =>
  [...fake.col(path).values()].filter((m: Data) => m.uid === "claude" && m.replyTo !== undefined);
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
  test("질문자가 봇이면 400", async () => {
    putMessage("b", "claude", "비앙카", "@비앙카 안녕", NOW - 1000);
    expect((await POST(req({ messageId: "b" }))).status).toBe(400);
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
    expect(job("q")?.status).toBe("done");
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
    putMessage("c", "claude", "비앙카", "김밥", NOW - 4000);
    const memories = [{ text: "고수 싫어", nickname: "영희", context: [], createdAt: new Date(NOW - 86_400_000) }];
    recallMemories.mockResolvedValue(memories);
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sleep).not.toHaveBeenCalled();
    const [db, room, asker, question] = recallMemories.mock.calls[0];
    expect(db).toBe(fake.db);
    expect(room.id).toBe("main");
    expect(asker).toBe("철수");
    expect(question).toBe("안녕");
    const input = answer.mock.calls[0][0];
    expect(input.room.id).toBe("main");
    expect(input.persona.info.id).toBe("bianca");
    expect(input.memories).toBe(memories);
    expect(input.history.map((m) => m.id)).toEqual(["a", "c", "q"]);
    expect(botReplies()).toEqual([
      expect.objectContaining({ text: "반가워", nickname: "비앙카", uid: "claude", replyTo: "q" }),
    ]);
    expect(job("q")).toEqual(expect.objectContaining({ status: "done", askedBy: "u1", personaId: "bianca" }));
    expect(rememberSince).toHaveBeenCalledWith(fake.db, expect.objectContaining({ id: "main" }), NOW - 1000);
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
    expect(job("q")?.status).toBe("failed");
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
    expect(job("q")?.status).toBe("done");
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
    expect(job("q")?.status).toBe("failed");
  });
});

describe("POST /api/claude 1:1 방", () => {
  beforeEach(() => {
    putMessage("d1", OWNER, "현석", "오늘 뭐하지", NOW - 1000, DM_MESSAGES);
  });

  test("주인 메시지면 그 방 맥락으로 답하고 답·작업을 그 방 경로에 쓴다", async () => {
    putMessage("d0", "claude", "비앙카", "흐흥", NOW - 3000, DM_MESSAGES);
    putMessage("x", "u1", "철수", "단체방 말", NOW - 2000);
    const res = await POST(req({ roomId: DM, messageId: "d1" }));
    expect(res.status).toBe(200);
    expect(sleep).toHaveBeenCalledWith(1500);
    const input = answer.mock.calls[0][0];
    expect(input.room.id).toBe(DM);
    expect(input.history.map((m) => m.id)).toEqual(["d0", "d1"]);
    expect(recallMemories.mock.calls[0][3]).toBe("오늘 뭐하지");
    expect(botReplies(DM_MESSAGES)).toEqual([
      expect.objectContaining({ text: "반가워", nickname: "비앙카", uid: "claude", replyTo: "d1" }),
    ]);
    expect(botReplies("messages")).toEqual([]);
    expect(job("d1", DM_JOBS)).toEqual(expect.objectContaining({ status: "done", askedBy: OWNER, personaId: "bianca" }));
    expect(job("d1", "claudeJobs")).toBeUndefined();
    expect(rememberSince).toHaveBeenCalledWith(fake.db, expect.objectContaining({ id: DM }), NOW - 1000);
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
    expect(job("d1", DM_JOBS)?.status).toBe("skipped");
    expect(botReplies(DM_MESSAGES)).toEqual([]);
  });

  test("기다리는 동안 온 봇 메시지는 건너뛸 이유가 아니다", async () => {
    sleep.mockImplementation(async () => {
      putMessage("b1", "claude", "비앙카", "앞 답", NOW - 200, DM_MESSAGES);
    });
    expect((await POST(req({ roomId: DM, messageId: "d1" }))).status).toBe(200);
    expect(answer).toHaveBeenCalledTimes(1);
  });
});
