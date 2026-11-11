import { describe, expect, test } from "vitest";
import { MAX_ATTEMPTS, WINDOW_MS, nextRateState } from "@/lib/rateLimit";

describe("nextRateState", () => {
  test("기록이 없으면 1회로 시작", () =>
    expect(nextRateState(null, 1000)).toEqual({ allowed: true, state: { count: 1, windowStart: 1000 } }));
  test("창 안에서는 횟수를 올린다", () =>
    expect(nextRateState({ count: 3, windowStart: 1000 }, 2000)).toEqual({
      allowed: true,
      state: { count: 4, windowStart: 1000 },
    }));
  test("한도에 닿으면 거부하고 상태를 그대로 둔다", () => {
    const prev = { count: MAX_ATTEMPTS, windowStart: 1000 };
    expect(nextRateState(prev, 2000)).toEqual({ allowed: false, state: prev });
  });
  test("창이 지나면 새로 시작", () =>
    expect(nextRateState({ count: MAX_ATTEMPTS, windowStart: 1000 }, 1000 + WINDOW_MS)).toEqual({
      allowed: true,
      state: { count: 1, windowStart: 1000 + WINDOW_MS },
    }));
  test("상수는 60초 10회", () => {
    expect(WINDOW_MS).toBe(60_000);
    expect(MAX_ATTEMPTS).toBe(10);
  });
});

test("창·한도를 인자로 받는다", () => {
  const prev = { count: 5, windowStart: 0 };
  expect(nextRateState(prev, 1000, 60_000, 5).allowed).toBe(false);
  expect(nextRateState(prev, 1000, 60_000, 6).allowed).toBe(true);
  expect(nextRateState(prev, 60_000, 60_000, 5)).toEqual({ allowed: true, state: { count: 1, windowStart: 60_000 } });
});
