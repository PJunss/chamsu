import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Db } from "mongodb";
import { MONGO_TEST_ENV, startMongo } from "./helpers/mongo";
import { consumeClaudeQuota, readClaudeQuota } from "@/lib/claude/limits";
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

const OFF = { user: null, userDailyMax: null, dailyMax: null };
/** 한국 시간 2026-11-11 12:00. 한도 날짜는 20261111 이고 11-12 06:00 KST(11-11 21:00Z)에 끝난다. */
const DAY_EXPIRE = new Date(Date.UTC(2026, 10, 12, 21, 0));

test("운영 설정은 한 사람당 10분에 10회, 하루 100회이고 전체 합계 제한은 없다", () => {
  expect(CLAUDE_LIMITS).toEqual({ user: { windowMs: 600_000, max: 10 }, userDailyMax: 100, dailyMax: null });
});

test("모두 꺼져 있으면 무제한이고 MongoDB 에 접근하지 않는다", async () => {
  setMongoDbForTest(null);
  expect(await consumeClaudeQuota("u1", NOW, OFF, {} as NodeJS.ProcessEnv)).toBe("ok");
});

test("제한을 켰는데 MONGODB_URI 가 없으면 throw 한다", async () => {
  setMongoDbForTest(null);
  await expect(consumeClaudeQuota("u1", NOW, { ...OFF, dailyMax: 1 }, {} as NodeJS.ProcessEnv)).rejects.toThrow(
    "MONGODB_URI missing",
  );
  await expect(consumeClaudeQuota("u1", NOW, { ...OFF, userDailyMax: 1 }, {} as NodeJS.ProcessEnv)).rejects.toThrow(
    "MONGODB_URI missing",
  );
});

