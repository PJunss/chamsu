export const DEFAULT_MODEL = "claude-haiku-5-5";
export const CONTEXT_SIZE = 30;
export const QUESTION_TTL_MS = 120_000;
export const MAX_REPLY_CHARS = 800;
/** 잡담·인사·짧은 반응의 최대 문장 수. */
export const DEFAULT_MAX_SENTENCES = 3;
/** 설명·추천·정보 질문의 최대 문장 수. 서버는 이 수를 넘는 문장을 자른다. */
export const DEFAULT_MAX_LONG_SENTENCES = 6;
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
/** 0~1 로 자른 호의·적대 점수가 이 값 미만이면 잡음으로 보고 0 으로 친다. */
export const AFFINITY_NOISE = 0.1;
/** 적대 점수가 이보다 낮으면 밈·장난으로 보고 호감도를 깎지 않는다. */
export const AFFINITY_NEG_MIN = 0.55;
/** 웃음 표시(ㅋㅋ·ㅎㅎ 등)가 있는 메시지의 적대 점수에 곱하는 값. 가드레일에 걸린 메시지에는 쓰지 않는다. */
export const AFFINITY_LAUGH_FACTOR = 0.5;
/** 위협 표현이 있고 Jev 협박 점수가 이 이상이면 협박으로 본다. 칭찬 속어·과장은 0.05 이하, 협박은 0.17 이상이었다. */
export const AFFINITY_THREAT_MIN = 0.1;
/** 협박으로 본 메시지의 적대 점수 최솟값. */
export const AFFINITY_THREAT_NEG = 0.7;
/** 호의 점수가 이 값 이상으로 올랐을 때만 AFFINITY_GAIN_COOLDOWN_MS 간격을 새로 시작한다. */
export const AFFINITY_GAIN_MIN = 0.5;
/** 주인의 연속 메시지를 한 번에 답하려고 답하기 전에 기다리는 시간. */
export const DM_SETTLE_MS = 1_500;

/** 봇 사용량 제한. 값이 null 인 제한은 검사하지 않는다. 켤 때의 예: { user: { windowMs: 60_000, max: 5 }, dailyMax: 200 } */
export type ClaudeLimits = { user: { windowMs: number; max: number } | null; dailyMax: number | null };
export const CLAUDE_LIMITS: ClaudeLimits = { user: null, dailyMax: null };
