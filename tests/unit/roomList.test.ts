import { expect, test } from "vitest";
import { buildRoomItems } from "@/lib/claude/roomList";

test("페르소나마다 내 방 하나", () => {
  expect(buildRoomItems("u1")).toEqual([
    { roomId: "u1_bianca", personaId: "bianca", title: "비앙카", avatar: "/personas/bianca/avatar.jpeg" },
    { roomId: "u1_lucia", personaId: "lucia", title: "루치아", avatar: "/personas/lucia/avatar.png" },
  ]);
});
