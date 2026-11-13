import { describe, expect, test } from "vitest";
import type { CalendarEvent } from "@/lib/calendar/events";
import { kstDate } from "@/lib/calendar/kst";
import { currentAndNextSeason, seasonBannerText, seasonMarkersOnDay, seasonProgress } from "@/lib/calendar/season";

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

describe("seasonMarkersOnDay", () => {
  const marks = (events: CalendarEvent[], year: number, month: number, day: number) =>
    seasonMarkersOnDay(events, { year, month, day }).map((m) => [m.event.id, m.type]);

  test("시작하는 날에 시작 표식", () => {
    expect(marks(all, 2026, 11, 12)).toEqual([["pre", "start"]]);
  });
  test("같은 날 다른 시즌이 시작하면 끝 표식은 뺀다", () => {
    expect(marks(all, 2026, 11, 19)).toEqual([["regular", "start"]]);
    expect(marks([pre], 2026, 11, 19)).toEqual([["pre", "end"]]);
  });
  test("끝나는 날에 끝 표식", () => {
    expect(marks(all, 2027, 2, 18)).toEqual([["regular", "end"]]);
  });
  test("시작도 끝도 아닌 날에는 없다", () => {
    expect(marks(all, 2026, 11, 15)).toEqual([]);
    expect(marks(all, 2026, 11, 13)).toEqual([]);
  });
  test("시즌이 아닌 일정은 무시한다", () => {
    expect(marks([patch], 2026, 11, 10)).toEqual([]);
    expect(marks([patch], 2026, 11, 30)).toEqual([]);
  });
  test("끝이 자정 정각이면 끝나는 날은 그 전날이다", () => {
    const midnight = ev({ id: "mid", startAt: kstDate(2026, 11, 19, 12), endAt: kstDate(2027, 2, 18) });
    expect(marks([midnight], 2027, 2, 17)).toEqual([["mid", "end"]]);
    expect(marks([midnight], 2027, 2, 18)).toEqual([]);
  });
  test("하루 안에 시작하고 끝나는 시즌은 시작 다음에 끝", () => {
    const short = ev({ id: "short", startAt: kstDate(2026, 11, 5, 9), endAt: kstDate(2026, 11, 5, 18) });
    expect(marks([short], 2026, 11, 5)).toEqual([["short", "start"], ["short", "end"]]);
  });
});

test("seasonProgress: 시작 전 0, 한가운데 0.5, 끝난 뒤 1, 끝이 없으면 0", () => {
  expect(seasonProgress(pre, kstDate(2026, 11, 12, 11))).toBe(0);
  expect(seasonProgress(pre, kstDate(2026, 11, 12, 12))).toBe(0);
  expect(seasonProgress(pre, kstDate(2026, 11, 16))).toBe(0.5);
  expect(seasonProgress(pre, kstDate(2026, 11, 19, 12))).toBe(1);
  expect(seasonProgress(pre, kstDate(2026, 12, 1))).toBe(1);
  expect(seasonProgress(ev({ endAt: null }), kstDate(2026, 12, 1))).toBe(0);
});

describe("seasonBannerText", () => {
  test("지금 시즌과 다음 시즌이 있으면 다음 시즌의 시작 날짜와 남은 날", () => {
    const now = kstDate(2026, 11, 13, 14);
    const text = seasonBannerText(pre, regular, now);
    expect(text).toMatchObject({ title: "시즌 13 프리시즌 진행 중", detail: "11.19 시즌 13 시작 · D-6" });
    expect(text!.progress).toBe(seasonProgress(pre, now));
    expect(text!.progress).toBeGreaterThan(0);
    expect(text!.progress).toBeLessThan(1);
  });
  test("다음 시즌이 없으면 지금 시즌의 끝 날짜와 남은 날. 올해가 아니면 연도를 붙인다", () => {
    const now = kstDate(2026, 11, 20, 10);
    expect(seasonBannerText(regular, null, now)).toEqual({
      title: "시즌 13 진행 중", detail: "2027.2.18 종료 · D-90", progress: seasonProgress(regular, now),
    });
    expect(seasonBannerText(regular, null, kstDate(2027, 2, 17, 10))).toMatchObject({ detail: "2.18 종료 · D-1" });
    expect(seasonBannerText(regular, null, kstDate(2027, 2, 18, 8))).toMatchObject({ detail: "2.18 종료 · 오늘" });
  });
  test("지금 시즌이 없고 다음만 있으면 시작 예정과 날짜, 진행 막대 없음", () => {
    expect(seasonBannerText(null, pre, kstDate(2026, 11, 10, 14))).toEqual({
      title: "시즌 13 프리시즌 시작 예정", detail: "11.12 · D-2", progress: null,
    });
  });
  test("둘 다 없으면 null", () => {
    expect(seasonBannerText(null, null, kstDate(2026, 11, 13))).toBeNull();
  });
});
