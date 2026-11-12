import { expect, test } from "vitest";
import { buildRoomItems } from "@/lib/claude/roomList";
import { resolveRoom } from "@/lib/claude/rooms";
import { PERSONAS, type PersonaInfo } from "@/lib/claude/personas/info";

const ME = "n_" + "0123456789abcdef".repeat(2);
const fake: PersonaInfo[] = [
  { id: "bianca", uid: "bot_bianca", nickname: "비앙카", trigger: "@비앙카", avatar: "/personas/bianca/avatar.jpeg" },
  { id: "kuro", uid: "bot_kuro", nickname: "쿠로", trigger: "@쿠로", avatar: "/kuro.png" },
];

test("첫 항목은 전체 채팅방", () => {
  expect(buildRoomItems(ME)[0]).toEqual({ roomId: "main", title: "전체 채팅방", avatar: null, kind: "group" });
});

test("페르소나마다 내 1:1 방이 하나씩 붙는다", () => {
  expect(buildRoomItems(ME)).toHaveLength(PERSONAS.length + 1);
  const items = buildRoomItems(ME, fake);
  expect(items.slice(1)).toEqual([
    { roomId: `dm_bianca_${ME}`, title: "비앙카", avatar: "/personas/bianca/avatar.jpeg", kind: "dm" },
    { roomId: `dm_kuro_${ME}`, title: "쿠로", avatar: "/kuro.png", kind: "dm" },
  ]);
  for (const it of items.slice(1)) {
    const room = resolveRoom(it.roomId, fake);
    expect(room?.kind).toBe("dm");
    expect(room?.ownerUid).toBe(ME);
  }
});
