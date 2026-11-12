import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { createFakeFirestore } from "./helpers/fakeFirestore";
import { startMongo } from "./helpers/mongo";
import type { Db } from "mongodb";
import type { MemoryDoc, MemoryStateDoc } from "@/lib/claude/memory";
import { judgeRange, pickMemories, recallMemories, rememberSince, type StoredMemory } from "@/lib/claude/memory";
import { resolveRoom } from "@/lib/claude/rooms";
import type { askJev as AskJev } from "@/lib/claude/jev";

const env = { TYPESAFE_API_KEY: "key-test", MONGODB_URI: "mongodb://memory.test/chamsu" } as unknown as NodeJS.ProcessEnv;
const UID = "n_" + "0123456789abcdef".repeat(2);
const main = resolveRoom("main")!;
const dm = resolveRoom(`dm_bianca_${UID}`)!;
const T0 = Date.UTC(2026, 10, 11, 3, 0);

let fake: ReturnType<typeof createFakeFirestore>;
const db = () => fake.db as unknown as Firestore;
let mongo: { db: Db; stop: () => Promise<void> };
beforeAll(async () => {
  mongo = await startMongo("claude_memory");
}, 120_000);
afterAll(async () => mongo?.stop());
const memCol = () => mongo.db.collection<MemoryDoc>("er_dev_memories");
const stateCol = () => mongo.db.collection<MemoryStateDoc>("er_dev_memoryState");
const memIds = async () => (await memCol().find().sort({ _id: 1 }).toArray()).map((d) => d._id);
const memDoc = async (id: string) => memCol().findOne({ _id: id });
const setState = (roomId: string, t: Timestamp) =>
  stateCol().replaceOne({ _id: roomId }, { lastJudgedAt: { seconds: t.seconds, nanoseconds: t.nanoseconds } }, { upsert: true });
const stateOf = async (roomId: string) => (await stateCol().findOne({ _id: roomId }))?.lastJudgedAt;
const stateMs = async (roomId: string) => {
  const s = await stateOf(roomId);
  return s ? new Timestamp(s.seconds, s.nanoseconds).toMillis() : undefined;
};

