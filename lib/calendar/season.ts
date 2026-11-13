import { ddayText, type CalendarEvent } from "@/lib/calendar/events";
import { kstDate, kstDayNumber, kstParts, type Ymd } from "@/lib/calendar/kst";

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

export type SeasonMarker = { event: CalendarEvent; type: "start" | "end" };

/**
 * 그 날짜(KST)의 시즌 표식. 시작이 먼저, 그 다음 끝. 같은 날 다른 시즌이 시작하면 끝 표식은 뺀다.
 * 끝이 자정 정각이면 끝나는 날은 그 전날이다.
 */
export function seasonMarkersOnDay(events: readonly CalendarEvent[], ymd: Ymd): SeasonMarker[] {
  const day = kstDayNumber(kstDate(ymd.year, ymd.month, ymd.day));
  const seasons = events.filter((e) => e.kind === "season");
  const starts = seasons.filter((e) => kstDayNumber(e.startAt) === day);
  const ends = seasons.filter(
    (e) => e.endAt !== null && kstDayNumber(new Date(e.endAt.getTime() - 1)) === day && !starts.some((s) => s !== e),
  );
  return [
    ...starts.map((event): SeasonMarker => ({ event, type: "start" })),
    ...ends.map((event): SeasonMarker => ({ event, type: "end" })),
  ];
}

/** 시즌이 지금까지 진행된 정도 0~1. 시작 전 0, 끝난 뒤 1. endAt 이 없으면 0. */
export function seasonProgress(e: Pick<CalendarEvent, "startAt" | "endAt">, now: Date): number {
  if (!e.endAt) return 0;
  const total = e.endAt.getTime() - e.startAt.getTime();
  if (total <= 0) return now.getTime() >= e.endAt.getTime() ? 1 : 0;
  return Math.min(1, Math.max(0, (now.getTime() - e.startAt.getTime()) / total));
}

/** "11.19", 올해가 아니면 "2027.2.18"(KST). */
function shortDate(d: Date, now: Date): string {
  const p = kstParts(d);
  return p.year === kstParts(now).year ? `${p.month}.${p.day}` : `${p.year}.${p.month}.${p.day}`;
}

/** 그 시각까지 남은 날. "D-6", 오늘이면 "오늘", 지났으면 "". */
const daysUntil = (at: Date, now: Date) => ddayText({ startAt: at, endAt: null }, now);

const joined = (...parts: string[]) => parts.filter(Boolean).join(" · ");

/**
 * 시즌 띠에 보일 문구. current·next 가 모두 null 이면 null.
 * 지금 시즌이 있으면 "{제목} 진행 중" 과 다음 시즌의 시작(없으면 지금 시즌의 끝) 날짜·남은 날, 진행 정도를 준다.
 * 다음 시즌만 있으면 "{제목} 시작 예정" 과 시작 날짜·남은 날을 주고 progress 는 null 이다.
 */
export function seasonBannerText(
  current: CalendarEvent | null,
  next: CalendarEvent | null,
  now: Date,
): { title: string; detail: string; progress: number | null } | null {
  if (current) {
    const detail = next
      ? joined(`${shortDate(next.startAt, now)} ${next.title} 시작`, daysUntil(next.startAt, now))
      : current.endAt
        ? joined(`${shortDate(current.endAt, now)} 종료`, daysUntil(current.endAt, now))
        : "";
    return { title: `${current.title} 진행 중`, detail, progress: seasonProgress(current, now) };
  }
  if (next) {
    return { title: `${next.title} 시작 예정`, detail: joined(shortDate(next.startAt, now), daysUntil(next.startAt, now)), progress: null };
  }
  return null;
}
