import { expect, test } from "vitest";
import { isNearBottom } from "@/lib/scroll";

test("바닥 근처면 true", () => expect(isNearBottom({ scrollHeight: 1000, scrollTop: 850, clientHeight: 100 })).toBe(true));
test("위로 올렸으면 false", () => expect(isNearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 100 })).toBe(false));
