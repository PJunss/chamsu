/** 봇 하나의 처리 결과. user·daily·failed 는 안내 문구를 방에 쓴 경우, error 는 아무것도 쓰지 못한 경우다. */
export type BotResult = "ok" | "user" | "daily" | "failed" | "error";

/**
 * 봇들의 결과로 정한 응답. 답을 쓴 봇이 하나라도 있으면 ok, 모두 사용량 제한이면 429,
 * 실패 안내만 쓴 봇이 있으면 502, 아무것도 쓰지 못했으면 500.
 */
export function decideOutcome(results: readonly BotResult[]): "ok" | { error: string; status: number } {
  if (results.includes("ok")) return "ok";
  if (results.length > 0 && results.every((r) => r === "user")) return { error: "user_limited", status: 429 };
  if (results.length > 0 && results.every((r) => r === "user" || r === "daily")) return { error: "daily_limited", status: 429 };
  if (results.includes("failed")) return { error: "claude_failed", status: 502 };
  return { error: "server_error", status: 500 };
}
