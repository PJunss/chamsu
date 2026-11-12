import { expect, test } from "vitest";
import { buildSystemPrompt } from "@/lib/claude/prompt";
import { getPersonaConfig, type PersonaConfig } from "@/lib/claude/personas";
import { resolveRoom, type Room } from "@/lib/claude/rooms";

const bianca = getPersonaConfig("bianca")!;
const main = resolveRoom("main")!;

const quiet: PersonaConfig = {
  info: { id: "kuro", uid: "bot_kuro", nickname: "쿠로", trigger: "@쿠로", avatar: "/kuro.png" },
  character: "## 캐릭터\n- 조용한 고양이다.",
  replyText: { refused: "(냥)", userLimited: "(쉬는 냥)", dailyLimited: "(끝 냥)", failed: "(고장 냥)", empty: "(…냥)" },
  maxSentences: 2,
  useHelper: false,
  useMemory: false,
};
const dm: Room = {
  id: "dm_kuro_n_x",
  kind: "dm",
  personaIds: ["kuro"],
  ownerUid: "n_x",
  messagesPath: "rooms/dm_kuro_n_x/messages",
  jobsPath: "rooms/dm_kuro_n_x/claudeJobs",
  description: "쿠로와 사용자 한 명이 나누는 1:1 대화방",
  judgeState: "x",
};

test("방 소개, 캐릭터, 공통 규칙을 순서대로 잇는다", () => {
  const p = buildSystemPrompt(main, bianca);
  const desc = p.indexOf(main.description);
  const char = p.indexOf(bianca.character);
  const rules = p.indexOf("## 답하는 규칙");
  expect(desc).toBe(0);
  expect(char).toBeGreaterThan(desc);
  expect(rules).toBeGreaterThan(char);
  expect(p).toContain('너의 이름은 "비앙카"이다.');
  expect(p).toContain("1~3문장");
  expect(p).toContain('"비앙카:"');
  expect(p).toContain("[기억]");
  expect(p).toContain("기억은 원래 알던 것처럼 자연스럽게 말한다.");
  expect(p).toContain("ask_helper");
  expect(p).toContain("도우미 답과 자기 지식이 확실하지 않은 사실은 덧붙이지 않는다.");
});

test("도우미·기억을 끈 페르소나는 그 규칙이 없고 문장 수를 따른다", () => {
  const p = buildSystemPrompt(dm, quiet);
  expect(p.startsWith("쿠로와 사용자 한 명이 나누는 1:1 대화방")).toBe(true);
  expect(p).toContain("1~2문장");
  expect(p).toContain("조용한 고양이다.");
  expect(p).not.toContain("ask_helper");
  expect(p).not.toContain("[기억]");
  expect(p).not.toContain("비앙카");
});
