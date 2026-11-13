import { expect, test } from "vitest";
import { quotaExhausted, quotaText } from "@/lib/claude/quotaText";

const NOW = Date.UTC(2026, 10, 13, 5, 0);

test("남은 횟수가 있으면 남은/전체", () => {
  expect(quotaText({ max: 10, used: 3, resetAt: NOW + 60_000 }, NOW)).toBe("10분 한도 7/10 남음");
  expect(quotaText({ max: 10, used: 0, resetAt: null }, NOW)).toBe("10분 한도 10/10 남음");
  expect(quotaText({ max: 10, used: 9, resetAt: NOW + 1 }, NOW)).toBe("10분 한도 1/10 남음");
});
test("다 썼으면 풀릴 때까지 남은 분(올림, 최소 1)", () => {
  expect(quotaText({ max: 10, used: 10, resetAt: NOW + 170_000 }, NOW)).toBe("10분 한도를 다 썼어요. 3분 뒤에 풀려요");
  expect(quotaText({ max: 10, used: 10, resetAt: NOW + 30_000 }, NOW)).toBe("10분 한도를 다 썼어요. 1분 뒤에 풀려요");
  expect(quotaText({ max: 10, used: 12, resetAt: NOW + 600_000 }, NOW)).toBe("10분 한도를 다 썼어요. 10분 뒤에 풀려요");
});
test("풀리는 시각이 지났거나 없으면 다 쓴 것이 아니다", () => {
  expect(quotaText({ max: 10, used: 10, resetAt: NOW - 1 }, NOW)).toBe("10분 한도 10/10 남음");
  expect(quotaText({ max: 10, used: 10, resetAt: NOW }, NOW)).toBe("10분 한도 10/10 남음");
  expect(quotaText({ max: 10, used: 10, resetAt: null }, NOW)).toBe("10분 한도 10/10 남음");
});
test("제한이 꺼져 있으면 null", () => {
  expect(quotaText(null, NOW)).toBeNull();
});
test("quotaExhausted: 다 썼고 아직 풀리지 않았을 때만 true", () => {
  expect(quotaExhausted({ max: 10, used: 10, resetAt: NOW + 30_000 }, NOW)).toBe(true);
  expect(quotaExhausted({ max: 10, used: 3, resetAt: NOW + 30_000 }, NOW)).toBe(false);
  expect(quotaExhausted({ max: 10, used: 10, resetAt: NOW - 1 }, NOW)).toBe(false);
  expect(quotaExhausted(null, NOW)).toBe(false);
});
