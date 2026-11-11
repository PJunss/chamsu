import { expect, test } from "vitest";
import { getClientIp, toDocId } from "@/lib/clientIp";

test("x-forwarded-for 첫 값", () =>
  expect(getClientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4"));
test("x-real-ip 로 대체", () => expect(getClientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9"));
test("없으면 unknown", () => expect(getClientIp(new Headers())).toBe("unknown"));
test("문서 id 에 못 쓰는 문자는 _ 로", () => expect(toDocId("a/b c")).toBe("a_b_c"));
test("IPv6 콜론은 유지", () => expect(toDocId("::1")).toBe("::1"));
