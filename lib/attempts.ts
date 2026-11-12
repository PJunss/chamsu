import { toDocId } from "@/lib/clientIp";
import { mongoCollection, withMongoTransaction } from "@/lib/mongo";
import { WINDOW_MS, nextRateState } from "@/lib/rateLimit";

/** MongoDB rateLimits 문서. _id 는 toDocId(ip), expireAt 은 창이 끝나는 시각(TTL 색인이 지운다). */
type AttemptDoc = { _id: string; count: number; windowStart: number; expireAt: Date };

/** PIN 시도 하나를 센다. 창 안에서 한도를 넘으면 false. MONGODB_URI 가 없으면 throw 한다. */
export async function consumeAttempt(ip: string, now: number = Date.now(), env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const col = await mongoCollection<AttemptDoc>("rateLimits", env);
  const id = toDocId(ip);
  return withMongoTransaction(async (session) => {
    const prev = await col.findOne({ _id: id }, { session });
    const { allowed, state } = nextRateState(prev ? { count: prev.count, windowStart: prev.windowStart } : null, now);
    if (allowed) {
      await col.replaceOne(
        { _id: id },
        { ...state, expireAt: new Date(state.windowStart + WINDOW_MS) },
        { upsert: true, session },
      );
    }
    return allowed;
  }, env);
}
