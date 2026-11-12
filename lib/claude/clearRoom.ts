import type { Firestore, Timestamp } from "firebase-admin/firestore";
import { advanceMemoryState } from "@/lib/claude/memory";
import { markCleared } from "@/lib/claude/roomState";
import type { Room } from "@/lib/claude/rooms";
import { mongoConfigured } from "@/lib/mongo";

/**
 * 그 방을 처음 상태로 되돌린다. 문서는 지우지 않고 방 문서에 clearedAt 을 쓴다(화면·서버가 그 이후만 본다).
 * MongoDB 가 설정돼 있으면 기억 판정 상태를 clearedAt 으로 앞당겨 그 전 메시지를 다시 판정하지 않는다.
 */
export async function clearRoom(db: Firestore, room: Room, env: NodeJS.ProcessEnv = process.env): Promise<{ clearedAt: Timestamp }> {
  const clearedAt = await markCleared(db, room.id);
  if (mongoConfigured(env)) await advanceMemoryState(room.id, clearedAt, env);
  return { clearedAt };
}
