import { expect, test } from "vitest";
import {
  PERSONAS, findPersonaById, findPersonaByTrigger, findPersonaByUid, isBotUid, type PersonaInfo,
} from "@/lib/claude/personas/info";
import { PERSONA_CONFIGS, getPersonaConfig } from "@/lib/claude/personas";

const fake: PersonaInfo[] = [
  { id: "a", uid: "bot_a", nickname: "봇", trigger: "@봇", avatar: "/a.png" },
  { id: "b", uid: "bot_b", nickname: "봇봇", trigger: "@봇봇", avatar: "/b.png" },
];

test("부르는 말 뒤 본문을 질문으로 꺼낸다", () => {
  const r = findPersonaByTrigger("  @비앙카 안녕 ");
  expect(r?.persona.id).toBe("bianca");
  expect(r?.question).toBe("안녕");
});
test("@비앙카 뒤 본문을 꺼낸다", () => expect(findPersonaByTrigger("@비앙카 오늘 뭐 먹지")?.question).toBe("오늘 뭐 먹지"));
test("붙여 써도 된다", () => expect(findPersonaByTrigger("@비앙카안녕")?.question).toBe("안녕"));
test("본문이 없으면 null", () => {
  expect(findPersonaByTrigger("@비앙카")).toBeNull();
  expect(findPersonaByTrigger("@비앙카   ")).toBeNull();
});
test("중간에 있으면 질문 아님", () => {
  expect(findPersonaByTrigger("안녕 @비앙카")).toBeNull();
  expect(findPersonaByTrigger("야 @비앙카 안녕")).toBeNull();
});
test("다른 텍스트는 null", () => expect(findPersonaByTrigger("안녕")).toBeNull());

test("부르는 말이 앞부분을 공유하면 긴 것을 고른다", () => {
  const b = findPersonaByTrigger("@봇봇 hi", fake);
  expect(b?.persona.id).toBe("b");
  expect(b?.question).toBe("hi");
  const a = findPersonaByTrigger("@봇 hi", fake);
  expect(a?.persona.id).toBe("a");
  expect(a?.question).toBe("hi");
});

test("uid·id 로 찾는다", () => {
  expect(findPersonaByUid("claude")?.id).toBe("bianca");
  expect(findPersonaByUid("n_abc")).toBeNull();
  expect(findPersonaById("bianca")?.uid).toBe("claude");
  expect(findPersonaById("nobody")).toBeNull();
  expect(findPersonaByUid("bot_b", fake)?.id).toBe("b");
  expect(isBotUid("claude")).toBe(true);
  expect(isBotUid("n_abc")).toBe(false);
  expect(isBotUid("bot_a", fake)).toBe(true);
});

test("등록 목록의 id·uid·nickname·trigger 는 중복이 없다", () => {
  for (const key of ["id", "uid", "nickname", "trigger"] as const) {
    const values = PERSONAS.map((p) => p[key]);
    expect(new Set(values).size).toBe(values.length);
  }
  for (const p of PERSONAS) expect(p.id).toMatch(/^[a-z0-9]+$/);
});

test("서버 목록과 공개 목록의 id 가 같고 info 는 같은 객체다", () => {
  expect(new Set(PERSONA_CONFIGS.map((c) => c.info.id))).toEqual(new Set(PERSONAS.map((p) => p.id)));
  expect(PERSONA_CONFIGS.length).toBe(PERSONAS.length);
  for (const c of PERSONA_CONFIGS) expect(c.info).toBe(PERSONAS.find((p) => p.id === c.info.id));
  expect(getPersonaConfig("bianca")?.info.nickname).toBe("비앙카");
  expect(getPersonaConfig("nobody")).toBeNull();
});
