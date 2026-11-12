export type CtxMessage = { id: string; uid: string; nickname: string; text: string };
export type Memory = { text: string; nickname: string; context: string[]; createdAt: Date };
export type Turn = { role: "user" | "assistant"; content: string };

const kstDate = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

function memoryBlock(memories: Memory[]): string {
  const lines = ["[기억]"];
  for (const m of memories) {
    lines.push(`${kstDate(m.createdAt)} ${m.nickname}: ${m.text}`);
    if (m.context.length > 0) lines.push(`  (앞 대화: ${m.context.join(" / ")})`);
  }
  lines.push("", "[최근 대화]");
  return lines.join("\n");
}

/** selfUid 메시지만 assistant 이고 다른 봇과 사람은 user 의 "닉네임: 본문". 기억은 첫 user 메시지 앞에 붙인다. */
export function buildClaudeMessages(history: CtxMessage[], selfUid: string, memories: Memory[] = []): Turn[] {
  const turns: Turn[] = [];
  for (const m of history) {
    const role = m.uid === selfUid ? "assistant" : "user";
    const content = role === "user" ? `${m.nickname}: ${m.text}` : m.text;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${content}`;
    else turns.push({ role, content });
  }
  while (turns[0]?.role === "assistant") turns.shift();
  if (memories.length > 0 && turns[0]) turns[0].content = `${memoryBlock(memories)}\n${turns[0].content}`;
  return turns;
}
