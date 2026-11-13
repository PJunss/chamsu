import { kstDate, kstDayNumber, kstParts, type Ymd } from "@/lib/calendar/kst";

export type EventKind = "patch" | "maintenance" | "season" | "event" | "tournament" | "broadcast";
export type EventSource = "admin" | "draft" | "er-api";
export type FilterGroup = "maint" | "season" | "match" | "mine";

/** 화면이 쓰는 일정 하나. mine 이면 내 일정이고 kind 는 null 이다. */
export type CalendarEvent = {
  id: string;
  title: string;
  kind: EventKind | null;
  mine: boolean;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  url: string | null;
  note: string | null;
  source: EventSource | null;
  remindMinutes: number | null;
};

export const EVENT_KINDS: readonly EventKind[] = ["patch", "maintenance", "season", "event", "tournament", "broadcast"];

export const KIND_LABEL: Record<EventKind, string> = {
  patch: "패치",
  maintenance: "점검",
  season: "시즌",
  event: "이벤트",
  tournament: "대회",
  broadcast: "방송",
};

export const FILTER_GROUPS: readonly { key: FilterGroup; label: string; kinds: readonly EventKind[] }[] = [
  { key: "maint", label: "점검·패치", kinds: ["maintenance", "patch"] },
  { key: "season", label: "시즌·이벤트", kinds: ["season", "event"] },
  { key: "match", label: "대회·방송", kinds: ["tournament", "broadcast"] },
  { key: "mine", label: "내 일정", kinds: [] },
];

/** 묶음별 색. dot 은 점·막대, soft 는 이름표 바탕과 글자. */
export const GROUP_COLOR: Record<FilterGroup, { dot: string; soft: string; text: string }> = {
  maint: { dot: "bg-amber-600", soft: "bg-amber-50 text-amber-800", text: "text-amber-700" },
  season: { dot: "bg-indigo-600", soft: "bg-indigo-50 text-indigo-800", text: "text-indigo-700" },
  match: { dot: "bg-teal-600", soft: "bg-teal-50 text-teal-800", text: "text-teal-700" },
  mine: { dot: "bg-sky-600", soft: "bg-sky-50 text-sky-800", text: "text-sky-700" },
};

export function groupOf(e: Pick<CalendarEvent, "kind" | "mine">): FilterGroup {
  if (e.mine || e.kind === null) return "mine";
  const kind = e.kind;
  return FILTER_GROUPS.find((g) => g.kinds.includes(kind))?.key ?? "mine";
}

/** 목록·상세에 보일 종류 이름. 내 일정은 "내 일정". */
export function kindText(e: Pick<CalendarEvent, "kind" | "mine">): string {
  return e.mine || e.kind === null ? "내 일정" : KIND_LABEL[e.kind];
}

const DAY_MS = 86_400_000;
/**
 * 일정을 읽을 때 startAt 을 거슬러 올라가는 날 수. 정규 시즌(약 91일)에 프리시즌과 여유를 더한 값이다.
 * 이보다 긴 일정은 뒤쪽 달에서 보이지 않는다.
 */
export const QUERY_BACK_DAYS = 130;

/** 한 달을 그리려고 읽을 startAt 범위. from = 그 달 1일 00:00 KST − QUERY_BACK_DAYS 일, to = 다음 달 1일 00:00 KST. */
export function monthQueryRange(year: number, month: number): { from: Date; to: Date } {
  return { from: new Date(kstDate(year, month, 1).getTime() - QUERY_BACK_DAYS * DAY_MS), to: kstDate(year, month + 1, 1) };
}

/** 일정이 [from, to) 구간에 걸치는지. 끝 시각이 from 과 같으면 걸치지 않는다. endAt 이 null 이면 startAt 만 본다. */
function overlaps(e: Pick<CalendarEvent, "startAt" | "endAt">, from: Date, to: Date): boolean {
  if (e.startAt.getTime() >= to.getTime()) return false;
  return e.endAt ? e.endAt.getTime() > from.getTime() : e.startAt.getTime() >= from.getTime();
}

