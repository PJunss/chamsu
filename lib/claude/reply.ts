import { DEFAULT_MAX_LONG_SENTENCES, DEFAULT_MAX_SENTENCES, MAX_REPLY_CHARS } from "@/lib/claude/constants";
import type { PersonaConfig } from "@/lib/claude/personas";

/** 문장 끝(. ! ? … ~ 뒤 공백) 또는 줄바꿈으로 나눠 max 문장을 넘으면 앞 max 문장만 공백으로 잇는다. */
export function limitSentences(text: string, max: number): string {
  const trimmed = text.trim();
  const parts = trimmed.split(/(?<=[.!?…~])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.length > max ? parts.slice(0, max).join(" ") : trimmed;
}

export function toReplyText(
  res: { stop_reason: string | null; content: { type: string; text?: string }[] },
  persona: PersonaConfig,
): string {
  if (res.stop_reason === "refusal") return persona.replyText.refused;
  const joined = res.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => (b.text as string).trim())
    .filter((t) => t.length > 0)
    .join(" ");
  const max = Math.max(persona.maxSentences ?? DEFAULT_MAX_SENTENCES, persona.maxLongSentences ?? DEFAULT_MAX_LONG_SENTENCES);
  const text = limitSentences(joined, max);
  if (!text) return persona.replyText.empty;
  return Array.from(text).slice(0, MAX_REPLY_CHARS).join("");
}
