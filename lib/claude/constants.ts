export const DEFAULT_MODEL = "claude-haiku-5-5";
export const CONTEXT_SIZE = 30;
export const QUESTION_TTL_MS = 120_000;
export const MAX_REPLY_CHARS = 500;
export const DEFAULT_MAX_SENTENCES = 3;
export const MAX_MODEL_CALLS = 3;
export const HELPER_MAX_CALLS = 2;
export const HELPER_TIMEOUT_MS = 45_000;
export const HELPER_MAX_QUESTION = 200;
export const HELPER_MAX_ANSWER = 2000;
export const JEV_TIMEOUT_MS = 10_000;
export const RECALL_CANDIDATES = 500;
export const RECALL_THRESHOLD = 0.25;
export const RECALL_MAX = 5;
export const JUDGE_READ_MAX = 600;
export const JUDGE_BATCH = 300;
export const JUDGE_THRESHOLD = 0.6;
/** Jev 요청 검사 점수가 이 값 이상이면 응하면 안 되는 요청으로 본다. */
export const GUARD_THRESHOLD = 0.6;
export const DM_SETTLE_MS = 1_500;
/** 이 단계 이하의 봇 답만 다른 봇을 부른다. 사람 → A(1) → B(2) → A(3) → B(4) 에서 끝난다. */
export const BOT_CHAIN_MAX = 3;

/** 봇 사용량 제한. 값이 null 인 제한은 검사하지 않는다. 켤 때의 예: { user: { windowMs: 60_000, max: 5 }, dailyMax: 200 } */
export type ClaudeLimits = { user: { windowMs: number; max: number } | null; dailyMax: number | null };
export const CLAUDE_LIMITS: ClaudeLimits = { user: null, dailyMax: null };
