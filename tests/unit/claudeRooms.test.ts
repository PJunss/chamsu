import { expect, test } from "vitest";
import { MAIN_ROOM_ID, dmRoomId, pickTargets, resolveRoom } from "@/lib/claude/rooms";
import type { PersonaInfo } from "@/lib/claude/personas/info";

const UID = "n_" + "0123456789abcdef".repeat(2);
const OTHER = "n_" + "fedcba9876543210".repeat(2);
const fake: PersonaInfo[] = [
  { id: "bianca", uid: "bot_bianca", nickname: "비앙카", trigger: "@비앙카", avatar: "/personas/bianca/avatar.jpeg" },
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

const lucy: PersonaInfo = { id: "lucy", uid: "bot_lucy", nickname: "루시", trigger: "@루시", avatar: "/lucy.png" };
const three = [...fake, lucy];

test("단체방 사람 메시지는 부른 봇들을 처음 나온 순서로, 단계 1·연쇄 시작은 그 사람", () => {
  const room = resolveRoom("main", fake)!;
  expect(pickTargets(room, { uid: UID, text: " @쿠로 안녕 " }, fake)).toEqual({
    personas: [fake[1]], question: "@쿠로 안녕", chainDepth: 1, chainRootUid: UID,
  });
  expect(pickTargets(room, { uid: UID, text: "안녕 @쿠로 @비앙카 @쿠로" }, fake)).toEqual({
    personas: [fake[1], fake[0]], question: "안녕 @쿠로 @비앙카 @쿠로", chainDepth: 1, chainRootUid: UID,
  });
  expect(pickTargets(room, { uid: UID, text: "그냥 말" }, fake)).toBeNull();
  expect(pickTargets(room, { uid: UID, text: "@쿠로" }, fake)).toBeNull();
});

test("사람 메시지의 chainDepth 는 보지 않는다", () => {
  const room = resolveRoom("main", fake)!;
  expect(pickTargets(room, { uid: UID, text: "@쿠로 hi", chainDepth: 9, chainRootUid: OTHER }, fake)).toEqual(
    expect.objectContaining({ chainDepth: 1, chainRootUid: UID }),
  );
});

test("단체방에 없는 페르소나는 대상에서 빠지고, 남는 게 없으면 null", () => {
  const room = { ...resolveRoom("main", fake)!, personaIds: ["bianca"] };
  expect(pickTargets(room, { uid: UID, text: "@쿠로 안녕" }, fake)).toBeNull();
  expect(pickTargets(room, { uid: UID, text: "@쿠로 @비앙카 안녕" }, fake)?.personas).toEqual([fake[0]]);
});

test("봇 메시지는 단계를 하나 올리고 연쇄 시작 사람을 이어받는다", () => {
  const room = resolveRoom("main", fake)!;
  expect(pickTargets(room, { uid: "bot_kuro", text: "@비앙카 너는?", chainDepth: 1, chainRootUid: UID }, fake)).toEqual({
    personas: [fake[0]], question: "@비앙카 너는?", chainDepth: 2, chainRootUid: UID,
  });
});

test("봇 메시지는 chainDepth 3 까지 받고 4 는 null", () => {
  const room = resolveRoom("main", fake)!;
  const msg = { uid: "bot_kuro", text: "@비앙카 너는?", chainRootUid: UID };
  expect(pickTargets(room, { ...msg, chainDepth: 3 }, fake)?.chainDepth).toBe(4);
  expect(pickTargets(room, { ...msg, chainDepth: 4 }, fake)).toBeNull();
});

test("봇 메시지에 chainDepth 나 chainRootUid 가 없으면 null", () => {
  const room = resolveRoom("main", fake)!;
  expect(pickTargets(room, { uid: "bot_kuro", text: "@비앙카 너는?", chainRootUid: UID }, fake)).toBeNull();
  expect(pickTargets(room, { uid: "bot_kuro", text: "@비앙카 너는?", chainDepth: "1", chainRootUid: UID }, fake)).toBeNull();
  expect(pickTargets(room, { uid: "bot_kuro", text: "@비앙카 너는?", chainDepth: 1 }, fake)).toBeNull();
});

test("봇은 자기 자신을 부르지 않고, 다른 봇이 없으면 null", () => {
  const room = resolveRoom("main", three)!;
  expect(pickTargets(room, { uid: "bot_kuro", text: "@쿠로 @루시 안녕", chainDepth: 1, chainRootUid: UID }, three)?.personas).toEqual([lucy]);
  expect(pickTargets(room, { uid: "bot_kuro", text: "나 @쿠로 야", chainDepth: 1, chainRootUid: UID }, three)).toBeNull();
  expect(pickTargets(room, { uid: "bot_kuro", text: "그냥 말", chainDepth: 1, chainRootUid: UID }, three)).toBeNull();
});

test("1:1 방은 주인 메시지 전체가 질문이고 봇 메시지는 null", () => {
  const room = resolveRoom(dmRoomId("bianca", UID))!;
  expect(pickTargets(room, { uid: UID, text: " @비앙카 hi " })).toEqual({
    personas: [expect.objectContaining({ id: "bianca" })],
    question: "@비앙카 hi",
    chainDepth: 1,
    chainRootUid: UID,
  });
  expect(pickTargets(room, { uid: OTHER, text: "hi" })).toBeNull();
  expect(pickTargets(room, { uid: "bot_bianca", text: "hi", chainDepth: 1, chainRootUid: UID })).toBeNull();
  expect(pickTargets(room, { uid: UID, text: "   " })).toBeNull();
});
