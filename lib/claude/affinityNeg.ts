import { check } from "korcen";
import { clamp01 } from "@/lib/claude/affinity";
import { AFFINITY_LAUGH_FACTOR, AFFINITY_THREAT_MIN, AFFINITY_THREAT_NEG } from "@/lib/claude/constants";

/** 서버 전용. korcen 사전이 커서 브라우저에서 쓰는 affinity.ts 와 나눠 둔다. */

const LAUGH = /ㅋㅋ|ㅎㅎ|히히|하하|키키|lol|😂|🤣/i;

/** 위협 표현. korcen 사전에 없는 것(죽여버린다, 쳐맞을래 등)을 채운다. */
const THREAT = /죽(여|일|을래|인다|는다)|뒤질|디질|쳐\s*맞|맞을래|패(버|줄)|때려\s*(줄|버)/;

/** 메시지에 웃음 표시(ㅋㅋ, ㅎㅎ, 히히 등)가 있는지. */
export function hasLaugh(text: string): boolean {
  return LAUGH.test(text);
}

/** 위협 표현이 있는지. */
export function hasThreatWord(text: string): boolean {
  return THREAT.test(text);
}

/** 욕설·비하(korcen 전체 사전)나 위협 표현이 있는지. */
export function hasProfanity(text: string): boolean {
  return check(text) || hasThreatWord(text);
}

/**
 * 호감도 계산에 쓸 호의·적대 점수.
 * - 위협 표현이 있고 Jev 협박 점수가 AFFINITY_THREAT_MIN 이상이면 협박으로 본다: 호의는 0, 적대는 최소 AFFINITY_THREAT_NEG.
 * - 그 밖에 웃음 표시가 있으면 장난으로 보고 적대에 AFFINITY_LAUGH_FACTOR 를 곱한다.
 *   가드레일에 걸린 메시지(guarded)나 욕설·위협이 든 메시지는 줄이지 않는다.
 */
export function affinityScores(
  scores: { pos: number; neg: number; threat: number },
  text: string,
  guarded: boolean,
): { pos: number; neg: number } {
  const { pos, neg, threat } = scores;
  if (hasThreatWord(text) && clamp01(threat) >= AFFINITY_THREAT_MIN) {
    return { pos: 0, neg: Math.max(clamp01(neg), AFFINITY_THREAT_NEG) };
  }
  if (guarded || !hasLaugh(text) || hasProfanity(text)) return { pos, neg };
  return { pos, neg: clamp01(neg) * AFFINITY_LAUGH_FACTOR };
}
