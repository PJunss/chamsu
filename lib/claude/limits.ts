import { CLAUDE_LIMITS, LIMIT_DAY_RESET_HOUR_KST, type ClaudeLimits } from "@/lib/claude/constants";
import { mongoCollection, withMongoTransaction } from "@/lib/mongo";
import { nextRateState } from "@/lib/rateLimit";

const DAY_MS = 86_400_000;
/** 한도 날짜는 한국 시간 LIMIT_DAY_RESET_HOUR_KST 시에 바뀐다. UTC 시각에 이만큼 더하면 한도 날짜의 자정이 UTC 자정에 온다. */
const LIMIT_DAY_OFFSET_MS = (9 - LIMIT_DAY_RESET_HOUR_KST) * 3600_000;

/** 그 시각이 속한 한도 날짜(YYYYMMDD). 한국 시간 06:00 부터 다음 날 06:00 전까지가 하루다. */
export function limitDayKey(nowMs: number): string {
  const d = new Date(nowMs + LIMIT_DAY_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** 하루 문서가 지워지는 시각: 그 한도 날짜가 끝나는 시각 + 1일. */
export function limitDayExpireAt(nowMs: number): Date {
  const dayStart = Math.floor((nowMs + LIMIT_DAY_OFFSET_MS) / DAY_MS) * DAY_MS - LIMIT_DAY_OFFSET_MS;
  return new Date(dayStart + 2 * DAY_MS);
}

/** 사람당 하루 사용량 문서 id. */
export function userDayDocId(uid: string, nowMs: number): string {
  return `userday_${uid}_${limitDayKey(nowMs)}`;
}

/** MongoDB claudeLimits 문서. _id 는 user_{uid}(시간 창), userday_{uid}_{YYYYMMDD}(사람당 하루), day_{YYYYMMDD}(전체 하루). */
type LimitDoc = { _id: string; count: number; windowStart?: number; expireAt: Date };

/**
 * 켜진 제한만 검사하고 기록한다. 모두 꺼져 있으면 MongoDB 에 접근하지 않는다. 방·페르소나를 가리지 않고 센다.
 * 시간 창을 넘으면 "user", 사람당 하루나 전체 하루를 넘으면 "daily" 다. 막힌 호출은 어느 것도 세지 않는다.
 */
export async function consumeClaudeQuota(
  uid: string,
  nowMs: number,
  limits: ClaudeLimits = CLAUDE_LIMITS,
  env: NodeJS.ProcessEnv = process.env,
): Promise<"ok" | "user" | "daily"> {
  const { user: userLimit, userDailyMax, dailyMax } = limits;
  if (!userLimit && userDailyMax === null && dailyMax === null) return "ok";
  const col = await mongoCollection<LimitDoc>("claudeLimits", env);
  const userId = `user_${uid}`;
  const userDayId = userDayDocId(uid, nowMs);
  const dayId = `day_${limitDayKey(nowMs)}`;
  return withMongoTransaction(async (session) => {
    /** 한 세션 안의 명령은 동시에 보내지 않고 차례로 보낸다. */
    const u = userLimit ? await col.findOne({ _id: userId }, { session }) : null;
    const ud = userDailyMax !== null ? await col.findOne({ _id: userDayId }, { session }) : null;
    const d = dailyMax !== null ? await col.findOne({ _id: dayId }, { session }) : null;
    let userState: { count: number; windowStart: number } | null = null;
    if (userLimit) {
      const prev = u && typeof u.windowStart === "number" ? { count: u.count, windowStart: u.windowStart } : null;
      const next = nextRateState(prev, nowMs, userLimit.windowMs, userLimit.max);
      if (!next.allowed) return "user";
      userState = next.state;
    }
    const userDayCount = ud?.count ?? 0;
    if (userDailyMax !== null && userDayCount >= userDailyMax) return "daily";
    const dayCount = d?.count ?? 0;
    if (dailyMax !== null && dayCount >= dailyMax) return "daily";

    const dayExpireAt = limitDayExpireAt(nowMs);
    if (userLimit && userState) {
      await col.replaceOne(
        { _id: userId },
        { ...userState, expireAt: new Date(userState.windowStart + userLimit.windowMs) },
        { upsert: true, session },
      );
    }
    if (userDailyMax !== null) {
      await col.replaceOne({ _id: userDayId }, { count: userDayCount + 1, expireAt: dayExpireAt }, { upsert: true, session });
    }
    if (dailyMax !== null) {
      await col.replaceOne({ _id: dayId }, { count: dayCount + 1, expireAt: dayExpireAt }, { upsert: true, session });
    }
    return "ok";
  }, env);
}

export type QuotaStatus = {
  /** 시간 창 제한. 꺼져 있으면 null. resetAt 은 창이 풀리는 시각(ms)이고 열린 창이 없으면 null 이다. */
  window: { max: number; used: number; resetAt: number | null } | null;
  /** 사람당 하루 제한. 꺼져 있으면 null. */
  day: { max: number; used: number } | null;
};

/**
 * 그 사람의 지금 사용량. 읽기만 하고 기록하지 않는다. 창이 이미 끝났으면 used 0, resetAt null 이다.
 * 시간 창과 사람당 하루 제한이 모두 꺼져 있으면 MongoDB 에 접근하지 않는다.
 */
export async function readClaudeQuota(
  uid: string,
  nowMs: number,
  limits: ClaudeLimits = CLAUDE_LIMITS,
  env: NodeJS.ProcessEnv = process.env,
): Promise<QuotaStatus> {
  const { user: userLimit, userDailyMax } = limits;
  if (!userLimit && userDailyMax === null) return { window: null, day: null };
  const col = await mongoCollection<LimitDoc>("claudeLimits", env);

  let window: QuotaStatus["window"] = null;
  if (userLimit) {
    const u = await col.findOne({ _id: `user_${uid}` });
    const open = u !== null && typeof u.windowStart === "number" && u.windowStart + userLimit.windowMs > nowMs;
    window = open
      ? { max: userLimit.max, used: u.count, resetAt: (u.windowStart as number) + userLimit.windowMs }
      : { max: userLimit.max, used: 0, resetAt: null };
  }
  let day: QuotaStatus["day"] = null;
  if (userDailyMax !== null) {
    const ud = await col.findOne({ _id: userDayDocId(uid, nowMs) });
    day = { max: userDailyMax, used: ud?.count ?? 0 };
  }
  return { window, day };
}
