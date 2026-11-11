export const WINDOW_MS = 60_000;
export const MAX_ATTEMPTS = 10;

export type RateState = { count: number; windowStart: number };

export function nextRateState(prev: RateState | null, now: number): { allowed: boolean; state: RateState } {
  if (!prev || now - prev.windowStart >= WINDOW_MS) {
    return { allowed: true, state: { count: 1, windowStart: now } };
  }
  if (prev.count >= MAX_ATTEMPTS) return { allowed: false, state: prev };
  return { allowed: true, state: { count: prev.count + 1, windowStart: prev.windowStart } };
}
