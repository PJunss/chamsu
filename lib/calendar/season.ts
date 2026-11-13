import type { CalendarEvent } from "@/lib/calendar/events";

/**
 * 지금 진행 중인 시즌 일정과 그 다음에 시작하는 시즌 일정. kind 가 season 인 것만 본다.
 * 진행 중: startAt <= now < endAt. 끝이 없는 시즌 일정은 진행 중으로 보지 않는다.
 */
export function currentAndNextSeason(
  events: readonly CalendarEvent[],
  now: Date,
): { current: CalendarEvent | null; next: CalendarEvent | null } {
  const t = now.getTime();
  const seasons = events.filter((e) => e.kind === "season").sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const running = seasons.filter((e) => e.startAt.getTime() <= t && e.endAt !== null && t < e.endAt.getTime());
  return {
    current: running[running.length - 1] ?? null,
    next: seasons.find((e) => e.startAt.getTime() > t) ?? null,
  };
}
