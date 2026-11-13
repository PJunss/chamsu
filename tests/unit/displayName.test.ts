import { expect, test } from "vitest";
import { cleanDisplayName } from "@/lib/displayName";

test("공백을 지우고 20자로 자른다", () => {
  expect(cleanDisplayName("  준  ")).toBe("준");
  expect(cleanDisplayName("가".repeat(25))).toBe("가".repeat(20));
});
test("비면 기본 이름", () => {
  expect(cleanDisplayName("   ")).toBe("모험가");
  expect(cleanDisplayName(null)).toBe("모험가");
  expect(cleanDisplayName(undefined, "손님")).toBe("손님");
});