test("시간 창 제한만 켜면 user 문서만 쓰고 넘으면 user, expireAt 은 창 끝", async () => {
  const limits = { ...OFF, user: { windowMs: 60_000, max: 1 } };
  expect(await consumeClaudeQuota("u1", NOW, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW + 1000, limits, MONGO_TEST_ENV)).toBe("user");
  expect(await consumeClaudeQuota("u2", NOW + 1000, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW + 60_000, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await ids()).toEqual(["user_u1", "user_u2"]);
  expect(await col().findOne({ _id: "user_u1" })).toEqual({
    _id: "user_u1", count: 1, windowStart: NOW + 60_000, expireAt: new Date(NOW + 120_000),
  });
});

test("10분에 10회: 열한 번째는 user 이고 첫 호출 10분 뒤에 풀린다", async () => {
  const limits = { ...OFF, user: { windowMs: 600_000, max: 10 } };
  for (let i = 0; i < 10; i++) expect(await consumeClaudeQuota("u1", NOW + i * 1000, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW + 10_000, limits, MONGO_TEST_ENV)).toBe("user");
  expect(await consumeClaudeQuota("u1", NOW + 599_999, limits, MONGO_TEST_ENV)).toBe("user");
  expect(await consumeClaudeQuota("u1", NOW + 600_000, limits, MONGO_TEST_ENV)).toBe("ok");
});

test("사람당 하루 제한은 사람마다 따로 세고 넘으면 daily, expireAt 은 그 한도 날짜 끝 + 1일", async () => {
  const limits = { ...OFF, userDailyMax: 2 };
  expect(await consumeClaudeQuota("u1", NOW, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW + 1000, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW + 2000, limits, MONGO_TEST_ENV)).toBe("daily");
  expect(await consumeClaudeQuota("u2", NOW + 2000, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await ids()).toEqual(["userday_u1_20261111", "userday_u2_20261111"]);
  expect(await col().findOne({ _id: "userday_u1_20261111" })).toEqual({
    _id: "userday_u1_20261111", count: 2, expireAt: DAY_EXPIRE,
  });
});

test("사람당 하루 횟수는 한국 시간 06:00 에 모두 함께 초기화된다", async () => {
  const limits = { ...OFF, userDailyMax: 1 };
  /** 2026-11-12 05:00 KST 와 05:59 KST: 같은 한도 날짜(11-11) */
  const before = Date.UTC(2026, 10, 11, 20, 0);
  expect(await consumeClaudeQuota("u1", before, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u2", before + 59 * 60_000, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u1", before + 59 * 60_000, limits, MONGO_TEST_ENV)).toBe("daily");
  /** 2026-11-12 06:00 KST: 늦게 쓴 u2 도 같은 시각에 풀린다 */
  const reset = Date.UTC(2026, 10, 11, 21, 0);
  expect(await consumeClaudeQuota("u1", reset, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u2", reset, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u2", reset + 1000, limits, MONGO_TEST_ENV)).toBe("daily");
});

test("시간 창에 막힌 호출은 하루 횟수에 세지 않는다", async () => {
  const limits = { user: { windowMs: 60_000, max: 1 }, userDailyMax: 5, dailyMax: null };
  expect(await consumeClaudeQuota("u1", NOW, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW + 1000, limits, MONGO_TEST_ENV)).toBe("user");
  expect((await col().findOne({ _id: "userday_u1_20261111" }))?.count).toBe(1);
});

test("하루 횟수에 막힌 호출은 시간 창에 세지 않는다", async () => {
  const limits = { user: { windowMs: 60_000, max: 5 }, userDailyMax: 1, dailyMax: null };
  expect(await consumeClaudeQuota("u1", NOW, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW + 1000, limits, MONGO_TEST_ENV)).toBe("daily");
  expect((await col().findOne({ _id: "user_u1" }))?.count).toBe(1);
});

test("전체 하루 제한만 켜면 day 문서만 쓰고 넘으면 daily", async () => {
  const limits = { ...OFF, dailyMax: 1 };
  expect(await consumeClaudeQuota("u1", NOW, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u2", NOW, limits, MONGO_TEST_ENV)).toBe("daily");
  expect(await ids()).toEqual(["day_20261111"]);
  expect(await col().findOne({ _id: "day_20261111" })).toEqual({ _id: "day_20261111", count: 1, expireAt: DAY_EXPIRE });
});

test("전체 하루 제한에 막힌 호출은 그 사람의 기록을 남기지 않는다", async () => {
  const limits = { user: { windowMs: 60_000, max: 5 }, userDailyMax: 5, dailyMax: 2 };
  expect(await consumeClaudeQuota("u1", NOW, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u2", NOW, limits, MONGO_TEST_ENV)).toBe("ok");
  expect(await consumeClaudeQuota("u3", NOW, limits, MONGO_TEST_ENV)).toBe("daily");
  expect(await col().findOne({ _id: "user_u3" })).toBeNull();
  expect(await col().findOne({ _id: "userday_u3_20261111" })).toBeNull();
});

test("readClaudeQuota: 아무것도 쓰지 않았으면 사용량 0 이고 풀리는 시각이 없다", async () => {
  expect(await readClaudeQuota("u1", NOW, CLAUDE_LIMITS, MONGO_TEST_ENV)).toEqual({
    window: { max: 10, used: 0, resetAt: null },
    day: { max: 100, used: 0 },
  });
});

test("readClaudeQuota: 쓴 횟수와 첫 호출 10분 뒤의 풀리는 시각을 준다", async () => {
  for (let i = 0; i < 3; i++) await consumeClaudeQuota("u1", NOW + i * 1000, CLAUDE_LIMITS, MONGO_TEST_ENV);
  expect(await readClaudeQuota("u1", NOW + 5000, CLAUDE_LIMITS, MONGO_TEST_ENV)).toEqual({
    window: { max: 10, used: 3, resetAt: NOW + 600_000 },
    day: { max: 100, used: 3 },
  });
  expect(await readClaudeQuota("u1", NOW + 599_999, CLAUDE_LIMITS, MONGO_TEST_ENV)).toMatchObject({
    window: { used: 3, resetAt: NOW + 600_000 },
  });
  expect(await readClaudeQuota("u2", NOW + 5000, CLAUDE_LIMITS, MONGO_TEST_ENV)).toEqual({
    window: { max: 10, used: 0, resetAt: null },
    day: { max: 100, used: 0 },
  });
});

test("readClaudeQuota: 창이 끝나면 창 사용량은 0 이고 하루 사용량은 그대로다", async () => {
  for (let i = 0; i < 3; i++) await consumeClaudeQuota("u1", NOW + i * 1000, CLAUDE_LIMITS, MONGO_TEST_ENV);
  expect(await readClaudeQuota("u1", NOW + 600_000, CLAUDE_LIMITS, MONGO_TEST_ENV)).toEqual({
    window: { max: 10, used: 0, resetAt: null },
    day: { max: 100, used: 3 },
  });
});

test("readClaudeQuota: 한국 시간 06:00 을 넘기면 하루 사용량이 0 이다", async () => {
  for (let i = 0; i < 3; i++) await consumeClaudeQuota("u1", NOW + i * 1000, CLAUDE_LIMITS, MONGO_TEST_ENV);
  const reset = Date.UTC(2026, 10, 11, 21, 0);
  expect((await readClaudeQuota("u1", reset - 1, CLAUDE_LIMITS, MONGO_TEST_ENV)).day).toEqual({ max: 100, used: 3 });
  expect((await readClaudeQuota("u1", reset, CLAUDE_LIMITS, MONGO_TEST_ENV)).day).toEqual({ max: 100, used: 0 });
});

test("readClaudeQuota: 읽기만 해서는 문서가 생기거나 바뀌지 않는다", async () => {
  await readClaudeQuota("u1", NOW, CLAUDE_LIMITS, MONGO_TEST_ENV);
  expect(await ids()).toEqual([]);
  await consumeClaudeQuota("u1", NOW, CLAUDE_LIMITS, MONGO_TEST_ENV);
  const before = await col().find().sort({ _id: 1 }).toArray();
  await readClaudeQuota("u1", NOW + 1000, CLAUDE_LIMITS, MONGO_TEST_ENV);
  await readClaudeQuota("u1", NOW + 700_000, CLAUDE_LIMITS, MONGO_TEST_ENV);
  expect(await col().find().sort({ _id: 1 }).toArray()).toEqual(before);
});

test("readClaudeQuota: 꺼진 제한은 null 이고 모두 꺼져 있으면 MongoDB 에 접근하지 않는다", async () => {
  expect(await readClaudeQuota("u1", NOW, { ...OFF, userDailyMax: 5 }, MONGO_TEST_ENV)).toEqual({
    window: null,
    day: { max: 5, used: 0 },
  });
  expect(await readClaudeQuota("u1", NOW, { ...OFF, user: { windowMs: 60_000, max: 2 } }, MONGO_TEST_ENV)).toEqual({
    window: { max: 2, used: 0, resetAt: null },
    day: null,
  });
  setMongoDbForTest(null);
  expect(await readClaudeQuota("u1", NOW, OFF, {} as NodeJS.ProcessEnv)).toEqual({ window: null, day: null });
  expect(await readClaudeQuota("u1", NOW, { ...OFF, dailyMax: 5 }, {} as NodeJS.ProcessEnv)).toEqual({ window: null, day: null });
});
