import { expect, test } from "vitest";
import { PERSONAS, findPersonaById, findPersonaByUid, isBotUid, type PersonaInfo } from "@/lib/claude/personas/info";
import { PERSONA_CONFIGS, getPersonaConfig } from "@/lib/claude/personas";

const fake: PersonaInfo[] = [
  { id: "a", uid: "bot_a", nickname: "봇", avatar: "/a.png" },
  { id: "b", uid: "bot_b", nickname: "봇봇", avatar: "/b.png" },
];

test("uid·id 로 찾는다", () => {
  expect(findPersonaByUid("bot_bianca")?.id).toBe("bianca");
  expect(findPersonaByUid("n_abc")).toBeNull();
  expect(findPersonaById("bianca")?.uid).toBe("bot_bianca");
  expect(findPersonaById("nobody")).toBeNull();
  expect(findPersonaByUid("bot_b", fake)?.id).toBe("b");
  expect(isBotUid("bot_bianca")).toBe(true);
  expect(isBotUid("n_abc")).toBe(false);
  expect(isBotUid("bot_a", fake)).toBe(true);
});

test("등록 목록의 id·uid·nickname 은 중복이 없다", () => {
  for (const key of ["id", "uid", "nickname"] as const) {
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