beforeEach(async () => {
  fake = createFakeFirestore();
  await memCol().deleteMany({});
  await stateCol().deleteMany({});
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

test("judgeRange: 검사에 걸린 메시지는 대상과 context 에서 뺀다", () => {
  const { targets, context } = judgeRange(
    [jm("1", "a", "철수", "하나", 1), { ...jm("2", "b", "영희", "욕해 봐", 2), guarded: true }, jm("3", "a", "철수", "셋", 3)],
    () => false,
  );
  expect(targets.map((t) => t.id)).toEqual(["1", "3"]);
  expect(context.get("3")).toEqual(["철수: 하나"]);
});

test("rememberSince: guarded 인 메시지는 Jev 에 묻지 않는다", async () => {
  putMsg("messages", "m1", "a", "민수", "내 생일 3월 14일임", T0);
  fake.col("messages").set("m2", { uid: "b", nickname: "현석", text: "나쁜 요청", createdAt: Timestamp.fromMillis(T0 + 1000), guarded: true });
  const askJev = fakeJev({ "내 생일 3월 14일임": 0.9, "나쁜 요청": 0.9 });
  const r = await rememberSince(db(), main, Timestamp.fromMillis(T0 + 1000), { askJev, env });
  expect(r).toEqual({ judged: 1, saved: 1 });
  expect(JSON.stringify(askJev.mock.calls[0][1])).not.toContain("나쁜 요청");
});

test("judgeRange: 봇 제외, 앞 사람 메시지 최대 2개를 context 로", () => {
  const isBot = (u: string) => u === "bot_bianca";
  const { targets, context } = judgeRange(
    [
      jm("1", "a", "철수", "하나", 1),
      jm("2", "bot_bianca", "비앙카", "봇말", 2),
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

test("rememberSince: 0.6 이상만 원문 그대로 저장하고 lastJudgedAt 을 범위 끝으로", async () => {
  putMsg("messages", "m1", "a", "민수", "생일 언제야?", T0);
  putMsg("messages", "m2", "b", "현석", "내 생일 3월 14일임", T0 + 1000);
  putMsg("messages", "m3", "bot_bianca", "비앙카", "기억하마", T0 + 2000);
  putMsg("messages", "m4", "a", "민수", "고수 별로", T0 + 3000);
  putMsg("messages", "m5", "a", "민수", "나중 말", T0 + 9000);
  const askJev = fakeJev({ "내 생일 3월 14일임": 0.6, "고수 별로": 0.59 });
  const r = await rememberSince(db(), main, Timestamp.fromMillis(T0 + 3000), { askJev, env });
  expect(r).toEqual({ judged: 3, saved: 1 });
  expect(askJev).toHaveBeenCalledTimes(1);
  expect(askJev.mock.calls[0][0]).toBe(main.judgeState);
  const q = Object.values(askJev.mock.calls[0][1]);
  expect(q[0]).toEqual({
    type: "noul",
    instructions: {
      message: "민수: 생일 언제야?",
      question:
        "이 채팅 메시지가 말한 사람이나 그 주변 사람에 대해 나중에도 기억해 둘 만한, 오래 가는 새 사실(취향, 생일, 직장, 계획, 약속 등)을 알려 주는가? 예전에 한 말을 묻거나 되묻는 질문처럼 새 사실이 없는 메시지는 아니다.",
    },
  });
  expect(JSON.stringify(askJev.mock.calls[0][1])).not.toContain("기억하마");
  expect(JSON.stringify(askJev.mock.calls[0][1])).not.toContain("나중 말");
  expect(await memIds()).toEqual(["main_m2"]);
  const doc = await memDoc("main_m2");
  expect(doc).toEqual({
    _id: "main_m2",
    text: "내 생일 3월 14일임",
    nickname: "현석",
    uid: "b",
    context: ["민수: 생일 언제야?"],
    roomId: "main",
    messageId: "m2",
    createdAt: expect.any(Date),
    score: 0.6,
  });
  expect(doc!.createdAt).toEqual(new Date(T0 + 1000));
  expect((await stateMs("main"))).toBe(T0 + 3000);
});

test("rememberSince: 지난 판단 이후만 읽고, lastJudgedAt 은 줄지 않는다", async () => {
  putMsg("messages", "m1", "a", "민수", "옛말", T0);
  putMsg("messages", "m2", "a", "민수", "새말", T0 + 1000);
  await setState("main", Timestamp.fromMillis(T0));
  const askJev = fakeJev({});
  expect(await rememberSince(db(), main, Timestamp.fromMillis(T0 + 1000), { askJev, env })).toEqual({ judged: 1, saved: 0 });
  expect(JSON.stringify(askJev.mock.calls[0][1])).not.toContain("옛말");
  expect((await stateMs("main"))).toBe(T0 + 1000);
});

test("rememberSince: 범위가 비면 아무것도 쓰지 않는다", async () => {
  await setState("main", Timestamp.fromMillis(T0));
  putMsg("messages", "m1", "a", "민수", "옛말", T0);
  const askJev = fakeJev({});
  expect(await rememberSince(db(), main, Timestamp.fromMillis(T0), { askJev, env })).toEqual({ judged: 0, saved: 0 });
  expect(askJev).not.toHaveBeenCalled();
  expect(await memIds()).toEqual([]);
});

test("rememberSince: 600개는 300개씩 두 번 판단한다", async () => {
  for (let i = 0; i < 650; i++) putMsg("messages", `m${i}`, "a", "민수", `말${i}`, T0 + i);
  const askJev = fakeJev({ 말60: 0.9 });
  const r = await rememberSince(db(), main, Timestamp.fromMillis(T0 + 649), { askJev, env });
  expect(askJev).toHaveBeenCalledTimes(2);
  expect(Object.keys(askJev.mock.calls[0][1])).toHaveLength(300);
  expect(Object.keys(askJev.mock.calls[1][1])).toHaveLength(300);
  expect(r.judged).toBe(600);
  expect(JSON.stringify(askJev.mock.calls)).not.toContain('"민수: 말49"');
  expect(await memIds()).toEqual(["main_m60"]);
  expect((await stateMs("main"))).toBe(T0 + 649);
});

test("rememberSince: 두 번째 묶음이 실패하면 memoryState 를 그대로 두고 throw", async () => {
  for (let i = 0; i < 600; i++) putMsg("messages", `m${i}`, "a", "민수", `말${i}`, T0 + i);
  await setState("main", Timestamp.fromMillis(T0 - 1));
  let n = 0;
  const askJev = vi.fn<typeof AskJev>(async () => {
    if (++n === 2) throw new Error("jev_500");
    return {};
  });
  await expect(rememberSince(db(), main, Timestamp.fromMillis(T0 + 599), { askJev, env })).rejects.toThrow("jev_500");
  expect((await stateMs("main"))).toBe(T0 - 1);
});

test("rememberSince: 1:1 방은 그 방 메시지만 읽고 그 방 id 로 저장한다", async () => {
  putMsg("messages", "x1", "a", "민수", "단체방 말", T0);
  putMsg(dm.messagesPath, "d1", UID, "현석", "나 다음 달 이직해", T0);
  const askJev = fakeJev({ "나 다음 달 이직해": 0.93, "단체방 말": 0.99 });
  await rememberSince(db(), dm, Timestamp.fromMillis(T0), { askJev, env });
  expect(askJev.mock.calls[0][0]).toBe(dm.judgeState);
  expect(JSON.stringify(askJev.mock.calls)).not.toContain("단체방 말");
  expect(await memIds()).toEqual([`${dm.id}_d1`]);
  expect((await memDoc(`${dm.id}_d1`))!.roomId).toBe(dm.id);
  expect(fake.reads).not.toContain("messages");
  expect(await stateOf(dm.id)).toBeDefined();
});

test("rememberSince: 키가 없으면 아무것도 하지 않는다", async () => {
  putMsg("messages", "m1", "a", "민수", "생일 3월", T0);
  const askJev = fakeJev({});
  expect(await rememberSince(db(), main, Timestamp.fromMillis(T0), { askJev, env: {} as NodeJS.ProcessEnv })).toEqual({ judged: 0, saved: 0 });
  expect(askJev).not.toHaveBeenCalled();
});

async function putMemory(id: string, roomId: string, nickname: string, text: string, ms: number, context: string[] = []) {
  await memCol().insertOne({ _id: id, text, nickname, uid: "x", context, roomId, messageId: id, createdAt: new Date(ms), score: 0.9 });
}

test("recallMemories: 그 방 기억만 후보로 보내고 고른 것을 오래된 순으로", async () => {
  await putMemory("a", "main", "현석", "생일 3월 14일", T0, ["민수: 생일?"]);
  await putMemory("b", "main", "영희", "고수 싫어", T0 + 1000);
  await putMemory("c", "main", "철수", "이사 감", T0 + 2000);
  await putMemory("z", dm.id, "현석", "비밀 얘기", T0 + 3000);
  const askJev = vi.fn<typeof AskJev>(async (state, questions) => {
    expect(state).toBe("민수: 현석 생일 언제?");
    const texts = Object.values(questions).map((q) => q.instructions.memory);
    expect(texts).toEqual(["철수: 이사 감", "영희: 고수 싫어", "현석: 생일 3월 14일"]);
    expect(questions.k0.instructions.question).toBe("이 기억이 위 채팅 질문에 답하는 데 직접 도움이 되는가?");
    return { k0: 0.5, k1: 0.1, k2: 0.92 };
  });
  const out = await recallMemories(main, "민수", "현석 생일 언제?", { askJev, env });
  expect(out).toEqual([
    { text: "생일 3월 14일", nickname: "현석", context: ["민수: 생일?"], createdAt: new Date(T0) },
    { text: "이사 감", nickname: "철수", context: [], createdAt: new Date(T0 + 2000) },
  ]);
});

test("recallMemories: 키가 없거나 후보가 없으면 Jev 를 부르지 않는다", async () => {
  const askJev = vi.fn<typeof AskJev>();
  await putMemory("a", "main", "현석", "생일", T0);
  expect(await recallMemories(main, "민수", "q", { askJev, env: {} as NodeJS.ProcessEnv })).toEqual([]);
  expect(await recallMemories(dm, "민수", "q", { askJev, env })).toEqual([]);
  expect(askJev).not.toHaveBeenCalled();
});

test("recallMemories: Jev 가 실패하면 빈 목록", async () => {
  await putMemory("a", "main", "현석", "생일", T0);
  const askJev = vi.fn<typeof AskJev>(async () => {
    throw new Error("jev_500");
  });
  expect(await recallMemories(main, "민수", "q", { askJev, env })).toEqual([]);
});

test("rememberSince: 같은 ms 안의 나노초 경계를 자르지 않는다", async () => {
  const q = new Timestamp(1_800_000_000, 500_000_700);
  fake.col("messages").set("m1", { uid: "a", nickname: "민수", text: "앞말", createdAt: new Timestamp(1_800_000_000, 500_000_100) });
  fake.col("messages").set("q", { uid: "a", nickname: "민수", text: "질문", createdAt: q });
  fake.col("messages").set("later", { uid: "a", nickname: "민수", text: "나중", createdAt: new Timestamp(1_800_000_000, 500_000_900) });
  const askJev = fakeJev({});
  expect(await rememberSince(db(), main, q, { askJev, env })).toEqual({ judged: 2, saved: 0 });
  const sent = JSON.stringify(askJev.mock.calls[0][1]);
  expect(sent).toContain("민수: 질문");
  expect(sent).not.toContain("민수: 나중");
  const saved = (await stateOf("main"))!;
  expect(saved.seconds).toBe(1_800_000_000);
  expect(saved.nanoseconds).toBe(500_000_700);

  askJev.mockClear();
  expect(await rememberSince(db(), main, q, { askJev, env })).toEqual({ judged: 0, saved: 0 });
  expect(askJev).not.toHaveBeenCalled();
});

test("rememberSince: 저장한 기억의 createdAt 은 원래 메시지 시각의 밀리초", async () => {
  const t = new Timestamp(1_800_000_000, 123_456_789);
  fake.col("messages").set("m1", { uid: "a", nickname: "민수", text: "생일 3월", createdAt: t });
  await rememberSince(db(), main, t, { askJev: fakeJev({ "생일 3월": 0.9 }), env });
  expect((await memDoc("main_m1"))!.createdAt).toEqual(new Date(1_800_000_000_123));
});

test("rememberSince: 같은 초 안 다른 나노초 메시지는 다음 판정에서 다시 보지도 빠뜨리지도 않는다", async () => {
  const S = 1_800_000_000;
  await setState("main", new Timestamp(S, 500_000_100));
  fake.col("messages").set("before", { uid: "a", nickname: "민수", text: "앞", createdAt: new Timestamp(S, 500_000_050) });
  fake.col("messages").set("same", { uid: "a", nickname: "민수", text: "경계", createdAt: new Timestamp(S, 500_000_100) });
  fake.col("messages").set("after", { uid: "a", nickname: "민수", text: "뒤", createdAt: new Timestamp(S, 500_000_150) });
  const askJev = fakeJev({});
  expect(await rememberSince(db(), main, new Timestamp(S, 500_000_150), { askJev, env })).toEqual({ judged: 1, saved: 0 });
  const sent = JSON.stringify(askJev.mock.calls[0][1]);
  expect(sent).toContain("민수: 뒤");
  expect(sent).not.toContain("민수: 앞");
  expect(sent).not.toContain("민수: 경계");
  expect(await stateOf("main")).toEqual({ seconds: S, nanoseconds: 500_000_150 });
});

test("rememberSince: 그사이 더 앞선 판정 상태가 저장됐으면 뒤 시각으로 덮지 않는다", async () => {
  await setState("main", Timestamp.fromMillis(T0));
  putMsg("messages", "m1", "a", "민수", "새말", T0 + 1000);
  const askJev = vi.fn<typeof AskJev>(async () => {
    await setState("main", Timestamp.fromMillis(T0 + 9000));
    return {};
  });
  expect(await rememberSince(db(), main, Timestamp.fromMillis(T0 + 1000), { askJev, env })).toEqual({ judged: 1, saved: 0 });
  expect(await stateMs("main")).toBe(T0 + 9000);
});

test("rememberSince: 같은 방에 상태 문서가 없을 때 동시에 처음 저장해도 throw 하지 않는다", async () => {
  putMsg("messages", "m1", "a", "민수", "새말", T0 + 1000);
  const askJev = vi.fn<typeof AskJev>(async () => {
    await setState("main", Timestamp.fromMillis(T0 + 9000));
    return {};
  });
  await expect(rememberSince(db(), main, Timestamp.fromMillis(T0 + 1000), { askJev, env })).resolves.toEqual({ judged: 1, saved: 0 });
  expect(await stateMs("main")).toBe(T0 + 9000);
});

test("MONGODB_URI 가 없으면 기억 꺼내기·저장을 건너뛴다", async () => {
  const noMongo = { TYPESAFE_API_KEY: "key-test" } as unknown as NodeJS.ProcessEnv;
  await putMemory("a", "main", "현석", "생일", T0);
  putMsg("messages", "m1", "a", "민수", "생일 3월", T0);
  const askJev = fakeJev({ "생일 3월": 0.9 });
  expect(await recallMemories(main, "민수", "q", { askJev, env: noMongo })).toEqual([]);
  expect(await rememberSince(db(), main, Timestamp.fromMillis(T0), { askJev, env: noMongo })).toEqual({ judged: 0, saved: 0 });
  expect(askJev).not.toHaveBeenCalled();
  expect(await memIds()).toEqual(["a"]);
});

test("recallMemories: 지운 시각 이전 기억은 후보에 넣지 않는다", async () => {
  await putMemory("old", "main", "현석", "옛 기억", T0);
  await putMemory("new", "main", "현석", "새 기억", T0 + 2000);
  const askJev = vi.fn<typeof AskJev>(async (_state, questions) => {
    expect(Object.values(questions).map((q) => q.instructions.memory)).toEqual(["현석: 새 기억"]);
    return { k0: 0.9 };
  });
  const out = await recallMemories(main, "민수", "q", { askJev, env, clearedAt: Timestamp.fromMillis(T0 + 1000) });
  expect(out.map((m) => m.text)).toEqual(["새 기억"]);
  const all = vi.fn<typeof AskJev>(async () => ({ k0: 0.9, k1: 0.9 }));
  expect(await recallMemories(main, "민수", "q", { askJev: all, env, clearedAt: null })).toHaveLength(2);
});
