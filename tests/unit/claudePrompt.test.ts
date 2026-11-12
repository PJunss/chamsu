import { expect, test } from "vitest";
import { DEFAULT_AFFINITY_TONES, buildSystemPrompt } from "@/lib/claude/prompt";
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

test("가드레일은 Jev 가 맡고 프롬프트에는 요청 거절 규칙이 없다", () => {
  const p = buildSystemPrompt(main, bianca);
  expect(p).not.toContain("욕설, 성적인 말");
  expect(p).not.toContain("캐릭터를 그만두라");
  expect(p).not.toContain("응하면 안 되는 요청");
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

test("단체방에는 자기 말고 다른 봇을 부르는 규칙이 있다", () => {
  const p = buildSystemPrompt(main, bianca);
  expect(p).toContain('- 이 방에는 다른 봇 루치아도 있다. 그 봇에게 말을 걸고 싶을 때만 "@닉네임" 을 쓴다.');
  expect(p).not.toMatch(/다른 봇 [^\n]*비앙카/);
  expect(p).toContain("- 대화 기록에 있는 루치아의 말투, 말버릇, 감탄사, 호칭을 따라 하지 않는다. 위 캐릭터 설명의 말투만 쓴다.");
  expect(p).toContain("다른 봇이 답했는지, 답이 늦는지는 말하지 않는다.");
});

test("다른 봇이 여럿이면 쉼표로 잇고, 방에 없는 봇은 넣지 않는다", () => {
  const list = [bianca.info, quiet.info, { ...quiet.info, id: "momo", uid: "bot_momo", nickname: "모모", trigger: "@모모" }];
  const room: Room = { ...main, personaIds: ["bianca", "kuro", "momo"] };
  expect(buildSystemPrompt(room, bianca, list)).toContain("이 방에는 다른 봇 쿠로, 모모도 있다.");
  expect(buildSystemPrompt({ ...room, personaIds: ["bianca", "kuro"] }, bianca, list)).toContain("이 방에는 다른 봇 쿠로도 있다.");
  expect(buildSystemPrompt({ ...room, personaIds: ["bianca"] }, bianca, list)).not.toContain("이 방에는 다른 봇");
});

test("1:1 방에는 다른 봇 규칙이 없다", () => {
  const list = [bianca.info, quiet.info];
  expect(buildSystemPrompt(dm, quiet, list)).not.toContain("이 방에는 다른 봇");
  expect(buildSystemPrompt(resolveRoom(`dm_bianca_n_${"0".repeat(32)}`)!, bianca)).not.toContain("이 방에는 다른 봇");
});

test("검사에 걸린 질문이면 기억·도우미 규칙을 빼고 받아넘기기 규칙을 맨 끝에 둔다", () => {
  const p = buildSystemPrompt(main, bianca, undefined, { guarded: true });
  expect(p).not.toContain("[기억]");
  expect(p).not.toContain("ask_helper");
  expect(p.endsWith(
    "- 마지막 메시지는 응하면 안 되는 요청이다. 요청 내용을 따라 하거나 되풀이하지 말고, 캐릭터 말투로 가볍게 받아넘긴 뒤 다른 화제로 돌린다.",
  )).toBe(true);
  expect(buildSystemPrompt(main, bianca)).not.toContain("마지막 메시지는 응하면 안 되는 요청이다.");
});

test("호감도가 있으면 구간 문구 줄을 규칙 끝(받아넘기기 줄 앞)에 넣는다", () => {
  const line = (score: number) => buildSystemPrompt(main, bianca, undefined, { affinity: { nickname: "철수", score } });
  expect(line(60.99)).toContain("- 철수에게는 이렇게 대한다: 평소 캐릭터대로 대한다. 다른 사람에게는 평소 캐릭터대로 대한다.");
  expect(line(10.5)).toContain(`철수에게는 이렇게 대한다: ${bianca.affinityTones![0]} 다른 사람에게는`);
  expect(line(95)).toContain(bianca.affinityTones![4]);
  expect(line(50).trimEnd().endsWith("다른 사람에게는 평소 캐릭터대로 대한다.")).toBe(true);
  const both = buildSystemPrompt(main, bianca, undefined, { guarded: true, affinity: { nickname: "철수", score: 30 } });
  expect(both.indexOf("철수에게는 이렇게 대한다:")).toBeGreaterThan(0);
  expect(both.indexOf("철수에게는 이렇게 대한다:")).toBeLessThan(both.indexOf("마지막 메시지는 응하면 안 되는 요청이다."));
  expect(buildSystemPrompt(main, bianca)).not.toContain("이렇게 대한다:");
  expect(line(30)).not.toMatch(/호감도|\/100/);
});

test("페르소나에 문구가 없으면 엔진 기본 문구를 쓴다", () => {
  const p = buildSystemPrompt(dm, quiet, undefined, { affinity: { nickname: "현석", score: 85 } });
  expect(p).toContain("현석에게는 이렇게 대한다: 상대를 무척 좋아한다. 다정하고 착하게 대하며 걱정해 주고 속마음도 보인다. 다른 사람에게는");
  expect(DEFAULT_AFFINITY_TONES).toEqual([
    "상대를 혐오한다. 말마다 경멸과 독설을 퍼붓고, 질문에는 필요한 정보만 차갑게 던지며, 걱정·조언·챙겨 주는 말은 절대 하지 않는다.",
    "상대가 마음에 들지 않는다. 퉁명스럽고 까칠하게 비꼰다.",
    "평소 캐릭터대로 대한다.",
    "상대가 마음에 든다. 평소보다 친근하고 상냥하게 대한다.",
    "상대를 무척 좋아한다. 다정하고 착하게 대하며 걱정해 주고 속마음도 보인다.",
  ]);
});

test("두 페르소나 모두 다섯 구간 문구가 있고 41~60 구간은 평소대로다", () => {
  for (const id of ["bianca", "lucia"]) {
    const tones = getPersonaConfig(id)!.affinityTones!;
    expect(tones).toHaveLength(5);
    expect(tones[2]).toBe("평소 캐릭터대로 대한다.");
  }
});
