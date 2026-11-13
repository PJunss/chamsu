import { expect, test } from "vitest";
import type { CalendarEvent } from "@/lib/calendar/events";
import { kstDate } from "@/lib/calendar/kst";
import { currentAndNextSeason } from "@/lib/calendar/season";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e", title: "t", kind: "season", mine: false, startAt: kstDate(2026, 11, 19, 12), endAt: null, allDay: false,
  url: null, note: null, source: "er-api", remindMinutes: null, ...over,
});

const pre = ev({ id: "pre", title: "시즌 13 프리시즌", startAt: kstDate(2026, 11, 12, 12), endAt: kstDate(2026, 11, 19, 12) });
const regular = ev({ id: "regular", title: "시즌 13", startAt: kstDate(2026, 11, 19, 12), endAt: kstDate(2027, 2, 18, 9) });
const patch = ev({ id: "patch", kind: "patch", source: "admin", startAt: kstDate(2026, 11, 10, 12), endAt: kstDate(2026, 11, 30, 12) });
const all = [regular, patch, pre];

test("프리시즌 중이면 지금은 프리시즌, 다음은 정규 시즌", () => {
  expect(currentAndNextSeason(all, kstDate(2026, 11, 13, 14))).toEqual({ current: pre, next: regular });
});
test("정규 시즌이 시작하는 정각부터 지금은 정규 시즌이고 다음은 없다", () => {
  expect(currentAndNextSeason(all, kstDate(2026, 11, 19, 12))).toEqual({ current: regular, next: null });
});
test("시작 1분 전까지는 프리시즌이다", () => {
  expect(currentAndNextSeason(all, kstDate(2026, 11, 19, 11, 59))).toEqual({ current: pre, next: regular });
});
test("시즌 일정이 없으면 둘 다 null", () => {
  expect(currentAndNextSeason([], kstDate(2026, 11, 13))).toEqual({ current: null, next: null });
});
test("시즌이 아닌 일정은 무시한다", () => {
  expect(currentAndNextSeason([patch], kstDate(2026, 11, 13))).toEqual({ current: null, next: null });
  const event = ev({ id: "event", kind: "event", startAt: kstDate(2026, 11, 20), endAt: kstDate(2026, 11, 27) });
  expect(currentAndNextSeason([patch, event], kstDate(2026, 11, 13))).toEqual({ current: null, next: null });
});
test("시즌 사이의 빈 기간에는 지금 시즌이 없고 다음 시즌만 있다", () => {
  expect(currentAndNextSeason([regular], kstDate(2026, 11, 13))).toEqual({ current: null, next: regular });
  expect(currentAndNextSeason(all, kstDate(2027, 2, 18, 9))).toEqual({ current: null, next: null });
});
