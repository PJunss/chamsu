import { FieldValue, type Firestore, type Timestamp } from "firebase-admin/firestore";

/** 서버 전용. Firestore rooms/{roomId} 문서의 clearedAt(/clear 한 시각)을 읽고 쓴다. */

type RoomDoc = { clearedAt?: unknown };

function asTimestamp(v: unknown): Timestamp | null {
  return v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function" ? (v as Timestamp) : null;
}

/** 방을 /clear 한 시각. 방 문서나 값이 없으면 null. */
export async function readClearedAt(db: Firestore, roomId: string): Promise<Timestamp | null> {
  const snap = await db.collection("rooms").doc(roomId).get();
  return snap.exists ? asTimestamp((snap.data() as RoomDoc | undefined)?.clearedAt) : null;
}

/** clearedAt 을 서버 시각으로 쓰고, 저장된 값을 다시 읽어 돌려준다. */
export async function markCleared(db: Firestore, roomId: string): Promise<Timestamp> {
  const ref = db.collection("rooms").doc(roomId);
  await ref.set({ clearedAt: FieldValue.serverTimestamp() }, { merge: true });
  const clearedAt = asTimestamp(((await ref.get()).data() as RoomDoc | undefined)?.clearedAt);
  if (!clearedAt) throw new Error("clearedAt missing");
  return clearedAt;
}
