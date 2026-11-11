import { getAdminDb } from "@/lib/firebaseAdmin";
import { toDocId } from "@/lib/clientIp";
import { nextRateState, type RateState } from "@/lib/rateLimit";

export async function consumeAttempt(ip: string): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.collection("rateLimits").doc(toDocId(ip));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() as RateState) : null;
    const { allowed, state } = nextRateState(prev, Date.now());
    if (allowed) tx.set(ref, state);
    return allowed;
  });
}
