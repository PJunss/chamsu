const PREFIX = "@비앙카";

export function parseClaudeQuestion(text: string): string | null {
  const t = text.trim();
  if (!t.startsWith(PREFIX)) return null;
  const q = t.slice(PREFIX.length).trim();
  return q.length > 0 ? q : null;
}
