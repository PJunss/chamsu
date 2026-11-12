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
export const JUDGE_THRESHOLD = 0.8;
export const DM_SETTLE_MS = 1_500;

/** 봇 사용량 제한. 값이 null 인 제한은 검사하지 않는다. 켤 때의 예: { user: { windowMs: 60_000, max: 5 }, dailyMax: 200 } */
export type ClaudeLimits = { user: { windowMs: number; max: number } | null; dailyMax: number | null };
export const CLAUDE_LIMITS: ClaudeLimits = { user: null, dailyMax: null };
