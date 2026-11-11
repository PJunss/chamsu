import { expect, test } from "vitest";
import { parseClaudeQuestion } from "@/lib/claude/trigger";

test("@클로드 뒤 본문을 꺼낸다", () => expect(parseClaudeQuestion("@클로드 오늘 뭐 먹지")).toBe("오늘 뭐 먹지"));
test("앞뒤 공백 무시", () => expect(parseClaudeQuestion("  @클로드   안녕  ")).toBe("안녕"));
test("붙여 써도 된다", () => expect(parseClaudeQuestion("@클로드안녕")).toBe("안녕"));
test("본문이 없으면 null", () => expect(parseClaudeQuestion("@클로드   ")).toBeNull());
test("중간에 있으면 질문 아님", () => expect(parseClaudeQuestion("야 @클로드 안녕")).toBeNull());
test("다른 텍스트는 null", () => expect(parseClaudeQuestion("안녕")).toBeNull());
