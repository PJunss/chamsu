import { getAdminDb } from "@/lib/firebaseAdmin";
import { CLAUDE_LIMITS, type ClaudeLimits } from "@/lib/claude/constants";
import { nextRateState, type RateState } from "@/lib/rateLimit";

export function kstDayKey(nowMs: number): string {
  const d = new Date(nowMs + 9 * 3600_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** 켜진 제한만 검사하고 기록한다. 둘 다 꺼져 있으면 Firestore 에 접근하지 않는다. 방·페르소나를 가리지 않고 센다. */
export async function consumeClaudeQuota(
  uid: string,
  nowMs: number,
  limits: ClaudeLimits = CLAUDE_LIMITS,
): Promise<"ok" | "user" | "daily"> {
  const { user: userLimit, dailyMax } = limits;
  if (!userLimit && dailyMax === null) return "ok";
  const db = getAdminDb();
  const userRef = userLimit ? db.collection("claudeLimits").doc(`user_${uid}`) : null;
  const dayRef = dailyMax !== null ? db.collection("claudeLimits").doc(`day_${kstDayKey(nowMs)}`) : null;
  return db.runTransaction(async (tx) => {
    const [u, d] = await Promise.all([userRef && tx.get(userRef), dayRef && tx.get(dayRef)]);
    let userState: RateState | null = null;
    if (userLimit && u) {
      const next = nextRateState(u.exists ? (u.data() as RateState) : null, nowMs, userLimit.windowMs, userLimit.max);
      if (!next.allowed) return "user";
      userState = next.state;
    }
    let dayCount = 0;
    if (dailyMax !== null && d) {
      dayCount = d.exists ? ((d.data()?.count as number) ?? 0) : 0;
      if (dayCount >= dailyMax) return "daily";
    }
    if (userRef && userState) tx.set(userRef, userState);
    if (dayRef) tx.set(dayRef, { count: dayCount + 1 });
    return "ok";
  });
}
