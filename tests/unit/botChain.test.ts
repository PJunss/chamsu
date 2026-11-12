import { expect, test } from "vitest";
import { pickChainCalls } from "@/components/chat/useBotChain";
import type { PersonaInfo } from "@/lib/claude/personas/info";

const ME = "n_me";
const list: PersonaInfo[] = [
  { id: "bianca", uid: "bot_bianca", nickname: "비앙카", trigger: "@비앙카", avatar: "/b.png" },
  { id: "lucia", uid: "bot_lucia", nickname: "루치아", trigger: "@루치아", avatar: "/l.png" },
];
const AFTER = 1_000;
const bot = (id: string, over: Partial<{ uid: string; text: string; ms: number; chainDepth: number; chainRootUid: string }> = {}) => ({
  id,
  uid: over.uid ?? "bot_bianca",
  text: over.text ?? "@루치아 넌 어때?",
  createdAt: new Date(over.ms ?? 2_000),
  chainDepth: over.chainDepth ?? 1,
  chainRootUid: over.chainRootUid ?? ME,
});

test("내가 시작한 연쇄에서 다른 봇을 부른 새 봇 메시지를 고른다", () => {
  expect(pickChainCalls([bot("a")], new Set(), ME, AFTER, list)).toEqual(["a"]);
});

test("이미 본 메시지와 창을 열기 전 메시지는 부르지 않는다", () => {
  expect(pickChainCalls([bot("a")], new Set(["a"]), ME, AFTER, list)).toEqual([]);
  expect(pickChainCalls([bot("a", { ms: 500 })], new Set(), ME, AFTER, list)).toEqual([]);
  expect(pickChainCalls([{ ...bot("a"), createdAt: null }], new Set(), ME, AFTER, list)).toEqual([]);
});

test("다른 사람이 시작한 연쇄나 사람 메시지는 부르지 않는다", () => {
  expect(pickChainCalls([bot("a", { chainRootUid: "n_other" })], new Set(), ME, AFTER, list)).toEqual([]);
  expect(pickChainCalls([bot("a", { uid: ME })], new Set(), ME, AFTER, list)).toEqual([]);
  expect(pickChainCalls([{ ...bot("a"), chainRootUid: undefined }], new Set(), ME, AFTER, list)).toEqual([]);
});

test("단계 3 까지만 부르고 4 는 부르지 않는다", () => {
  expect(pickChainCalls([bot("a", { chainDepth: 3 })], new Set(), ME, AFTER, list)).toEqual(["a"]);
  expect(pickChainCalls([bot("a", { chainDepth: 4 })], new Set(), ME, AFTER, list)).toEqual([]);
  expect(pickChainCalls([{ ...bot("a"), chainDepth: undefined }], new Set(), ME, AFTER, list)).toEqual([]);
});

test("자기 자신만 부르거나 아무도 부르지 않으면 부르지 않는다", () => {
  expect(pickChainCalls([bot("a", { text: "나 @비앙카 야" })], new Set(), ME, AFTER, list)).toEqual([]);
  expect(pickChainCalls([bot("a", { text: "그냥 답" })], new Set(), ME, AFTER, list)).toEqual([]);
  expect(pickChainCalls([bot("a", { uid: "bot_lucia", text: "@비앙카 너는?" })], new Set(), ME, AFTER, list)).toEqual(["a"]);
});

test("여러 메시지 중 조건에 맞는 것만 순서대로", () => {
  const msgs = [bot("a"), bot("b", { chainDepth: 4 }), bot("c", { uid: "bot_lucia", text: "@비앙카 응" })];
  expect(pickChainCalls(msgs, new Set(), ME, AFTER, list)).toEqual(["a", "c"]);
});
