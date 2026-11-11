import { describe, expect, test } from "vitest";
import { isValidPinFormat, pinMatches } from "@/lib/pin";

describe("isValidPinFormat", () => {
  test.each(["0000", "1234", "9999"])("%s 는 통과", (v) => expect(isValidPinFormat(v)).toBe(true));
  test.each(["123", "12345", "12a4", " 1234", "", null, 1234, undefined])("%s 는 거부", (v) =>
    expect(isValidPinFormat(v)).toBe(false),
  );
});

describe("pinMatches", () => {
  test("같으면 true", () => expect(pinMatches("1234", "1234")).toBe(true));
  test("다르면 false", () => expect(pinMatches("1235", "1234")).toBe(false));
  test("기대값이 없으면 false", () => expect(pinMatches("1234", undefined)).toBe(false));
  test("기대값 길이가 다르면 false", () => expect(pinMatches("1234", "12345")).toBe(false));
});
