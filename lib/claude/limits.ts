import { CLAUDE_LIMITS, type ClaudeLimits } from "@/lib/claude/constants";
import { mongoCollection, withMongoTransaction } from "@/lib/mongo";
import { nextRateState } from "@/lib/rateLimit";

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3600_000;

export function kstDayKey(nowMs: number): string {
  const d = new Date(nowMs + KST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** 하루 문서가 지워지는 시각: 그날 KST 끝 + 1일. */
export function kstDayExpireAt(nowMs: number): Date {
  const dayStart = Math.floor((nowMs + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  return new Date(dayStart + 2 * DAY_MS);
}

/** MongoDB claudeLimits 문서. _id 는 user_{uid} 또는 day_{YYYYMMDD}. */
type LimitDoc = { _id: string; count: number; windowStart?: number; expireAt: Date };

/** 켜진 제한만 검사하고 기록한다. 둘 다 꺼져 있으면 MongoDB 에 접근하지 않는다. 방·페르소나를 가리지 않고 센다. */
export async function consumeClaudeQuota(
  uid: string,
  nowMs: number,
  limits: ClaudeLimits = CLAUDE_LIMITS,
  env: NodeJS.ProcessEnv = process.env,
): Promise<"ok" | "user" | "daily"> {
  const { user: userLimit, dailyMax } = limits;
  if (!userLimit && dailyMax === null) return "ok";
  const col = await mongoCollection<LimitDoc>("claudeLimits", env);
  const userId = `user_${uid}`;
  const dayId = `day_${kstDayKey(nowMs)}`;
  return withMongoTransaction(async (session) => {
    /** 한 세션 안의 명령은 동시에 보내지 않고 차례로 보낸다. */
    const u = userLimit ? await col.findOne({ _id: userId }, { session }) : null;
    const d = dailyMax !== null ? await col.findOne({ _id: dayId }, { session }) : null;
    let userState: { count: number; windowStart: number } | null = null;
    if (userLimit) {
      const prev = u && typeof u.windowStart === "number" ? { count: u.count, windowStart: u.windowStart } : null;
      const next = nextRateState(prev, nowMs, userLimit.windowMs, userLimit.max);
      if (!next.allowed) return "user";
      userState = next.state;
    }
    let dayCount = 0;
    if (dailyMax !== null) {
      dayCount = d?.count ?? 0;
      if (dayCount >= dailyMax) return "daily";
    }
    if (userLimit && userState) {
      await col.replaceOne(
        { _id: userId },
        { ...userState, expireAt: new Date(userState.windowStart + userLimit.windowMs) },
        { upsert: true, session },
      );
    }
    if (dailyMax !== null) {
      await col.replaceOne({ _id: dayId }, { count: dayCount + 1, expireAt: kstDayExpireAt(nowMs) }, { upsert: true, session });
    }
    return "ok";
  }, env);
}
