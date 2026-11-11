import { MAX_REPLY_CHARS } from "@/lib/claude/constants";

export const REPLY_TEXT = {
  refused: "(이건 대답 못 해)",
  userLimited: "(잠깐 쉬는 중. 조금 뒤에 다시 불러 줘)",
  dailyLimited: "(오늘은 여기까지)",
  failed: "(지금 머리가 안 돌아가. 잠시 뒤에)",
  empty: "(…)",
} as const;

export function toReplyText(res: { stop_reason: string | null; content: { type: string; text?: string }[] }): string {
  if (res.stop_reason === "refusal") return REPLY_TEXT.refused;
  const text = res.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => (b.text as string).trim())
    .filter((t) => t.length > 0)
    .join(" ");
  if (!text) return REPLY_TEXT.empty;
  return Array.from(text).slice(0, MAX_REPLY_CHARS).join("");
}
