import { describe, expect, test } from "vitest";
import { isAllowedNickname, parseAllowedNicknames } from "@/lib/nicknames";

describe("parseAllowedNicknames", () => {
  test("쉼표로 나누고 앞뒤 공백·빈 값을 뺀다", () =>
    expect(parseAllowedNicknames(" 가 ,나,, 다 ")).toEqual(["가", "나", "다"]));
  test("없으면 빈 목록", () => expect(parseAllowedNicknames(undefined)).toEqual([]));
});

describe("isAllowedNickname", () => {
  const raw = "철수,Younghee";
  test("목록에 있으면 true", () => expect(isAllowedNickname("철수", raw)).toBe(true));
  test("앞뒤 공백은 무시", () => expect(isAllowedNickname("  철수 ", raw)).toBe(true));
  test("대소문자를 구분", () => expect(isAllowedNickname("younghee", raw)).toBe(false));
  test("목록에 없으면 false", () => expect(isAllowedNickname("민수", raw)).toBe(false));
  test("빈 문자열은 false", () => expect(isAllowedNickname("  ", raw)).toBe(false));
  test("목록이 비면 전부 false", () => expect(isAllowedNickname("철수", "")).toBe(false));
});
