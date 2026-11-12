import { beforeEach, expect, test, vi } from "vitest";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { createFakeFirestore } from "./helpers/fakeFirestore";
import { judgeRange, pickMemories, recallMemories, rememberSince, type StoredMemory } from "@/lib/claude/memory";
import { resolveRoom } from "@/lib/claude/rooms";
import type { askJev as AskJev } from "@/lib/claude/jev";

const env = { TYPESAFE_API_KEY: "key-test" } as unknown as NodeJS.ProcessEnv;
const UID = "n_" + "0123456789abcdef".repeat(2);
const main = resolveRoom("main")!;
const dm = resolveRoom(`dm_bianca_${UID}`)!;
const T0 = Date.UTC(2026, 10, 11, 3, 0);

let fake: ReturnType<typeof createFakeFirestore>;
const db = () => fake.db as unknown as Firestore;
beforeEach(() => {
  fake = createFakeFirestore();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const mem = (id: string, score: number, ms = T0): StoredMemory => ({
  id, text: id, nickname: "철수", context: [], createdAt: new Date(ms), score,
});

test("pickMemories: 기준 미만 제외, 점수 순 최대 5개", () => {
  const c = [mem("a", 0), mem("b", 0), mem("c", 0), mem("d", 0), mem("e", 0), mem("f", 0), mem("g", 0)];
  const scores = { k0: 0.3, k1: 0.9, k2: 0.24, k3: 0.5, k4: 0.6, k5: 0.7, k6: 0.25 };
  const out = pickMemories(scores, c);
  expect(out.map((m) => m.id)).toEqual(["b", "f", "e", "d", "a"]);
  expect(out[0].score).toBe(0.9);
  expect(pickMemories({}, [])).toEqual([]);
  expect(pickMemories({ k0: 0.1 }, [mem("a", 0)])).toEqual([]);
});

const jm = (id: string, uid: string, nickname: string, text: string, ms: number) => ({
  id, uid, nickname, text, createdAtMs: ms,
});

test("judgeRange: 봇 제외, 앞 사람 메시지 최대 2개를 context 로", () => {
  const isBot = (u: string) => u === "claude";
  const { targets, context } = judgeRange(
    [
      jm("1", "a", "철수", "하나", 1),
      jm("2", "claude", "비앙카", "봇말", 2),
      jm("3", "b", "영희", "둘", 3),
      jm("4", "a", "철수", "셋", 4),
      jm("5", "b", "영희", "넷", 5),
    ],
    isBot,
  );
  expect(targets.map((t) => t.id)).toEqual(["1", "3", "4", "5"]);
  expect(context.get("1")).toEqual([]);
  expect(context.get("3")).toEqual(["철수: 하나"]);
  expect(context.get("4")).toEqual(["철수: 하나", "영희: 둘"]);
  expect(context.get("5")).toEqual(["영희: 둘", "철수: 셋"]);
  expect(context.has("2")).toBe(false);
});

function putMsg(path: string, id: string, uid: string, nickname: string, text: string, ms: number) {
  fake.col(path).set(id, { uid, nickname, text, createdAt: Timestamp.fromMillis(ms) });
}

/** 질문 id 순서대로 점수를 주는 가짜 Jev. 메시지 본문이 점수 표에 있으면 그 값, 없으면 0. */
function fakeJev(table: Record<string, number>) {
  return vi.fn<typeof AskJev>(async (_state, questions) => {
    const out: Record<string, number> = {};
    for (const [k, q] of Object.entries(questions)) {
      const line = q.instructions.message ?? "";
      const text = line.slice(line.indexOf(": ") + 2);
      out[k] = table[text] ?? 0;
    }
    return out;
  });
}

test("rememberSince: 0.8 이상만 원문 그대로 저장하고 lastJudgedAt 을 범위 끝으로", async () => {
  putMsg("messages", "m1", "a", "민수", "생일 언제야?", T0);
  putMsg("messages", "m2", "b", "현석", "내 생일 3월 14일임", T0 + 1000);
  putMsg("messages", "m3", "claude", "비앙카", "기억하마", T0 + 2000);
  putMsg("messages", "m4", "a", "민수", "고수 별로", T0 + 3000);
  putMsg("messages", "m5", "a", "민수", "나중 말", T0 + 9000);
  const askJev = fakeJev({ "내 생일 3월 14일임": 0.8, "고수 별로": 0.79 });
  const r = await rememberSince(db(), main, T0 + 3000, { askJev, env });
  expect(r).toEqual({ judged: 3, saved: 1 });
  expect(askJev).toHaveBeenCalledTimes(1);
  expect(askJev.mock.calls[0][0]).toBe(main.judgeState);
  const q = Object.values(askJev.mock.calls[0][1]);
  expect(q[0]).toEqual({
    type: "noul",
    instructions: {
      message: "민수: 생일 언제야?",
      question:
        "이 채팅 메시지에 나중에도 기억해 둘 만한, 말한 사람이나 그 주변 사람에 대한 오래 가는 사실(취향, 생일, 직장, 계획, 약속 등)이 들어 있는가?",
    },
  });
  expect(JSON.stringify(askJev.mock.calls[0][1])).not.toContain("기억하마");
  expect(JSON.stringify(askJev.mock.calls[0][1])).not.toContain("나중 말");
  const saved = fake.col("memories");
  expect([...saved.keys()]).toEqual(["main_m2"]);
  const doc = saved.get("main_m2")!;
  expect(doc).toEqual({
    text: "내 생일 3월 14일임",
    nickname: "현석",
    uid: "b",
    context: ["민수: 생일 언제야?"],
    roomId: "main",
    messageId: "m2",
    createdAt: expect.anything(),
    score: 0.8,
  });
  expect((doc.createdAt as Timestamp).toMillis()).toBe(T0 + 1000);
  expect((fake.col("memoryState").get("main")!.lastJudgedAt as Timestamp).toMillis()).toBe(T0 + 3000);
});

test("rememberSince: 지난 판단 이후만 읽고, lastJudgedAt 은 줄지 않는다", async () => {
  putMsg("messages", "m1", "a", "민수", "옛말", T0);
  putMsg("messages", "m2", "a", "민수", "새말", T0 + 1000);
  fake.col("memoryState").set("main", { lastJudgedAt: Timestamp.fromMillis(T0) });
  const askJev = fakeJev({});
  expect(await rememberSince(db(), main, T0 + 1000, { askJev, env })).toEqual({ judged: 1, saved: 0 });
  expect(JSON.stringify(askJev.mock.calls[0][1])).not.toContain("옛말");
  expect((fake.col("memoryState").get("main")!.lastJudgedAt as Timestamp).toMillis()).toBe(T0 + 1000);
});

test("rememberSince: 범위가 비면 아무것도 쓰지 않는다", async () => {
  fake.col("memoryState").set("main", { lastJudgedAt: Timestamp.fromMillis(T0) });
  putMsg("messages", "m1", "a", "민수", "옛말", T0);
  const askJev = fakeJev({});
  expect(await rememberSince(db(), main, T0, { askJev, env })).toEqual({ judged: 0, saved: 0 });
  expect(askJev).not.toHaveBeenCalled();
  expect(fake.col("memories").size).toBe(0);
});

test("rememberSince: 600개는 300개씩 두 번 판단한다", async () => {
  for (let i = 0; i < 650; i++) putMsg("messages", `m${i}`, "a", "민수", `말${i}`, T0 + i);
  const askJev = fakeJev({ 말60: 0.9 });
  const r = await rememberSince(db(), main, T0 + 649, { askJev, env });
  expect(askJev).toHaveBeenCalledTimes(2);
  expect(Object.keys(askJev.mock.calls[0][1])).toHaveLength(300);
  expect(Object.keys(askJev.mock.calls[1][1])).toHaveLength(300);
  expect(r.judged).toBe(600);
  expect(JSON.stringify(askJev.mock.calls)).not.toContain('"민수: 말49"');
  expect([...fake.col("memories").keys()]).toEqual(["main_m60"]);
  expect((fake.col("memoryState").get("main")!.lastJudgedAt as Timestamp).toMillis()).toBe(T0 + 649);
});

test("rememberSince: 두 번째 묶음이 실패하면 memoryState 를 그대로 두고 throw", async () => {
  for (let i = 0; i < 600; i++) putMsg("messages", `m${i}`, "a", "민수", `말${i}`, T0 + i);
  fake.col("memoryState").set("main", { lastJudgedAt: Timestamp.fromMillis(T0 - 1) });
  let n = 0;
  const askJev = vi.fn<typeof AskJev>(async () => {
    if (++n === 2) throw new Error("jev_500");
    return {};
  });
  await expect(rememberSince(db(), main, T0 + 599, { askJev, env })).rejects.toThrow("jev_500");
  expect((fake.col("memoryState").get("main")!.lastJudgedAt as Timestamp).toMillis()).toBe(T0 - 1);
});

test("rememberSince: 1:1 방은 그 방 메시지만 읽고 그 방 id 로 저장한다", async () => {
  putMsg("messages", "x1", "a", "민수", "단체방 말", T0);
  putMsg(dm.messagesPath, "d1", UID, "현석", "나 다음 달 이직해", T0);
  const askJev = fakeJev({ "나 다음 달 이직해": 0.93, "단체방 말": 0.99 });
  await rememberSince(db(), dm, T0, { askJev, env });
  expect(askJev.mock.calls[0][0]).toBe(dm.judgeState);
  expect(JSON.stringify(askJev.mock.calls)).not.toContain("단체방 말");
  expect([...fake.col("memories").keys()]).toEqual([`${dm.id}_d1`]);
  expect(fake.col("memories").get(`${dm.id}_d1`)!.roomId).toBe(dm.id);
  expect(fake.reads).not.toContain("messages");
  expect(fake.col("memoryState").has(dm.id)).toBe(true);
});

test("rememberSince: 키가 없으면 아무것도 하지 않는다", async () => {
  putMsg("messages", "m1", "a", "민수", "생일 3월", T0);
  const askJev = fakeJev({});
  expect(await rememberSince(db(), main, T0, { askJev, env: {} as NodeJS.ProcessEnv })).toEqual({ judged: 0, saved: 0 });
  expect(askJev).not.toHaveBeenCalled();
});

function putMemory(id: string, roomId: string, nickname: string, text: string, ms: number, context: string[] = []) {
  fake.col("memories").set(id, { text, nickname, uid: "x", context, roomId, messageId: id, createdAt: Timestamp.fromMillis(ms), score: 0.9 });
}

test("recallMemories: 그 방 기억만 후보로 보내고 고른 것을 오래된 순으로", async () => {
  putMemory("a", "main", "현석", "생일 3월 14일", T0, ["민수: 생일?"]);
  putMemory("b", "main", "영희", "고수 싫어", T0 + 1000);
  putMemory("c", "main", "철수", "이사 감", T0 + 2000);
  putMemory("z", dm.id, "현석", "비밀 얘기", T0 + 3000);
  const askJev = vi.fn<typeof AskJev>(async (state, questions) => {
    expect(state).toBe("민수: 현석 생일 언제?");
    const texts = Object.values(questions).map((q) => q.instructions.memory);
    expect(texts).toEqual(["철수: 이사 감", "영희: 고수 싫어", "현석: 생일 3월 14일"]);
    expect(questions.k0.instructions.question).toBe("이 기억이 위 채팅 질문에 답하는 데 직접 도움이 되는가?");
    return { k0: 0.5, k1: 0.1, k2: 0.92 };
  });
  const out = await recallMemories(db(), main, "민수", "현석 생일 언제?", { askJev, env });
  expect(out).toEqual([
    { text: "생일 3월 14일", nickname: "현석", context: ["민수: 생일?"], createdAt: new Date(T0) },
    { text: "이사 감", nickname: "철수", context: [], createdAt: new Date(T0 + 2000) },
  ]);
});

test("recallMemories: 키가 없거나 후보가 없으면 Jev 를 부르지 않는다", async () => {
  const askJev = vi.fn<typeof AskJev>();
  putMemory("a", "main", "현석", "생일", T0);
  expect(await recallMemories(db(), main, "민수", "q", { askJev, env: {} as NodeJS.ProcessEnv })).toEqual([]);
  expect(await recallMemories(db(), dm, "민수", "q", { askJev, env })).toEqual([]);
  expect(askJev).not.toHaveBeenCalled();
});

test("recallMemories: Jev 가 실패하면 빈 목록", async () => {
  putMemory("a", "main", "현석", "생일", T0);
  const askJev = vi.fn<typeof AskJev>(async () => {
    throw new Error("jev_500");
  });
  expect(await recallMemories(db(), main, "민수", "q", { askJev, env })).toEqual([]);
});
