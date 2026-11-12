import { AFFINITY_DECAY_PER_DAY, AFFINITY_DEFAULT, AFFINITY_MAX_DELTA } from "@/lib/claude/constants";

/** 호감도 계산. firebase 를 쓰지 않아 서버와 화면이 같이 쓴다. */

const DAY_MS = 86_400_000;

export function affinityDocId(roomId: string, personaId: string, uid: string): string {
  return `${roomId}_${personaId}_${uid}`;
}

/** 저장된 점수를 updatedAt 부터 지난 날 수 × AFFINITY_DECAY_PER_DAY 만큼 AFFINITY_DEFAULT 쪽으로 옮긴 값. 기본값을 넘어가지 않는다. */
export function effectiveAffinity(score: number, updatedAtMs: number, nowMs: number): number {
  const move = (Math.max(0, nowMs - updatedAtMs) / DAY_MS) * AFFINITY_DECAY_PER_DAY;
  if (score > AFFINITY_DEFAULT) return Math.max(AFFINITY_DEFAULT, score - move);
  if (score < AFFINITY_DEFAULT) return Math.min(AFFINITY_DEFAULT, score + move);
  return score;
}

/** Jev 의 호의·적대 점수(0~1)로 정한 변화량. round(5 × (호의 − 적대)) 를 −5~+5 로 자른다. */
export function affinityDelta(pos: number, neg: number): number {
  const d = Math.round(AFFINITY_MAX_DELTA * (pos - neg));
  return Math.min(AFFINITY_MAX_DELTA, Math.max(-AFFINITY_MAX_DELTA, d)) + 0;
}

/** 0~20, 21~40, 41~60, 61~80, 81~100 의 구간 번호(0~4). 소수는 반올림해 본다. */
export function affinityBand(score: number): 0 | 1 | 2 | 3 | 4 {
  const s = Math.round(score);
  if (s <= 20) return 0;
  if (s <= 40) return 1;
  if (s <= 60) return 2;
  if (s <= 80) return 3;
  return 4;
}

export function clampAffinity(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)));
}
