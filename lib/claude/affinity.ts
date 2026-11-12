import { AFFINITY_DECAY_PER_DAY, AFFINITY_DEFAULT, AFFINITY_GAIN, AFFINITY_LOSS } from "@/lib/claude/constants";

/** 호감도 계산. firebase 를 쓰지 않아 서버와 화면이 같이 쓴다. 저장값은 소수이고, 화면·프롬프트·구간은 버린 정수를 쓴다. */

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

/**
 * Jev 의 호의·적대 점수(0~1)와 복귀를 반영한 현재 값으로 정한 변화량(소수, 반올림하지 않음).
 * AFFINITY_GAIN × 호의 × (100 − 현재) / 100 − AFFINITY_LOSS × 적대. 높을수록 덜 오르고, 내리기는 쉽다.
 */
export function affinityDelta(current: number, pos: number, neg: number): number {
  return (AFFINITY_GAIN * pos * (100 - current)) / 100 - AFFINITY_LOSS * neg;
}

/** 화면과 프롬프트에 쓰는 정수(소수점 버림). */
export function displayAffinity(score: number): number {
  return Math.floor(score);
}

/** 0~20, 21~40, 41~60, 61~80, 81~100 의 구간 번호(0~4). 소수점을 버린 정수로 본다. */
export function affinityBand(score: number): 0 | 1 | 2 | 3 | 4 {
  const s = displayAffinity(score);
  if (s <= 20) return 0;
  if (s <= 40) return 1;
  if (s <= 60) return 2;
  if (s <= 80) return 3;
  return 4;
}

export function clampAffinity(score: number): number {
  return Math.min(100, Math.max(0, score));
}
