import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { Db } from "mongodb";
import { MONGO_TEST_ENV, startMongo } from "./helpers/mongo";
import { setMongoDbForTest } from "@/lib/mongo";
import type { Firestore } from "firebase-admin/firestore";

vi.mock("firebase-admin/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase-admin/firestore")>();
  return { ...real, FieldValue: { serverTimestamp: () => real.Timestamp.fromMillis(Date.now()) } };
});
import { createFakeFirestore, ts } from "./helpers/fakeFirestore";
import { Timestamp } from "firebase-admin/firestore";
import { isClearCommand } from "@/lib/claude/clear";
import { clearRoom } from "@/lib/claude/clearRoom";
import { markCleared, readClearedAt } from "@/lib/claude/roomState";
import { rememberSince } from "@/lib/claude/memory";
import type { askJev as AskJev } from "@/lib/claude/jev";
import { resolveRoom, roomIdFor } from "@/lib/claude/rooms";

const OWNER = "ownerUid0000000000000000001";
const OTHER = "otherUid0000000000000000002";
const dm = resolveRoom(roomIdFor(OWNER, "bianca"))!;
const otherDm = resolveRoom(roomIdFor(OTHER, "bianca"))!;

test("방 주인의 /clear 만 지우기 명령이다", () => {
  expect(isClearCommand(dm, { uid: OWNER, text: "/clear" })).toBe(true);
  expect(isClearCommand(dm, { uid: OWNER, text: "  /clear \n" })).toBe(true);
  expect(isClearCommand(dm, { uid: OWNER, text: "/clear 해줘" })).toBe(false);
  expect(isClearCommand(dm, { uid: OWNER, text: "/CLEAR" })).toBe(false);
  expect(isClearCommand(dm, { uid: OTHER, text: "/clear" })).toBe(false);
  expect(isClearCommand(dm, { uid: OWNER, text: 3 })).toBe(false);
  expect(isClearCommand(otherDm, { uid: OWNER, text: "/clear" })).toBe(false);
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
const T0 = Date.UTC(2026, 10, 12, 3, 0);
beforeEach(async () => {
  fake = createFakeFirestore();
  setMongoDbForTest(mongo.db);
  vi.restoreAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  await memCol().deleteMany({});
  await stateCol().deleteMany({});
});

test("방 문서가 없으면 지운 시각은 null", async () => {
  expect(await readClearedAt(fdb(), dm.id)).toBeNull();
  fake.col("rooms").set(dm.id, { other: 1 });
  expect(await readClearedAt(fdb(), dm.id)).toBeNull();
});

test("markCleared 는 서버 시각을 쓰고 저장된 값을 돌려준다", async () => {
  const t = await markCleared(fdb(), dm.id);
  expect(t.toMillis()).toBe(T0);
  expect((await readClearedAt(fdb(), dm.id))?.toMillis()).toBe(T0);
});

test("/clear 는 문서를 지우지 않고 지운 시각을 쓰며 판정 상태를 그 시각으로 앞당긴다", async () => {
  fake.col(dm.messagesPath).set("m1", { uid: OWNER, text: "x", createdAt: ts(1) });
  fake.col(dm.jobsPath).set("m1_bianca", { status: "done" });
  fake.col("affinity").set(`${dm.id}_bianca_${OWNER}`, { roomId: dm.id, uid: OWNER, score: 70 });
  await memCol().insertOne({ _id: `${dm.id}_m1`, roomId: dm.id, text: "x" });
  await stateCol().insertOne({ _id: dm.id, lastJudgedAt: { seconds: 1, nanoseconds: 0 } });
  await stateCol().insertOne({ _id: otherDm.id, lastJudgedAt: { seconds: 1, nanoseconds: 0 } });
  const { clearedAt } = await clearRoom(fdb(), dm, MONGO_TEST_ENV);
  expect(clearedAt.toMillis()).toBe(T0);
  expect(fake.col(dm.messagesPath).size).toBe(1);
  expect(fake.col(dm.jobsPath).size).toBe(1);
  expect(fake.col("affinity").size).toBe(1);
  expect(await memCol().countDocuments()).toBe(1);
  expect((await stateCol().findOne({ _id: dm.id }))?.lastJudgedAt).toEqual({
    seconds: clearedAt.seconds, nanoseconds: clearedAt.nanoseconds,
  });
  expect((await stateCol().findOne({ _id: otherDm.id }))?.lastJudgedAt).toEqual({ seconds: 1, nanoseconds: 0 });
});

test("다시 /clear 하면 시각이 바뀐다", async () => {
  await clearRoom(fdb(), dm, MONGO_TEST_ENV);
  vi.setSystemTime(T0 + 60_000);
  const second = await clearRoom(fdb(), dm, MONGO_TEST_ENV);
  expect(second.clearedAt.toMillis()).toBe(T0 + 60_000);
  expect((await readClearedAt(fdb(), dm.id))?.toMillis()).toBe(T0 + 60_000);
});

test("판정 상태가 이미 지운 시각보다 앞서 있으면 덮지 않는다", async () => {
  await stateCol().insertOne({ _id: dm.id, lastJudgedAt: { seconds: Math.floor(T0 / 1000) + 100, nanoseconds: 0 } });
  await clearRoom(fdb(), dm, MONGO_TEST_ENV);
  expect((await stateCol().findOne({ _id: dm.id }))?.lastJudgedAt.seconds).toBe(Math.floor(T0 / 1000) + 100);
});

test("/clear 뒤 기억 판정은 지운 시각 이전 메시지를 다시 판정하지 않는다", async () => {
  const msg = (id: string, text: string, ms: number) =>
    fake.col(dm.messagesPath).set(id, { uid: OWNER, nickname: "현석", text, createdAt: Timestamp.fromMillis(ms) });
  msg("old", "옛말", T0 - 5000);
  await clearRoom(fdb(), dm, MONGO_TEST_ENV);
  msg("new", "새말", T0 + 5000);
  const askJev = vi.fn<typeof AskJev>(async () => ({}));
  const env = { ...MONGO_TEST_ENV, TYPESAFE_API_KEY: "k" } as NodeJS.ProcessEnv;
  expect(await rememberSince(fdb(), dm, Timestamp.fromMillis(T0 + 5000), { askJev, env })).toEqual({ judged: 1, saved: 0 });
  expect(JSON.stringify(askJev.mock.calls[0][1])).not.toContain("옛말");
});

test("MONGODB_URI 가 없으면 지운 시각만 쓴다", async () => {
  setMongoDbForTest(null);
  const { clearedAt } = await clearRoom(fdb(), dm, {} as NodeJS.ProcessEnv);
  expect(clearedAt.toMillis()).toBe(T0);
});

test("판정 상태 앞당기기가 실패하면 throw 한다(지운 시각은 이미 쓰여 있다)", async () => {
  const original = mongo.db.collection.bind(mongo.db);
  vi.spyOn(mongo.db, "collection").mockImplementation(((name: string) => {
    const c = original(name);
    if (name === "er_dev_memoryState") {
      return Object.assign(Object.create(c), { updateOne: async () => Promise.reject(new Error("atlas down")) });
    }
    return c;
  }) as typeof mongo.db.collection);
  await expect(clearRoom(fdb(), dm, MONGO_TEST_ENV)).rejects.toThrow("atlas down");
  expect((await readClearedAt(fdb(), dm.id))?.toMillis()).toBe(T0);
});
