import { expect, test } from "vitest";
import { buildClaudeMessages } from "@/lib/claude/context";

const m = (id: string, uid: string, nickname: string, text: string) => ({ id, uid, nickname, text });

test("사람은 user(닉네임: 본문), 봇은 assistant", () => {
  expect(
    buildClaudeMessages([m("1", "a", "철수", "안녕"), m("2", "claude", "클로드", "응"), m("3", "b", "영희", "@클로드 뭐해")]),
  ).toEqual([
    { role: "user", content: "철수: 안녕" },
    { role: "assistant", content: "응" },
    { role: "user", content: "영희: @클로드 뭐해" },
  ]);
});

test("연속된 같은 역할은 줄바꿈으로 합친다", () => {
  expect(buildClaudeMessages([m("1", "a", "철수", "a"), m("2", "b", "영희", "b")])).toEqual([
    { role: "user", content: "철수: a\n영희: b" },
  ]);
});

test("앞쪽 assistant 는 버린다", () => {
  expect(buildClaudeMessages([m("1", "claude", "클로드", "x"), m("2", "a", "철수", "@클로드 y")])).toEqual([
    { role: "user", content: "철수: @클로드 y" },
  ]);
});
