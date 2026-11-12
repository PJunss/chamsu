import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { affinityDocId, clampAffinity, effectiveAffinity } from "@/lib/claude/affinity";
import { AFFINITY_DEFAULT } from "@/lib/claude/constants";

export type AffinityKey = { roomId: string; personaId: string; uid: string };

type AffinityDoc = { score?: unknown; updatedAt?: { toMillis?: () => number } };

function currentScore(data: AffinityDoc | undefined, now: number): number {
  if (!data || typeof data.score !== "number" || typeof data.updatedAt?.toMillis !== "function") return AFFINITY_DEFAULT;
  return effectiveAffinity(data.score, data.updatedAt.toMillis(), now);
}

/** 시간 복귀를 반영한 호감도. 문서가 없으면 AFFINITY_DEFAULT. 쓰지 않는다. */
export async function readAffinity(db: Firestore, key: AffinityKey & { now: number }): Promise<number> {
  const snap = await db.collection("affinity").doc(affinityDocId(key.roomId, key.personaId, key.uid)).get();
  return clampAffinity(currentScore(snap.exists ? (snap.data() as AffinityDoc) : undefined, key.now));
}

/** 트랜잭션으로 복귀를 반영한 값에 delta 를 더해 0~100 정수로 저장하고 새 값을 돌려준다. */
export async function applyAffinity(db: Firestore, key: AffinityKey & { delta: number; now: number }): Promise<number> {
  const { roomId, personaId, uid, delta, now } = key;
  const ref = db.collection("affinity").doc(affinityDocId(roomId, personaId, uid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = clampAffinity(currentScore(snap.exists ? (snap.data() as AffinityDoc) : undefined, now) + delta);
    tx.set(ref, { roomId, personaId, uid, score: next, updatedAt: Timestamp.fromMillis(now) });
    return next;
  });
}
