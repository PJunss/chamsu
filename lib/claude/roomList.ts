import { PERSONAS, type PersonaInfo } from "@/lib/claude/personas/info";
import { MAIN_ROOM_ID, dmRoomId } from "@/lib/claude/rooms";

export type RoomItem = { roomId: string; title: string; avatar: string | null; kind: "group" | "dm" };

/** 방 목록: 전체 채팅방 다음에 페르소나마다 내 1:1 방. Firestore 를 읽지 않고 코드로 만든다. */
export function buildRoomItems(myUid: string, list: readonly PersonaInfo[] = PERSONAS): RoomItem[] {
  return [
    { roomId: MAIN_ROOM_ID, title: "전체 채팅방", avatar: null, kind: "group" },
    ...list.map((p) => ({ roomId: dmRoomId(p.id, myUid), title: p.nickname, avatar: p.avatar, kind: "dm" as const })),
  ];
}
