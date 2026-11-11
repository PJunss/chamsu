import { expect, test } from "vitest";
import { pressKey } from "@/lib/keypad";

test("숫자를 붙인다", () => expect(pressKey("12", "3")).toBe("123"));
test("4자리를 넘지 않는다", () => expect(pressKey("1234", "5")).toBe("1234"));
test("C 는 비운다", () => expect(pressKey("123", "C")).toBe(""));
test("Escape 는 비운다", () => expect(pressKey("123", "Escape")).toBe(""));
test("Backspace 는 하나 지운다", () => expect(pressKey("123", "Backspace")).toBe("12"));
test("그 밖의 키는 무시", () => expect(pressKey("12", "a")).toBe("12"));
