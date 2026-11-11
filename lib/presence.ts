export const HEARTBEAT_MS = 20_000;
export const ONLINE_WINDOW_MS = 60_000;

export type OnlineUser = { uid: string; nickname: string };

export function filterOnline(
  docs: { uid: string; nickname: string; lastSeen: Date | null }[],
  now: number,
): OnlineUser[] {
  return docs
    .filter((d) => d.lastSeen === null || now - d.lastSeen.getTime() < ONLINE_WINDOW_MS)
    .map(({ uid, nickname }) => ({ uid, nickname }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
}
