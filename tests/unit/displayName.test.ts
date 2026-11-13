import { expect, test } from "vitest";
import { cleanDisplayName, parseNickname, shownDisplayName } from "@/lib/displayName";

test("공백을 지우고 20자로 자른다", () => {
  expect(cleanDisplayName("  준  ")).toBe("준");
  expect(cleanDisplayName("가".repeat(25))).toBe("가".repeat(20));
});
test("비면 기본 이름", () => {
  expect(cleanDisplayName("   ")).toBe("모험가");
  expect(cleanDisplayName(null)).toBe("모험가");
  expect(cleanDisplayName(undefined, "손님")).toBe("손님");
});

test("입력한 닉네임: 공백을 지우고 20자로 자르며, 남는 글자가 없으면 null", () => {
  expect(parseNickname("  준  ")).toBe("준");
  expect(parseNickname("가".repeat(25))).toBe("가".repeat(20));
  expect(parseNickname("")).toBeNull();
  expect(parseNickname("   ")).toBeNull();
});

test("화면에 쓸 이름: 저장된 닉네임이 있으면 그 이름", () => {
  expect(shownDisplayName({ status: "ready", name: "준" }, "구글이름")).toBe("준");
});
test("화면에 쓸 이름: 로딩 중이거나 닉네임을 아직 정하지 않았으면 null (구글 이름을 쓰지 않는다)", () => {
  expect(shownDisplayName({ status: "loading" }, "구글이름")).toBeNull();
  expect(shownDisplayName({ status: "missing" }, "구글이름")).toBeNull();
});
test("화면에 쓸 이름: 문서를 읽지 못했으면 구글 이름, 그것도 없으면 기본 이름", () => {
  expect(shownDisplayName({ status: "error" }, "  구글이름 ")).toBe("구글이름");
  expect(shownDisplayName({ status: "error" }, null)).toBe("모험가");
  expect(shownDisplayName({ status: "error" }, "가".repeat(30))).toBe("가".repeat(20));
});
