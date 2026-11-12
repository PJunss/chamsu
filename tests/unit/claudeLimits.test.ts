import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Db } from "mongodb";
import { MONGO_TEST_ENV, startMongo } from "./helpers/mongo";
import { consumeClaudeQuota, kstDayExpireAt } from "@/lib/claude/limits";
import { CLAUDE_LIMITS } from "@/lib/claude/constants";
import { setMongoDbForTest } from "@/lib/mongo";

const NOW = Date.UTC(2026, 10, 11, 3, 0);
let mongo: { db: Db; stop: () => Promise<void> };
beforeAll(async () => {
  mongo = await startMongo("claude_limits");
}, 120_000);
afterAll(async () => mongo?.stop());
type LimitDoc = { _id: string; count: number; windowStart?: number; expireAt: Date };
const col = () => mongo.db.collection<LimitDoc>("er_dev_claudeLimits");
const ids = async () => (await col().find().sort({ _id: 1 }).toArray()).map((d) => d._id);
beforeEach(async () => {
  setMongoDbForTest(mongo.db);
  await col().deleteMany({});
});

test("기본 설정은 무제한이고 MongoDB 에 접근하지 않는다", async () => {
  setMongoDbForTest(null);
  const noMongo = {} as NodeJS.ProcessEnv;
  expect(CLAUDE_LIMITS).toEqual({ user: null, dailyMax: null });
  expect(await consumeClaudeQuota("u1", NOW, CLAUDE_LIMITS, noMongo)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW, { user: null, dailyMax: null }, noMongo)).toBe("ok");
});

test("제한을 켰는데 MONGODB_URI 가 없으면 throw 한다", async () => {
  setMongoDbForTest(null);
  await expect(consumeClaudeQuota("u1", NOW, { user: null, dailyMax: 1 }, {} as NodeJS.ProcessEnv)).rejects.toThrow(
    "MONGODB_URI missing",
  );
});

test("사람당 제한만 켜면 user 문서만 쓰고 넘으면 user, expireAt 은 창 끝", async () => {
  const limits = { user: { windowMs: 60_000, max: 1 }, dailyMax: null };
  expect(await consumeClaudeQuota("u1", NOW, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW + 1000, limits, MONGO_TEST_ENV)).toBe("user");
  expect(await consumeClaudeQuota("u2", NOW + 1000, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW + 60_000, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await ids()).toEqual(["user_u1", "user_u2"]);
  expect(await col().findOne({ _id: "user_u1" })).toEqual({
    _id: "user_u1", count: 1, windowStart: NOW + 60_000, expireAt: new Date(NOW + 120_000),
  });
});

test("하루 제한만 켜면 day 문서만 쓰고 넘으면 daily, expireAt 은 그날 KST 끝 + 1일", async () => {
  const limits = { user: null, dailyMax: 1 };
  expect(await consumeClaudeQuota("u1", NOW, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u2", NOW, limits, MONGO_TEST_ENV)).toBe("daily");
  expect(await ids()).toEqual(["day_20261111"]);
  expect(await col().findOne({ _id: "day_20261111" })).toEqual({
    _id: "day_20261111", count: 1, expireAt: new Date(Date.UTC(2026, 10, 12, 15, 0)),
  });
});

test("KST 하루 끝 + 1일: 2026-11-11 KST 는 2026-11-12T15:00Z", () => {
  expect(kstDayExpireAt(Date.UTC(2026, 10, 10, 15, 0))).toEqual(new Date(Date.UTC(2026, 10, 12, 15, 0)));
  expect(kstDayExpireAt(Date.UTC(2026, 10, 11, 14, 59, 59, 999))).toEqual(new Date(Date.UTC(2026, 10, 12, 15, 0)));
  expect(kstDayExpireAt(Date.UTC(2026, 10, 11, 15, 0))).toEqual(new Date(Date.UTC(2026, 10, 13, 15, 0)));
});

test("둘 다 켜면 사람당 제한을 먼저 본다", async () => {
  const limits = { user: { windowMs: 60_000, max: 5 }, dailyMax: 2 };
  expect(await consumeClaudeQuota("u1", NOW, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u2", NOW, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u3", NOW, limits, MONGO_TEST_ENV)).toBe("daily");
  expect(await col().findOne({ _id: "user_u3" })).toBeNull();
});
