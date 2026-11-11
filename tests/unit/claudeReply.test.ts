import { expect, test } from "vitest";
import { REPLY_TEXT, toReplyText } from "@/lib/claude/reply";

test("text 블록을 이어 붙이고 공백을 지운다", () =>
  expect(
    toReplyText({
      stop_reason: "end_turn",
      content: [{ type: "thinking" }, { type: "text", text: " 안녕 " }, { type: "text", text: "반가워" }],
    }),
  ).toBe("안녕 반가워"));
test("refusal 은 고정 문구", () => expect(toReplyText({ stop_reason: "refusal", content: [] })).toBe(REPLY_TEXT.refused));
test("500자로 자른다", () =>
  expect(toReplyText({ stop_reason: "end_turn", content: [{ type: "text", text: "가".repeat(600) }] })).toHaveLength(500));
test("비면 empty 문구", () =>
  expect(toReplyText({ stop_reason: "end_turn", content: [{ type: "text", text: "  " }] })).toBe(REPLY_TEXT.empty));
