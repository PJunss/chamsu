import type { CalendarEvent } from "@/lib/calendar/events";
import { kstDate, kstDayNumber, type Ymd } from "@/lib/calendar/kst";

/** 월 보기의 한 주에 놓이는 여러 날 일정의 막대 하나. */
export type WeekBar = {
  event: CalendarEvent;
  /** 0~6, 이 주에서 막대가 시작하는 칸. */
  startCol: number;
  /** 0~6, 이 주에서 막대가 끝나는 칸(포함). */
  endCol: number;
  /** 0부터. 같은 주에서 겹치는 막대는 다른 줄에 놓인다. */
  lane: number;
  /** 일정의 첫날이 이 주 안에 있다. */
  startsHere: boolean;
  /** 일정의 마지막 날이 이 주 안에 있다. */
  endsHere: boolean;
};

/** 일정이 걸치는 한국 날짜의 첫날과 마지막 날(일 번호). 끝이 자정 정각이면 그 전날까지다. */
function daySpan(e: Pick<CalendarEvent, "startAt" | "endAt">): { first: number; last: number } {
  const first = kstDayNumber(e.startAt);
  const last = e.endAt ? kstDayNumber(new Date(e.endAt.getTime() - 1)) : first;
  return { first, last: Math.max(first, last) };
}

/** 한국 날짜로 시작일과 끝나는 날이 다른 일정인지. 끝이 없는 일정은 아니다. */
export function isMultiDay(e: Pick<CalendarEvent, "startAt" | "endAt">): boolean {
  const { first, last } = daySpan(e);
  return last > first;
}

/**
 * 한 주(7칸)에 걸치는 여러 날 일정의 막대. 시작이 이른 순, 같으면 긴 순으로 줄을 배정하고 빈 줄 중 가장 위를 쓴다.
 * week 는 일요일부터 이어지는 7일이다.
 */
export function weekBars(events: readonly CalendarEvent[], week: readonly Ymd[]): WeekBar[] {
  const weekFirst = kstDayNumber(kstDate(week[0].year, week[0].month, week[0].day));
  const weekLast = weekFirst + week.length - 1;

  const spans = events
    .filter(isMultiDay)
    .map((event) => ({ event, ...daySpan(event) }))
    .filter((s) => s.first <= weekLast && s.last >= weekFirst)
    .sort((a, b) => a.first - b.first || b.last - a.last || a.event.startAt.getTime() - b.event.startAt.getTime());

  const bars: WeekBar[] = [];
  for (const s of spans) {
    const startCol = Math.max(0, s.first - weekFirst);
    const endCol = Math.min(week.length - 1, s.last - weekFirst);
    let lane = 0;
    while (bars.some((b) => b.lane === lane && b.startCol <= endCol && b.endCol >= startCol)) lane++;
    bars.push({ event: s.event, startCol, endCol, lane, startsHere: s.first >= weekFirst, endsHere: s.last <= weekLast });
  }
  return bars;
}
