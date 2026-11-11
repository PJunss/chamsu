import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/claude/constants";
import { SYSTEM_PROMPT } from "@/lib/claude/persona";
import { toReplyText } from "@/lib/claude/reply";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export async function askClaude(messages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const res = await getClient().beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages,
  });
  return toReplyText(res);
}
