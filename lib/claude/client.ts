import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "@/lib/claude/constants";
import { toReplyText } from "@/lib/claude/reply";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export async function askClaude(system: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const res = await getClient().beta.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages,
  });
  return toReplyText(res);
}
