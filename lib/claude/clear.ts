import type { Room } from "@/lib/claude/rooms";

export const CLEAR_COMMAND = "/clear";

/** 1:1 방에서 방 주인이 앞뒤 공백을 지운 본문이 정확히 /clear 인 메시지를 보냈는지. 단체방의 /clear 는 평범한 메시지다. */
export function isClearCommand(room: Room, message: { uid: string; text: unknown }): boolean {
  return (
    room.kind === "dm" &&
    message.uid === room.ownerUid &&
    typeof message.text === "string" &&
    message.text.trim() === CLEAR_COMMAND
  );
}
