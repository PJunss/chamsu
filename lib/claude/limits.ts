import { getAdminDb } from "@/lib/firebaseAdmin";
import { DAILY_MAX, USER_MAX, USER_WINDOW_MS } from "@/lib/claude/constants";
import { nextRateState, type RateState } from "@/lib/rateLimit";

export function kstDayKey(nowMs: number): string {
  const d = new Date(nowMs + 9 * 3600_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function consumeClaudeQuota(uid: string, nowMs: number): Promise<"ok" | "user" | "daily"> {
  const db = getAdminDb();
  const userRef = db.collection("claudeLimits").doc(`user_${uid}`);
  const dayRef = db.collection("claudeLimits").doc(`day_${kstDayKey(nowMs)}`);
  return db.runTransaction(async (tx) => {
    const [u, d] = await Promise.all([tx.get(userRef), tx.get(dayRef)]);
    const user = nextRateState(u.exists ? (u.data() as RateState) : null, nowMs, USER_WINDOW_MS, USER_MAX);
    if (!user.allowed) return "user";
    const dayCount = d.exists ? ((d.data()?.count as number) ?? 0) : 0;
    if (dayCount >= DAILY_MAX) return "daily";
    tx.set(userRef, user.state);
    tx.set(dayRef, { count: dayCount + 1 });
    return "ok";
  });
}
