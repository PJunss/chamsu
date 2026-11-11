import { expect, test } from "vitest";
import { kstDayKey } from "@/lib/claude/limits";

test("KST 기준 날짜", () => {
  expect(kstDayKey(Date.UTC(2026, 10, 10, 14, 59))).toBe("20261110");
  expect(kstDayKey(Date.UTC(2026, 10, 10, 15, 0))).toBe("20261111");
});
