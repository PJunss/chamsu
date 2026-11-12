import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { Db } from "mongodb";
import { MONGO_TEST_ENV, startMongo } from "./helpers/mongo";
import { setMongoDbForTest } from "@/lib/mongo";
import type { Firestore } from "firebase-admin/firestore";
import { createFakeFirestore, ts } from "./helpers/fakeFirestore";
import { isClearCommand } from "@/lib/claude/clear";
import { clearRoom } from "@/lib/claude/clearRoom";
import { dmRoomId, resolveRoom } from "@/lib/claude/rooms";

const OWNER = "n_" + "0123456789abcdef".repeat(2);
const OTHER = "n_" + "fedcba9876543210".repeat(2);
const dm = resolveRoom(dmRoomId("bianca", OWNER))!;
const otherDm = resolveRoom(dmRoomId("bianca", OTHER))!;
const main = resolveRoom("main")!;

test("1:1 방 주인의 /clear 만 지우기 명령이다", () => {
  expect(isClearCommand(dm, { uid: OWNER, text: "/clear" })).toBe(true);
  expect(isClearCommand(dm, { uid: OWNER, text: "  /clear \n" })).toBe(true);
  expect(isClearCommand(dm, { uid: OWNER, text: "/clear 해줘" })).toBe(false);
  expect(isClearCommand(dm, { uid: OWNER, text: "/CLEAR" })).toBe(false);
  expect(isClearCommand(dm, { uid: OTHER, text: "/clear" })).toBe(false);
  expect(isClearCommand(dm, { uid: OWNER, text: 3 })).toBe(false);
  expect(isClearCommand(main, { uid: OWNER, text: "/clear" })).toBe(false);
});

let fake: ReturnType<typeof createFakeFirestore>;
let mongo: { db: Db; stop: () => Promise<void> };
beforeAll(async () => {
  mongo = await startMongo("claude_clear");
}, 120_000);
afterAll(async () => mongo?.stop());
const memCol = () => mongo.db.collection<{ _id: string; roomId: string; text: string }>("er_dev_memories");
const stateCol = () => mongo.db.collection<{ _id: string; lastJudgedAt: { seconds: number; nanoseconds: number } }>("er_dev_memoryState");
const fdb = () => fake.db as unknown as Firestore;
beforeEach(async () => {
  fake = createFakeFirestore();
  setMongoDbForTest(mongo.db);
  vi.restoreAllMocks();
  await memCol().deleteMany({});
  await stateCol().deleteMany({});
});

test("그 방의 메시지·작업·기억·기억 상태·호감도만 지우고 다른 방은 남긴다", async () => {
  for (const r of [dm, otherDm, main]) {
    fake.col(r.messagesPath).set("m1", { uid: OWNER, text: "x", createdAt: ts(1) });
    fake.col(r.messagesPath).set("m2", { uid: "bot_bianca", text: "y", createdAt: ts(2) });
    fake.col(r.jobsPath).set("m1_bianca", { status: "done" });
    await memCol().insertOne({ _id: `${r.id}_m1`, roomId: r.id, text: "x" });
    await stateCol().insertOne({ _id: r.id, lastJudgedAt: { seconds: 1, nanoseconds: 0 } });
    fake.col("affinity").set(`${r.id}_bianca_${OWNER}`, { roomId: r.id, uid: OWNER, score: 70 });
  }
  const counts = await clearRoom(fdb(), dm, MONGO_TEST_ENV);
  expect(counts).toEqual({ messages: 2, jobs: 1, memories: 1, affinity: 1 });
  expect(fake.col(dm.messagesPath).size).toBe(0);
  expect(fake.col(dm.jobsPath).size).toBe(0);
  expect(await memCol().findOne({ _id: `${dm.id}_m1` })).toBeNull();
  expect(await stateCol().findOne({ _id: dm.id })).toBeNull();
  expect(fake.col("affinity").has(`${dm.id}_bianca_${OWNER}`)).toBe(false);
  for (const r of [otherDm, main]) {
    expect(fake.col(r.messagesPath).size).toBe(2);
    expect(fake.col(r.jobsPath).size).toBe(1);
    expect(await memCol().findOne({ _id: `${r.id}_m1` })).not.toBeNull();
    expect(await stateCol().findOne({ _id: r.id })).not.toBeNull();
    expect(fake.col("affinity").has(`${r.id}_bianca_${OWNER}`)).toBe(true);
  }
});

test("500개가 넘어도 모두 지운다", async () => {
  for (let i = 0; i < 1203; i++) fake.col(dm.messagesPath).set(`m${i}`, { uid: OWNER, text: "x", createdAt: ts(i) });
  const counts = await clearRoom(fdb(), dm, MONGO_TEST_ENV);
  expect(counts.messages).toBe(1203);
  expect(fake.col(dm.messagesPath).size).toBe(0);
});

test("빈 방도 지울 수 있다", async () => {
  expect(await clearRoom(fdb(), dm, MONGO_TEST_ENV)).toEqual({ messages: 0, jobs: 0, memories: 0, affinity: 0 });
});

test("MongoDB 가 실패하면 Firestore 문서를 하나도 지우지 않고 throw 한다", async () => {
  fake.col(dm.messagesPath).set("m1", { uid: OWNER, text: "x", createdAt: ts(1) });
  fake.col(dm.jobsPath).set("m1_bianca", { status: "done" });
  fake.col("affinity").set(`${dm.id}_bianca_${OWNER}`, { roomId: dm.id, uid: OWNER, score: 70 });
  await memCol().insertOne({ _id: `${dm.id}_m1`, roomId: dm.id, text: "x" });
  const original = mongo.db.collection.bind(mongo.db);
  vi.spyOn(mongo.db, "collection").mockImplementation(((name: string) => {
    const c = original(name);
    if (name === "er_dev_memories") {
      return Object.assign(Object.create(c), { deleteMany: async () => Promise.reject(new Error("atlas down")) });
    }
    return c;
  }) as typeof mongo.db.collection);
  await expect(clearRoom(fdb(), dm, MONGO_TEST_ENV)).rejects.toThrow("atlas down");
  expect(fake.col(dm.messagesPath).size).toBe(1);
  expect(fake.col(dm.jobsPath).size).toBe(1);
  expect(fake.col("affinity").size).toBe(1);
});

test("MONGODB_URI 가 없으면 Firestore 만 지운다", async () => {
  setMongoDbForTest(null);
  fake.col(dm.messagesPath).set("m1", { uid: OWNER, text: "x", createdAt: ts(1) });
  expect(await clearRoom(fdb(), dm, {} as NodeJS.ProcessEnv)).toEqual({ messages: 1, jobs: 0, memories: 0, affinity: 0 });
});
