import { expect, test } from "vitest";
import { MAIN_ROOM_ID, dmRoomId, pickTarget, resolveRoom } from "@/lib/claude/rooms";
import type { PersonaInfo } from "@/lib/claude/personas/info";

const UID = "n_" + "0123456789abcdef".repeat(2);
const OTHER = "n_" + "fedcba9876543210".repeat(2);
const fake: PersonaInfo[] = [
  { id: "bianca", uid: "claude", nickname: "비앙카", trigger: "@비앙카", avatar: "/bianca.jpeg" },
  { id: "kuro", uid: "bot_kuro", nickname: "쿠로", trigger: "@쿠로", avatar: "/kuro.png" },
];

test("main 은 단체방이고 기존 최상위 컬렉션을 쓴다", () => {
  expect(MAIN_ROOM_ID).toBe("main");
  expect(resolveRoom("main", fake)).toEqual({
    id: "main",
    kind: "group",
    personaIds: ["bianca", "kuro"],
    ownerUid: null,
    messagesPath: "messages",
    jobsPath: "claudeJobs",
    description: '친구 일곱 명이 쓰는 잡담방 "chamsu"',
    judgeState: "친구 7명의 한국어 단체 채팅방 메시지를 하나씩 평가한다.",
  });
});

test("dm 방 id 에서 주인과 페르소나를 정한다", () => {
  const id = `dm_bianca_${UID}`;
  expect(resolveRoom(id)).toEqual({
    id,
    kind: "dm",
    personaIds: ["bianca"],
    ownerUid: UID,
    messagesPath: `rooms/${id}/messages`,
    jobsPath: `rooms/${id}/claudeJobs`,
    description: "비앙카와 사용자 한 명이 나누는 1:1 대화방",
    judgeState: "사용자와 봇의 한국어 1:1 대화 메시지를 하나씩 평가한다.",
  });
});

test("dmRoomId 와 resolveRoom 은 왕복한다", () => {
  const id = dmRoomId("kuro", UID);
  expect(id).toBe(`dm_kuro_${UID}`);
  const room = resolveRoom(id, fake);
  expect(room?.personaIds).toEqual(["kuro"]);
  expect(room?.ownerUid).toBe(UID);
  expect(room?.description).toBe("쿠로와 사용자 한 명이 나누는 1:1 대화방");
});

test("잘못된 방 id 는 null", () => {
  for (const id of ["dm_bianca", `dm_BIANCA_${UID}`, `dm_nobody_${UID}`, "x", "dm_bianca_n_123", `dm_bianca_${UID}x`, ""]) {
    expect(resolveRoom(id)).toBeNull();
  }
});

test("단체방은 부르는 말로 페르소나를 찾는다", () => {
  const room = resolveRoom("main", fake)!;
  expect(pickTarget(room, { uid: UID, text: "@쿠로 안녕" }, fake)).toEqual({ persona: fake[1], question: "안녕" });
  expect(pickTarget(room, { uid: UID, text: "그냥 말" }, fake)).toBeNull();
  expect(pickTarget(room, { uid: "bot_kuro", text: "@비앙카 안녕" }, fake)).toBeNull();
});

test("단체방에 없는 페르소나의 부르는 말은 null", () => {
  const room = { ...resolveRoom("main", fake)!, personaIds: ["bianca"] };
  expect(pickTarget(room, { uid: UID, text: "@쿠로 안녕" }, fake)).toBeNull();
});

test("1:1 방은 주인 메시지 전체가 질문이다", () => {
  const room = resolveRoom(dmRoomId("bianca", UID))!;
  expect(pickTarget(room, { uid: UID, text: " @비앙카 hi " })).toEqual({
    persona: expect.objectContaining({ id: "bianca" }),
    question: "@비앙카 hi",
  });
  expect(pickTarget(room, { uid: OTHER, text: "hi" })).toBeNull();
  expect(pickTarget(room, { uid: "claude", text: "hi" })).toBeNull();
  expect(pickTarget(room, { uid: UID, text: "   " })).toBeNull();
});
