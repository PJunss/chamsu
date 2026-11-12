import { expect, test } from "vitest";
import {
  PERSONAS, findMentions, findPersonaById, findPersonaByUid, isBotUid, type PersonaInfo,
} from "@/lib/claude/personas/info";
import { PERSONA_CONFIGS, getPersonaConfig } from "@/lib/claude/personas";

const fake: PersonaInfo[] = [
  { id: "a", uid: "bot_a", nickname: "봇", trigger: "@봇", avatar: "/a.png" },
  { id: "b", uid: "bot_b", nickname: "봇봇", trigger: "@봇봇", avatar: "/b.png" },
];

const ids = (list: PersonaInfo[]) => list.map((p) => p.id);

test("맨 앞·중간·끝 어디에 있어도 부른 것이다", () => {
  expect(ids(findMentions("  @비앙카 안녕 "))).toEqual(["bianca"]);
  expect(ids(findMentions("@비앙카야 오늘 뭐 먹지"))).toEqual(["bianca"]);
  expect(ids(findMentions("야 @루치아 안녕"))).toEqual(["lucia"]);
  expect(ids(findMentions("안녕 @루치아"))).toEqual(["lucia"]);
});

test("여러 봇은 처음 나온 순서로, 같은 봇은 한 번만 넣는다", () => {
  expect(ids(findMentions("@루치아 @비앙카 둘 다 안녕"))).toEqual(["lucia", "bianca"]);
  expect(ids(findMentions("@비앙카 안녕 @루치아 너도"))).toEqual(["bianca", "lucia"]);
  expect(ids(findMentions("@비앙카 안녕 @비앙카"))).toEqual(["bianca"]);
});

test("부르는 말이 앞부분을 공유하면 같은 위치에서 긴 것을 고른다", () => {
  const shared: PersonaInfo[] = [
    { id: "short", uid: "bot_short", nickname: "비앙", trigger: "@비앙", avatar: "/s.png" },
    { id: "long", uid: "bot_long", nickname: "비앙카", trigger: "@비앙카", avatar: "/l.png" },
  ];
  expect(ids(findMentions("@비앙카 안녕", shared))).toEqual(["long"]);
  expect(ids(findMentions("@비앙 안녕", shared))).toEqual(["short"]);
  expect(ids(findMentions("@비앙 그리고 @비앙카 안녕", shared))).toEqual(["short", "long"]);
  expect(ids(findMentions("@봇봇 hi", fake))).toEqual(["b"]);
  expect(ids(findMentions("@봇 hi", fake))).toEqual(["a"]);
});

test("부르는 말만 있으면 빈 배열", () => {
  expect(findMentions("@비앙카")).toEqual([]);
  expect(findMentions("  @비앙카   ")).toEqual([]);
  expect(findMentions("@비앙카 @루치아")).toEqual([]);
  expect(findMentions("@비앙카@비앙카")).toEqual([]);
});

test("부르는 말이 없으면 빈 배열", () => {
  expect(findMentions("안녕")).toEqual([]);
  expect(findMentions("")).toEqual([]);
});

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
