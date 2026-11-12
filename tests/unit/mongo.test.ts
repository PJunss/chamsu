import { afterAll, beforeAll, expect, test } from "vitest";
import type { Db } from "mongodb";
import { startMongo } from "./helpers/mongo";
import { collectionPrefix, getMongoDb, mongoCollections, mongoConfigured, setMongoDbForTest } from "@/lib/mongo";

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;

test("접두어: 운영 배포만 er_, 미리보기·로컬은 er_dev_", () => {
  expect(collectionPrefix(env({ VERCEL_ENV: "production" }))).toBe("er_");
  expect(collectionPrefix(env({ VERCEL_ENV: "preview", NODE_ENV: "production" }))).toBe("er_dev_");
  expect(collectionPrefix(env({}))).toBe("er_dev_");
  expect(collectionPrefix(env({ NODE_ENV: "production" }))).toBe("er_dev_");
});

test("컬렉션 이름은 한 곳에서 접두어를 붙인다", () => {
  expect(mongoCollections("er_")).toEqual({
    memories: "er_memories",
    memoryState: "er_memoryState",
    rateLimits: "er_rateLimits",
    claudeLimits: "er_claudeLimits",
  });
});

test("MONGODB_URI 가 없으면 설정 없음이고 getMongoDb 는 throw", async () => {
  expect(mongoConfigured(env({}))).toBe(false);
  expect(mongoConfigured(env({ MONGODB_URI: "mongodb://x/er" }))).toBe(true);
  setMongoDbForTest(null);
  await expect(getMongoDb(env({}))).rejects.toThrow("MONGODB_URI missing");
});

let mongo: { db: Db; stop: () => Promise<void> };
beforeAll(async () => {
  mongo = await startMongo("mongo_test");
}, 120_000);
afterAll(async () => mongo?.stop());

test("처음 한 번 색인을 만든다", async () => {
  setMongoDbForTest(mongo.db);
  const db = await getMongoDb(env({ VERCEL_ENV: "production" }));
  expect(db).toBe(mongo.db);
  const mem = await db.collection("er_memories").indexes();
  expect(mem.some((i) => JSON.stringify(i.key) === JSON.stringify({ roomId: 1, createdAt: -1 }))).toBe(true);
  for (const name of ["er_rateLimits", "er_claudeLimits"]) {
    const ttl = (await db.collection(name).indexes()).find((i) => i.key.expireAt === 1);
    expect(ttl?.expireAfterSeconds).toBe(0);
  }
  await getMongoDb(env({}));
  expect((await db.collection("er_dev_memories").indexes()).length).toBe(2);
});
