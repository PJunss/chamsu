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
/** Jev 요청 검사를 기다리는 최대 시간. 넘으면 걸리지 않은 것으로 진행한다. */
export const GUARD_TIMEOUT_MS = 3_000;
/** 호감도 문서가 없을 때의 값이자 시간이 지나면 돌아가는 값. */
export const AFFINITY_DEFAULT = 50;
/** 하루에 AFFINITY_DEFAULT 쪽으로 돌아가는 양. */
export const AFFINITY_DECAY_PER_DAY = 0.5;
/** 호의 점수가 올리는 양의 배율. 현재 값이 높을수록 덜 오른다. */
export const AFFINITY_GAIN = 1.0;
/** 적대 점수가 내리는 양의 배율. */
export const AFFINITY_LOSS = 1.5;
/** 호감도가 마지막으로 오른 뒤 이 시간 안에는 호의 몫을 0 으로 본다. */
export const AFFINITY_GAIN_COOLDOWN_MS = 10 * 60_000;
export const DM_SETTLE_MS = 1_500;
/** 이 단계 이하의 봇 답만 다른 봇을 부른다. 사람 → A(1) → B(2) → A(3) → B(4) 에서 끝난다. */
export const BOT_CHAIN_MAX = 3;

/** 봇 사용량 제한. 값이 null 인 제한은 검사하지 않는다. 켤 때의 예: { user: { windowMs: 60_000, max: 5 }, dailyMax: 200 } */
export type ClaudeLimits = { user: { windowMs: number; max: number } | null; dailyMax: number | null };
export const CLAUDE_LIMITS: ClaudeLimits = { user: null, dailyMax: null };
