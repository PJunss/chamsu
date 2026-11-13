import type { QuotaStatus } from "@/lib/claude/limits";

/** 다 썼고 아직 풀리지 않았는지. resetAt 이 없거나 이미 지났으면 다 쓴 것이 아니다. */
export function quotaExhausted(window: QuotaStatus["window"], nowMs: number): boolean {
  return window !== null && window.used >= window.max && window.resetAt !== null && window.resetAt > nowMs;
}

/**
 * 입력창 위에 보일 한 줄. window 가 null 이면 null(줄을 숨긴다).
 * 문구의 "10분" 은 고정이다. CLAUDE_LIMITS.user.windowMs 를 바꾸면 이 문구도 같이 고친다.
 */
export function quotaText(window: QuotaStatus["window"], nowMs: number): string | null {
  if (window === null) return null;
  if (quotaExhausted(window, nowMs) && window.resetAt !== null) {
    const minutes = Math.max(1, Math.ceil((window.resetAt - nowMs) / 60_000));
    return `10분 한도를 다 썼어요. ${minutes}분 뒤에 풀려요`;
  }
  const open = window.resetAt !== null && window.resetAt > nowMs;
  const left = open ? Math.max(0, window.max - window.used) : window.max;
  return `10분 한도 ${left}/${window.max} 남음`;
}
