import { JEV_TIMEOUT_MS } from "@/lib/claude/constants";

export type NoulQuestion = { type: "noul"; instructions: Record<string, string> };

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export function jevConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TYPESAFE_API_KEY);
}

/** 질문 id → 0~1. HTTP 오류는 Error("jev_<status>"), 응답 형식 오류는 Error("jev_format") 로 throw 한다. */
export async function askJev(
  state: string,
  questions: Record<string, NoulQuestion>,
  opts: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<Record<string, number>> {
  const env = opts.env ?? process.env;
  const fetchFn = opts.fetch ?? fetch;
  const res = await fetchFn(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.TYPESAFE_API_KEY ?? ""}`,
      "Content-Type": "application/json",
      "User-Agent": "chamsu-bot/1.0",
    },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? JEV_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`jev_${res.status}`);
  let body: { answers?: Record<string, { noul?: unknown }> };
  try {
    body = await res.json();
  } catch {
    throw new Error("jev_format");
  }
  const out: Record<string, number> = {};
  for (const id of Object.keys(questions)) {
    const v = body.answers?.[id]?.noul;
    if (typeof v !== "number") throw new Error("jev_format");
    out[id] = v;
  }
  return out;
}
