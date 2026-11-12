import { expect, test } from "vitest";
import { limitSentences, toReplyText } from "@/lib/claude/reply";
import { getPersonaConfig, type PersonaConfig } from "@/lib/claude/personas";

const bianca = getPersonaConfig("bianca")!;
const kuro: PersonaConfig = {
  info: { id: "kuro", uid: "bot_kuro", nickname: "쿠로", trigger: "@쿠로", avatar: "/kuro.png" },
  character: "x",
  replyText: { refused: "(냥)", userLimited: "(쉬는 냥)", dailyLimited: "(끝 냥)", failed: "(고장 냥)", empty: "(…냥)" },
  maxSentences: 1,
};
const text = (t: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });

test("text 블록을 이어 붙이고 공백을 지운다", () =>
  expect(
    toReplyText(
      { stop_reason: "end_turn", content: [{ type: "thinking" }, { type: "text", text: " 안녕 " }, { type: "text", text: "반가워" }] },
      bianca,
    ),
  ).toBe("안녕 반가워"));
test("refusal 은 페르소나의 문구", () => {
  expect(toReplyText({ stop_reason: "refusal", content: [] }, bianca)).toBe("(이건 대답 못 해)");
  expect(toReplyText({ stop_reason: "refusal", content: [] }, kuro)).toBe("(냥)");
});
test("비면 페르소나의 empty 문구", () => {
  expect(toReplyText(text("  "), bianca)).toBe("(…)");
  expect(toReplyText(text("  "), kuro)).toBe("(…냥)");
});
test("500자로 자른다", () => expect(toReplyText(text("가".repeat(600)), bianca)).toHaveLength(500));
test("5문장은 앞 3문장만 남긴다", () =>
  expect(toReplyText(text("하나. 둘! 셋? 넷… 다섯~"), bianca)).toBe("하나. 둘! 셋?"));
test("페르소나의 문장 수를 따른다", () => expect(toReplyText(text("하나. 둘."), kuro)).toBe("하나."));

test("줄바꿈도 문장 구분이다", () => expect(limitSentences("하나\n둘\n\n셋\n넷", 3)).toBe("하나 둘 셋"));
test("~ 뒤 공백으로 나눈다", () => expect(limitSentences("좋아~ 가자~ 먹자~ 자자~", 3)).toBe("좋아~ 가자~ 먹자~"));
test("3문장 이하는 그대로", () => {
  expect(limitSentences(" 하나. 둘\n셋 ", 3)).toBe("하나. 둘\n셋");
  expect(limitSentences("3.5배 정도야. 맞아", 3)).toBe("3.5배 정도야. 맞아");
});
