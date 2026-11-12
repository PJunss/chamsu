import type { Firestore, Query } from "firebase-admin/firestore";
import type { Room } from "@/lib/claude/rooms";

const DELETE_BATCH = 500;

/** 쿼리에 걸리는 문서를 DELETE_BATCH 개씩 지우고 지운 개수를 돌려준다. */
async function deleteAll(db: Firestore, query: Query): Promise<number> {
  let count = 0;
  for (;;) {
    const snap = await query.limit(DELETE_BATCH).get();
    if (snap.empty) return count;
    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    count += snap.size;
    if (snap.size < DELETE_BATCH) return count;
  }
}

export type ClearCounts = { messages: number; jobs: number; memories: number; affinity: number };

/** 그 방의 메시지·작업·기억·기억 판정 상태·호감도를 서버에서 모두 지운다. 지우는 중에 새로 온 메시지는 남을 수 있다. */
export async function clearRoom(db: Firestore, room: Room): Promise<ClearCounts> {
  const [messages, jobs, memories, affinity] = await Promise.all([
    deleteAll(db, db.collection(room.messagesPath)),
    deleteAll(db, db.collection(room.jobsPath)),
    deleteAll(db, db.collection("memories").where("roomId", "==", room.id)),
    deleteAll(db, db.collection("affinity").where("roomId", "==", room.id)),
  ]);
  await db.collection("memoryState").doc(room.id).delete();
  return { messages, jobs, memories, affinity };
}
