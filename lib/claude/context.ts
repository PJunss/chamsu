import { BOT_UID } from "@/lib/claude/constants";

export type CtxMessage = { id: string; uid: string; nickname: string; text: string };
type Turn = { role: "user" | "assistant"; content: string };

export function buildClaudeMessages(history: CtxMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of history) {
    const role = m.uid === BOT_UID ? "assistant" : "user";
    const content = role === "user" ? `${m.nickname}: ${m.text}` : m.text;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${content}`;
    else turns.push({ role, content });
  }
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}
