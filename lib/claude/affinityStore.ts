import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  affinityDelta, affinityDocId, clampAffinity, clearedBefore, effectiveAffinity, startsGainCooldown,
} from "@/lib/claude/affinity";
import { AFFINITY_DEFAULT } from "@/lib/claude/constants";

/** clearedAtMs 는 그 방을 /clear 한 시각. 그 전에 바뀐 문서는 없는 것(50, 오르기 간격 없음)으로 본다. */
export type AffinityKey = { roomId: string; personaId: string; uid: string; clearedAtMs?: number | null };

type Stamp = { toMillis?: () => number };
type AffinityDoc = { score?: unknown; updatedAt?: Stamp; lastGainAt?: Stamp | null };

/** /clear 이전 문서는 undefined 로 바꾼다. */
function visibleDoc(data: AffinityDoc | undefined, clearedAtMs: number | null | undefined): AffinityDoc | undefined {
  if (!data || typeof data.updatedAt?.toMillis !== "function") return data;
  return clearedBefore(data.updatedAt.toMillis(), clearedAtMs ?? null) ? undefined : data;
}

function currentScore(data: AffinityDoc | undefined, now: number): number {
  if (!data || typeof data.score !== "number" || typeof data.updatedAt?.toMillis !== "function") return AFFINITY_DEFAULT;
  return effectiveAffinity(data.score, data.updatedAt.toMillis(), now);
}

/** 시간 복귀를 반영한 호감도(소수). 문서가 없으면 AFFINITY_DEFAULT. 쓰지 않는다. */
export async function readAffinity(db: Firestore, key: AffinityKey & { now: number }): Promise<number> {
  const snap = await db.collection("affinity").doc(affinityDocId(key.roomId, key.personaId, key.uid)).get();
  return currentScore(visibleDoc(snap.exists ? (snap.data() as AffinityDoc) : undefined, key.clearedAtMs), key.now);
}

/**
 * 트랜잭션으로 복귀를 반영한 현재 값에서 호의·적대 점수로 변화량을 구해 더하고, 0~100 으로 잘라 소수 그대로 저장한다.
 * 호의가 AFFINITY_GAIN_MIN 이상이고 변화량이 0 보다 클 때만 lastGainAt 을 now 로 바꾸고, 아니면 그대로 둔다. 새 값과 적용한 변화량을 돌려준다.
 */
export async function applyAffinity(
  db: Firestore,
  key: AffinityKey & { pos: number; neg: number; now: number },
): Promise<{ score: number; delta: number }> {
  const { roomId, personaId, uid, pos, neg, now, clearedAtMs } = key;
  const ref = db.collection("affinity").doc(affinityDocId(roomId, personaId, uid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = visibleDoc(snap.exists ? (snap.data() as AffinityDoc) : undefined, clearedAtMs);
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
