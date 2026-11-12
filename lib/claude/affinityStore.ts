import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { affinityDelta, affinityDocId, clampAffinity, effectiveAffinity, startsGainCooldown } from "@/lib/claude/affinity";
import { AFFINITY_DEFAULT } from "@/lib/claude/constants";

export type AffinityKey = { roomId: string; personaId: string; uid: string };

type Stamp = { toMillis?: () => number };
type AffinityDoc = { score?: unknown; updatedAt?: Stamp; lastGainAt?: Stamp | null };

function currentScore(data: AffinityDoc | undefined, now: number): number {
  if (!data || typeof data.score !== "number" || typeof data.updatedAt?.toMillis !== "function") return AFFINITY_DEFAULT;
  return effectiveAffinity(data.score, data.updatedAt.toMillis(), now);
}

/** 시간 복귀를 반영한 호감도(소수). 문서가 없으면 AFFINITY_DEFAULT. 쓰지 않는다. */
export async function readAffinity(db: Firestore, key: AffinityKey & { now: number }): Promise<number> {
  const snap = await db.collection("affinity").doc(affinityDocId(key.roomId, key.personaId, key.uid)).get();
  return currentScore(snap.exists ? (snap.data() as AffinityDoc) : undefined, key.now);
}

/**
 * 트랜잭션으로 복귀를 반영한 현재 값에서 호의·적대 점수로 변화량을 구해 더하고, 0~100 으로 잘라 소수 그대로 저장한다.
 * 호의가 AFFINITY_GAIN_MIN 이상이고 변화량이 0 보다 클 때만 lastGainAt 을 now 로 바꾸고, 아니면 그대로 둔다. 새 값과 적용한 변화량을 돌려준다.
 */
export async function applyAffinity(
  db: Firestore,
  key: AffinityKey & { pos: number; neg: number; now: number },
): Promise<{ score: number; delta: number }> {
  const { roomId, personaId, uid, pos, neg, now } = key;
  const ref = db.collection("affinity").doc(affinityDocId(roomId, personaId, uid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as AffinityDoc) : undefined;
    const current = currentScore(data, now);
    const lastGain = data?.lastGainAt ?? null;
    const lastGainAtMs = typeof lastGain?.toMillis === "function" ? lastGain.toMillis() : null;
    const delta = affinityDelta(current, pos, neg, lastGainAtMs, now);
    const score = clampAffinity(current + delta);
    tx.set(ref, {
      roomId,
      personaId,
      uid,
      score,
      updatedAt: Timestamp.fromMillis(now),
      lastGainAt: startsGainCooldown(pos, delta) ? Timestamp.fromMillis(now) : lastGain,
    });
    return { score, delta: score - current };
  });
}
