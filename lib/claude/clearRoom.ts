import type { Firestore, Query } from "firebase-admin/firestore";
import type { MemoryDoc, MemoryStateDoc } from "@/lib/claude/memory";
import type { Room } from "@/lib/claude/rooms";
import { mongoCollection, mongoConfigured } from "@/lib/mongo";

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

/**
 * 그 방을 처음 상태로 지운다. MongoDB 의 기억·판정 상태를 먼저 지우고, 성공했을 때만 Firestore 의 메시지·작업·호감도를 지운다.
 * MongoDB 가 실패하면 아무것도 지우지 않고 throw 한다. MONGODB_URI 가 없으면 MongoDB 에는 기억이 없으므로 Firestore 만 지운다.
 * 지우는 중에 새로 온 메시지는 남을 수 있다.
 */
export async function clearRoom(db: Firestore, room: Room, env: NodeJS.ProcessEnv = process.env): Promise<ClearCounts> {
  let memories = 0;
  if (mongoConfigured(env)) {
    const [memoryCol, stateCol] = await Promise.all([
      mongoCollection<MemoryDoc>("memories", env),
      mongoCollection<MemoryStateDoc>("memoryState", env),
    ]);
    memories = (await memoryCol.deleteMany({ roomId: room.id })).deletedCount;
    await stateCol.deleteOne({ _id: room.id });
  }
  const [messages, jobs, affinity] = await Promise.all([
    deleteAll(db, db.collection(room.messagesPath)),
    deleteAll(db, db.collection(room.jobsPath)),
    deleteAll(db, db.collection("affinity").where("roomId", "==", room.id)),
  ]);
  return { messages, jobs, memories, affinity };
}
