export const WINDOW_MS = 60_000;
export const MAX_ATTEMPTS = 10;

export type RateState = { count: number; windowStart: number };

export function nextRateState(
  prev: RateState | null,
  now: number,
  windowMs: number = WINDOW_MS,
  max: number = MAX_ATTEMPTS,
): { allowed: boolean; state: RateState } {
  if (!prev || now - prev.windowStart >= windowMs) {
    return { allowed: true, state: { count: 1, windowStart: now } };
  }
  if (prev.count >= max) return { allowed: false, state: prev };
  return { allowed: true, state: { count: prev.count + 1, windowStart: prev.windowStart } };
}
