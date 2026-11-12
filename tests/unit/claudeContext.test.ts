import { expect, test } from "vitest";
import { buildClaudeMessages, type Memory } from "@/lib/claude/context";

const m = (id: string, uid: string, nickname: string, text: string) => ({ id, uid, nickname, text });

test("사람은 user(닉네임: 본문), 자기 uid 는 assistant", () => {
  expect(
    buildClaudeMessages(
      [m("1", "a", "철수", "안녕"), m("2", "claude", "비앙카", "응"), m("3", "b", "영희", "@비앙카 뭐해")],
      "claude",
    ),
  ).toEqual([
    { role: "user", content: "철수: 안녕" },
    { role: "assistant", content: "응" },
    { role: "user", content: "영희: @비앙카 뭐해" },
  ]);
});

test("다른 봇의 메시지는 user 의 닉네임: 본문", () => {
  expect(
    buildClaudeMessages([m("1", "a", "철수", "안녕"), m("2", "bot_kuro", "쿠로", "냥"), m("3", "claude", "비앙카", "흐흥")], "claude"),
  ).toEqual([
    { role: "user", content: "철수: 안녕\n쿠로: 냥" },
    { role: "assistant", content: "흐흥" },
  ]);
});

test("연속된 같은 역할은 줄바꿈으로 합친다", () => {
  expect(buildClaudeMessages([m("1", "a", "철수", "a"), m("2", "b", "영희", "b")], "claude")).toEqual([
    { role: "user", content: "철수: a\n영희: b" },
  ]);
});

test("앞쪽 assistant 는 버린다", () => {
  expect(buildClaudeMessages([m("1", "claude", "비앙카", "x"), m("2", "a", "철수", "@비앙카 y")], "claude")).toEqual([
    { role: "user", content: "철수: @비앙카 y" },
  ]);
});

test("기억이 있으면 첫 user 메시지 앞에 날짜순 [기억] 블록을 붙인다", () => {
  const memories: Memory[] = [
    { text: "내 생일 3월 14일임", nickname: "현석", context: ["민수: 생일 언제야?"], createdAt: new Date(Date.UTC(2026, 10, 10, 16, 0)) },
    { text: "나 고수 못 먹어", nickname: "영희", context: [], createdAt: new Date(Date.UTC(2026, 10, 11, 3, 0)) },
    { text: "다음 주 이사함", nickname: "철수", context: ["영희: 요즘 뭐해?", "민수: 바빠?"], createdAt: new Date(Date.UTC(2026, 10, 11, 4, 0)) },
  ];
  const turns = buildClaudeMessages([m("0", "claude", "비앙카", "x"), m("1", "a", "철수", "@비앙카 생일 기억해?")], "claude", memories);
  expect(turns).toEqual([
    {
      role: "user",
      content: [
        "[기억]",
        "2026-11-11 현석: 내 생일 3월 14일임",
        "  (앞 대화: 민수: 생일 언제야?)",
        "2026-11-11 영희: 나 고수 못 먹어",
        "2026-11-11 철수: 다음 주 이사함",
        "  (앞 대화: 영희: 요즘 뭐해? / 민수: 바빠?)",
        "",
        "[최근 대화]",
        "철수: @비앙카 생일 기억해?",
      ].join("\n"),
    },
  ]);
});

test("기억이 없으면 블록을 붙이지 않는다", () => {
  expect(buildClaudeMessages([m("1", "a", "철수", "hi")], "claude", [])).toEqual([{ role: "user", content: "철수: hi" }]);
});
