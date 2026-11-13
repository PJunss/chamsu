import { describe, expect, test } from "vitest";
import { pickTarget, resolveRoom, roomIdFor } from "@/lib/claude/rooms";

const UID = "AbC123xyz456DEF789ghi012JKL3";

describe("resolveRoom", () => {
  test("uid 와 페르소나 id 로 방을 푼다", () => {
    const room = resolveRoom(roomIdFor(UID, "bianca"));
    expect(room).toMatchObject({
      id: `${UID}_bianca`,
      personaId: "bianca",
      ownerUid: UID,
      messagesPath: `rooms/${UID}_bianca/messages`,
      jobsPath: `rooms/${UID}_bianca/claudeJobs`,
    });
  });
  test("없는 페르소나, 틀린 형식은 null", () => {
    expect(resolveRoom(`${UID}_nobody`)).toBeNull();
    expect(resolveRoom("main")).toBeNull();
    expect(resolveRoom(`${UID}_`)).toBeNull();
    expect(resolveRoom(`a/b_bianca`)).toBeNull();
    expect(resolveRoom(`dm_bianca_${UID}`)).toBeNull();
  });
});

describe("pickTarget", () => {
  const room = resolveRoom(roomIdFor(UID, "lucia"))!;
  test("주인이 쓴 메시지는 그 방 페르소나가 답한다", () => {
    expect(pickTarget(room, { uid: UID, text: "  안녕  " })).toMatchObject({ persona: { id: "lucia" }, question: "안녕" });
  });
  test("남이 쓴 메시지, 봇 메시지, 빈 본문은 null", () => {
    expect(pickTarget(room, { uid: "other", text: "안녕" })).toBeNull();
    expect(pickTarget(room, { uid: "bot_lucia", text: "안녕" })).toBeNull();
    expect(pickTarget(room, { uid: UID, text: "   " })).toBeNull();
  });
});
