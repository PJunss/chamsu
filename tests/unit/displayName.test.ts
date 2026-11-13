import { expect, test } from "vitest";
import { cleanDisplayName, shownDisplayName } from "@/lib/displayName";

test("공백을 지우고 20자로 자른다", () => {
  expect(cleanDisplayName("  준  ")).toBe("준");
  expect(cleanDisplayName("가".repeat(25))).toBe("가".repeat(20));
});
test("비면 기본 이름", () => {
  expect(cleanDisplayName("   ")).toBe("모험가");
  expect(cleanDisplayName(null)).toBe("모험가");
  expect(cleanDisplayName(undefined, "손님")).toBe("손님");
});

test("화면에 쓸 이름: 로딩 중이면 null, 문서가 없으면 구글 이름, 있으면 저장된 이름", () => {
  expect(shownDisplayName({ status: "loading" }, "구글이름")).toBeNull();
  expect(shownDisplayName({ status: "missing" }, "  구글이름 ")).toBe("구글이름");
  expect(shownDisplayName({ status: "missing" }, null)).toBe("모험가");
  expect(shownDisplayName({ status: "missing" }, "가".repeat(30))).toBe("가".repeat(20));
  expect(shownDisplayName({ status: "ready", name: "준" }, "구글이름")).toBe("준");
});
