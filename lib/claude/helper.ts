import {
  HELPER_MAX_ANSWER, HELPER_MAX_CALLS, HELPER_MAX_QUESTION, HELPER_TIMEOUT_MS,
} from "@/lib/claude/constants";

export type HelperTool = {
  name: "ask_helper";
  description: string;
  input_schema: {
    type: "object";
    properties: { question: { type: "string"; description: string } };
    required: ["question"];
  };
};

export const HELPER_TOOL: HelperTool = {
  name: "ask_helper",
  description:
    "웹 검색과 최신 정보를 아는 도우미에게 짧은 질문 하나를 묻는다. 도우미는 이전 질문을 기억하지 못하고, 질문 하나마다 답 하나를 돌려준다.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "그것만 읽어도 뜻이 통하는 짧은 한 문장 질문" },
    },
    required: ["question"],
  },
};

export function helperConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RUNNER_URL && env.RUNNER_TOKEN);
}

/** 러너에 보내기 전 질문 검사. 거절 사유는 그대로 tool_result 에 들어간다. */
export function checkHelperQuestion(
  q: unknown,
  usedCalls: number,
  nicknames: string[],
): { ok: true; question: string } | { ok: false; reason: string } {
  const question = typeof q === "string" ? q.trim() : "";
  if (!question) return { ok: false, reason: "(질문이 비어 있다)" };
  if (Array.from(question).length > HELPER_MAX_QUESTION) return { ok: false, reason: "(질문이 너무 길다)" };
  if (nicknames.some((n) => n && question.includes(n))) {
    return { ok: false, reason: "(친구 이름이 들어간 질문은 보낼 수 없다)" };
  }
  if (usedCalls >= HELPER_MAX_CALLS) return { ok: false, reason: "(도우미는 한 답에 두 번까지만 부를 수 있다)" };
  return { ok: true, question };
}

/** 러너의 ask_agent 에 질문 하나를 묻는다. 설정 없음·HTTP 오류·시간 초과·exit_code≠0·빈 답은 null. */
export async function askHelper(
  question: string,
  opts: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<string | null> {
  const env = opts.env ?? process.env;
  const url = env.RUNNER_URL;
  const token = env.RUNNER_TOKEN;
  if (!url || !token) return null;
  const fetchFn = opts.fetch ?? fetch;
  try {
    const res = await fetchFn(`${url.replace(/\/+$/, "")}/api/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "chamsu-bot/1.0",
      },
      body: JSON.stringify({ script: "ask_agent", args: [`${question}\n\n짧게 사실만 답하라.`] }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? HELPER_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("helper failed", "http", res.status);
      return null;
    }
    const body = (await res.json()) as { exit_code?: unknown; stdout?: unknown };
    if (body.exit_code !== 0) {
      console.error("helper failed", "exit_code");
      return null;
    }
    const out = typeof body.stdout === "string" ? body.stdout.trim() : "";
    if (!out) {
      console.error("helper failed", "empty");
      return null;
    }
    return Array.from(out).slice(0, HELPER_MAX_ANSWER).join("");
  } catch (e) {
    console.error("helper failed", e instanceof Error ? e.name : "unknown");
    return null;
  }
}
