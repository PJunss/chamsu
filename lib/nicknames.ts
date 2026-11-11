export function parseAllowedNicknames(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isAllowedNickname(nickname: string, raw: string | undefined): boolean {
  const n = nickname.trim();
  return n.length > 0 && parseAllowedNicknames(raw).includes(n);
}
