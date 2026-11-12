import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Db } from "mongodb";
import { MONGO_TEST_ENV, startMongo } from "./helpers/mongo";
import { consumeAttempt } from "@/lib/attempts";
import { setMongoDbForTest } from "@/lib/mongo";
import { MAX_ATTEMPTS, WINDOW_MS } from "@/lib/rateLimit";

const NOW = Date.UTC(2026, 10, 12, 3, 0);
let mongo: { db: Db; stop: () => Promise<void> };
beforeAll(async () => {
  mongo = await startMongo("attempts");
}, 120_000);
afterAll(async () => mongo?.stop());
const col = () => mongo.db.collection<{ _id: string; count: number; windowStart: number; expireAt: Date }>("er_dev_rateLimits");
beforeEach(async () => {
  setMongoDbForTest(mongo.db);
  await col().deleteMany({});
});

test("창 안에서 한도까지 받고 넘으면 거절, 창이 지나면 다시 받는다", async () => {
  for (let i = 0; i < MAX_ATTEMPTS; i++) expect(await consumeAttempt("1.2.3.4", NOW + i, MONGO_TEST_ENV)).toBe(true);
  expect(await consumeAttempt("1.2.3.4", NOW + 100, MONGO_TEST_ENV)).toBe(false);
  expect(await consumeAttempt("5.6.7.8", NOW + 100, MONGO_TEST_ENV)).toBe(true);
  expect(await consumeAttempt("1.2.3.4", NOW + WINDOW_MS, MONGO_TEST_ENV)).toBe(true);
  expect(await col().findOne({ _id: "1.2.3.4" })).toEqual({
    _id: "1.2.3.4", count: 1, windowStart: NOW + WINDOW_MS, expireAt: new Date(NOW + 2 * WINDOW_MS),
  });
});

test("문서 id 는 toDocId(ip) 이고 expireAt 은 창이 끝나는 시각이다", async () => {
  await consumeAttempt("::ffff:1.2.3.4/x", NOW, MONGO_TEST_ENV);
  const doc = await col().findOne({});
  expect(doc?._id).toBe("::ffff:1.2.3.4_x");
  expect(doc?.expireAt).toEqual(new Date(NOW + WINDOW_MS));
});

test("동시에 들어와도 한도를 넘겨 받지 않는다", async () => {
  const results = await Promise.all(
    Array.from({ length: MAX_ATTEMPTS + 5 }, () => consumeAttempt("9.9.9.9", NOW, MONGO_TEST_ENV)),
  );
  expect(results.filter(Boolean)).toHaveLength(MAX_ATTEMPTS);
  expect((await col().findOne({ _id: "9.9.9.9" }))?.count).toBe(MAX_ATTEMPTS);
}, 60_000);

test("MONGODB_URI 가 없으면 throw 한다", async () => {
  setMongoDbForTest(null);
  await expect(consumeAttempt("1.2.3.4", NOW, {} as NodeJS.ProcessEnv)).rejects.toThrow("MONGODB_URI missing");
});