/** 일정이 그 달(KST)에 하루라도 걸치는지. endAt 이 null 이면 startAt 만 본다. */
export function overlapsMonth(e: Pick<CalendarEvent, "startAt" | "endAt">, year: number, month: number): boolean {
  return overlaps(e, kstDate(year, month, 1), kstDate(year, month + 1, 1));
}

const byStart = (a: CalendarEvent, b: CalendarEvent) => a.startAt.getTime() - b.startAt.getTime();

/** 그 날짜(KST)에 걸치는 일정을 시작 순으로. 여러 날 일정은 걸친 날마다 나온다. */
export function eventsOnDay(events: readonly CalendarEvent[], ymd: Ymd): CalendarEvent[] {
  const from = kstDate(ymd.year, ymd.month, ymd.day);
  const to = kstDate(ymd.year, ymd.month, ymd.day + 1);
  return events.filter((e) => overlaps(e, from, to)).sort(byStart);
}

/** 아직 끝나지 않은 일정을 시작 순으로 n 개. 끝난 기준: endAt(없으면 startAt) < now. */
export function upcomingEvents(events: readonly CalendarEvent[], now: Date, n: number): CalendarEvent[] {
  return events
    .filter((e) => (e.endAt ?? e.startAt).getTime() >= now.getTime())
    .sort(byStart)
    .slice(0, n);
}

export function visibleEvents(events: readonly CalendarEvent[], on: readonly FilterGroup[]): CalendarEvent[] {
  return events.filter((e) => on.includes(groupOf(e)));
}

/**
 * "다가오는 일정": 공식 일정과 내 일정을 합쳐 켜진 묶음만 남기고, 끝나지 않은 것을 시작 순으로 n 개.
 * 보고 있는 달과 상관없이 now 기준이다.
 */
export function upcomingVisible(
  official: readonly CalendarEvent[],
  mine: readonly CalendarEvent[],
  on: readonly FilterGroup[],
  now: Date,
  n: number,
): CalendarEvent[] {
  return upcomingEvents(visibleEvents([...official, ...mine], on), now, n);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const two = (n: number) => String(n).padStart(2, "0");

/** 날짜 하나의 제목. "11월 14일 (토)". */
export function dayTitle(ymd: Ymd): string {
  return `${ymd.month}월 ${ymd.day}일 (${WEEKDAYS[kstParts(kstDate(ymd.year, ymd.month, ymd.day)).weekday]})`;
}

/**
 * 일정 시각 문구(KST). "11.19 (목) 06:00 ~ 12:00", 끝나는 날이 다르면 "11.19 (목) 12:00 ~ 11.26",
 * 하루 종일이면 시각 없이. 시작이 올해가 아니거나 끝이 시작과 다른 해면 그 날짜에 연도를 붙인다.
 */
export function whenText(e: Pick<CalendarEvent, "startAt" | "endAt" | "allDay">, now: Date): string {
  const s = kstParts(e.startAt);
  const date = s.year === kstParts(now).year ? `${s.month}.${s.day}` : `${s.year}.${s.month}.${s.day}`;
  let text = `${date} (${WEEKDAYS[s.weekday]})`;
  if (!e.allDay) text += ` ${two(s.hour)}:${two(s.minute)}`;
  if (!e.endAt) return text;
  const t = kstParts(e.endAt);
  if (t.year === s.year && t.month === s.month && t.day === s.day) {
    return e.allDay ? text : `${text} ~ ${two(t.hour)}:${two(t.minute)}`;
  }
  return `${text} ~ ${t.year === s.year ? `${t.month}.${t.day}` : `${t.year}.${t.month}.${t.day}`}`;
}

/** 시작까지 남은 날(KST 날짜 기준). 오늘 "오늘", 미래 "D-6", 진행 중 "진행 중", 지났으면 "". */
export function ddayText(e: Pick<CalendarEvent, "startAt" | "endAt">, now: Date): string {
  if ((e.endAt ?? e.startAt).getTime() < now.getTime()) return "";
  if (e.endAt && e.startAt.getTime() <= now.getTime()) return "진행 중";
  const days = kstDayNumber(e.startAt) - kstDayNumber(now);
  return days <= 0 ? "오늘" : `D-${days}`;
}
