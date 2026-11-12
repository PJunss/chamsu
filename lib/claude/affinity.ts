import {
  AFFINITY_DECAY_PER_DAY, AFFINITY_DEFAULT, AFFINITY_GAIN, AFFINITY_GAIN_COOLDOWN_MS, AFFINITY_GAIN_MIN, AFFINITY_LOSS,
  AFFINITY_NEG_MIN,
  AFFINITY_NOISE,
} from "@/lib/claude/constants";

/** 호감도 계산. firebase 를 쓰지 않아 서버와 화면이 같이 쓴다. 저장값은 소수이고, 화면·프롬프트·구간은 버린 정수를 쓴다. */

const DAY_MS = 86_400_000;

/** Jev 점수를 0~1 로 자른다. 숫자가 아니면 0. */
export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

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
 * 호의·적대 점수는 0~1 로 자르고, 호의는 AFFINITY_NOISE 미만, 적대는 AFFINITY_NEG_MIN 미만이면 0 으로 본다(봇을 향한 욕·비하·위협·능력 비난만 깎는다). 마지막으로 오른 시각(lastGainAtMs)에서 AFFINITY_GAIN_COOLDOWN_MS 가 지나지 않았으면 호의 몫은 0 이다.
 */
export function affinityDelta(
  current: number,
  pos: number,
  neg: number,
  lastGainAtMs: number | null,
  nowMs: number,
): number {
  const cooling = lastGainAtMs !== null && nowMs - lastGainAtMs < AFFINITY_GAIN_COOLDOWN_MS;
  const gain = cooling ? 0 : (AFFINITY_GAIN * denoise(pos) * (100 - current)) / 100;
  return gain - AFFINITY_LOSS * denoise(neg, AFFINITY_NEG_MIN);
}

function denoise(v: number, min: number = AFFINITY_NOISE): number {
  const c = clamp01(v);
  return c < min ? 0 : c;
}

/** 이 변화로 오르기 간격(lastGainAt)을 새로 시작하는지. 호의가 AFFINITY_GAIN_MIN 이상이고 실제로 올랐을 때만이다. */
export function startsGainCooldown(pos: number, delta: number): boolean {
  return clamp01(pos) >= AFFINITY_GAIN_MIN && delta > 0;
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

/** 방을 /clear 한 시각(clearedAtMs) 이전에 마지막으로 바뀐 호감도 문서는 없는 것으로 본다. */
export function clearedBefore(updatedAtMs: number, clearedAtMs: number | null): boolean {
  return clearedAtMs !== null && updatedAtMs <= clearedAtMs;
}

export type AffinityRow = { personaId: string; score: number; updatedAtMs: number };

/**
 * 화면에 보일 페르소나별 호감도(복귀 반영, 버린 정수). 문서가 없거나 /clear 이전 문서인 페르소나는 넣지 않는다.
 */
export function affinityByPersona(
  rows: readonly AffinityRow[],
  nowMs: number,
  clearedAtMs: number | null = null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (clearedBefore(r.updatedAtMs, clearedAtMs)) continue;
    out[r.personaId] = displayAffinity(effectiveAffinity(r.score, r.updatedAtMs, nowMs));
  }
  return out;
}

/** 화면에 보일 한 페르소나의 호감도. 문서가 없으면 AFFINITY_DEFAULT. */
export function shownAffinity(scores: Readonly<Record<string, number>>, personaId: string): number {
  return scores[personaId] ?? AFFINITY_DEFAULT;
}
