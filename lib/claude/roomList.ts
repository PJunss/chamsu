import { PERSONAS, type PersonaInfo } from "@/lib/claude/personas/info";
import { roomIdFor } from "@/lib/claude/rooms";

export type RoomItem = { roomId: string; personaId: string; title: string; avatar: string };

/** 방 목록: 페르소나마다 내 1:1 방 하나. Firestore 를 읽지 않고 코드로 만든다. */
export function buildRoomItems(myUid: string, list: readonly PersonaInfo[] = PERSONAS): RoomItem[] {
  return list.map((p) => ({ roomId: roomIdFor(myUid, p.id), personaId: p.id, title: p.nickname, avatar: p.avatar }));
}
