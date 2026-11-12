import { general } from "korcen";
import { clamp01 } from "@/lib/claude/affinity";
import { AFFINITY_LAUGH_FACTOR } from "@/lib/claude/constants";

/** 서버 전용. korcen 사전이 커서 브라우저에서 쓰는 affinity.ts 와 나눠 둔다. */

const LAUGH = /ㅋㅋ|ㅎㅎ|히히|하하|키키|lol|😂|🤣/i;

/** 메시지에 웃음 표시(ㅋㅋ, ㅎㅎ, 히히 등)가 있는지. */
export function hasLaugh(text: string): boolean {
  return LAUGH.test(text);
}

/** korcen 의 일반 욕설 사전에 걸리는 말이 있는지. */
export function hasProfanity(text: string): boolean {
  return general(text);
}

/**
 * 호감도 계산에 쓸 적대 점수. 웃음 표시가 있으면 장난으로 보고 AFFINITY_LAUGH_FACTOR 를 곱한다.
 * 가드레일에 걸린 메시지(guarded)나 욕설이 든 메시지는 웃음 표시가 있어도 줄이지 않는다.
 */
export function affinityNeg(neg: number, text: string, guarded: boolean): number {
  if (guarded || !hasLaugh(text) || hasProfanity(text)) return neg;
  return clamp01(neg) * AFFINITY_LAUGH_FACTOR;
}
