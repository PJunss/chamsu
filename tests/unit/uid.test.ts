import { expect, test } from "vitest";
import { uidForNickname } from "@/lib/uid";

test("같은 닉네임은 같은 uid", () => expect(uidForNickname("박준휘")).toBe(uidForNickname(" 박준휘 ")));
test("다른 닉네임은 다른 uid", () => expect(uidForNickname("박준휘")).not.toBe(uidForNickname("김동은")));
test("형식", () => expect(uidForNickname("박준휘")).toMatch(/^n_[0-9a-f]{32}$/));
