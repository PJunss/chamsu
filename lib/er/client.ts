/** 서버 전용. 이터널리턴 Open API 호출. 키와 응답 본문은 로그에 남기지 않는다. */

const ER_API_BASE = "https://open-api.bser.io";

export type SeasonRow = { seasonID: number; seasonName: string; seasonStart: string; seasonEnd: string; isCurrent: number };

function isSeasonRow(v: unknown): v is SeasonRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.seasonID === "number" &&
    typeof r.seasonName === "string" &&
    typeof r.seasonStart === "string" &&
    typeof r.seasonEnd === "string"
  );
}

/** ER API /v2/data/Season 의 시즌 표. 키는 env.ER_API_KEY. 키가 없거나 응답이 200 이 아니면 throw. */
export async function fetchSeasons(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<SeasonRow[]> {
  const key = env.ER_API_KEY;
  if (!key) throw new Error("er_api_no_key");
  const res = await fetchImpl(`${ER_API_BASE}/v2/data/Season`, { headers: { "x-api-key": key } });
  if (!res.ok) throw new Error(`er_api_http_${res.status}`);
  const body = (await res.json()) as { code?: unknown; data?: unknown } | null;
  if (!body || body.code !== 200 || !Array.isArray(body.data)) throw new Error("er_api_bad_response");
  return body.data.filter(isSeasonRow);
}
