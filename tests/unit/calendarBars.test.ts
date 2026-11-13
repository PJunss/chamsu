import { describe, expect, test } from "vitest";
import { isMultiDay, weekBars } from "@/lib/calendar/bars";
import type { CalendarEvent } from "@/lib/calendar/events";
import { kstDate, monthGrid } from "@/lib/calendar/kst";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e", title: "t", kind: "season", mine: false, startAt: kstDate(2026, 11, 12, 12), endAt: kstDate(2026, 11, 19, 12), allDay: false,
  url: null, note: null, source: "er-api", remindMinutes: null, ...over,
});

/** 2026년 11월의 주: 0 = 1~7일, 1 = 8~14일, 2 = 15~21일, 3 = 22~28일, 4 = 29일~12월 5일 */
const week = (i: number) => monthGrid(2026, 11)[i].map((c) => c.ymd);
const shape = (b: ReturnType<typeof weekBars>[number]) => ({
  id: b.event.id, startCol: b.startCol, endCol: b.endCol, lane: b.lane, startsHere: b.startsHere, endsHere: b.endsHere,
});

describe("isMultiDay", () => {
  test("한국 날짜로 시작일과 끝나는 날이 다르면 여러 날 일정이다", () => {
    expect(isMultiDay(ev({}))).toBe(true);
    expect(isMultiDay(ev({ startAt: kstDate(2026, 11, 14, 23), endAt: kstDate(2026, 11, 15, 1) }))).toBe(true);
  });
  test("하루 안에서 끝나는 일정과 끝이 없는 일정은 아니다", () => {
    expect(isMultiDay(ev({ startAt: kstDate(2026, 11, 19, 6), endAt: kstDate(2026, 11, 19, 12) }))).toBe(false);
    expect(isMultiDay(ev({ endAt: null }))).toBe(false);
  });
  test("끝이 다음 날 자정 정각이면 그 전날까지라 하루짜리다", () => {
    expect(isMultiDay(ev({ startAt: kstDate(2026, 11, 19, 6), endAt: kstDate(2026, 11, 20) }))).toBe(false);
    expect(isMultiDay(ev({ startAt: kstDate(2026, 11, 19), endAt: kstDate(2026, 11, 21) }))).toBe(true);
  });
});

describe("weekBars", () => {
  const season = ev({ id: "s" });

  test("주를 넘는 일정은 주마다 잘려 나온다", () => {
    expect(weekBars([season], week(0))).toEqual([]);
    expect(weekBars([season], week(1)).map(shape)).toEqual([
      { id: "s", startCol: 4, endCol: 6, lane: 0, startsHere: true, endsHere: false },
    ]);
    expect(weekBars([season], week(2)).map(shape)).toEqual([
      { id: "s", startCol: 0, endCol: 4, lane: 0, startsHere: false, endsHere: true },
    ]);
    expect(weekBars([season], week(3))).toEqual([]);
  });
  test("끝이 자정 정각이면 그 전날 칸에서 끝난다", () => {
    const e = ev({ id: "m", endAt: kstDate(2026, 11, 19) });
    expect(weekBars([e], week(2)).map(shape)).toEqual([
      { id: "m", startCol: 0, endCol: 3, lane: 0, startsHere: false, endsHere: true },
    ]);
  });
  test("달을 넘는 일정은 마지막 주의 다음 달 칸까지 이어진다", () => {
    const e = ev({ id: "x", startAt: kstDate(2026, 11, 28, 10), endAt: kstDate(2026, 12, 3, 18) });
    expect(weekBars([e], week(3)).map(shape)).toEqual([
      { id: "x", startCol: 6, endCol: 6, lane: 0, startsHere: true, endsHere: false },
    ]);
    expect(weekBars([e], week(4)).map(shape)).toEqual([
      { id: "x", startCol: 0, endCol: 4, lane: 0, startsHere: false, endsHere: true },
    ]);
  });
  test("같은 주에 겹치는 두 일정은 줄이 나뉜다. 시작이 이른 것이 위, 같으면 긴 것이 위", () => {
    const a = ev({ id: "a", startAt: kstDate(2026, 11, 16, 12), endAt: kstDate(2026, 11, 18, 12) });
    const b = ev({ id: "b", startAt: kstDate(2026, 11, 17, 12), endAt: kstDate(2026, 11, 20, 12) });
    expect(weekBars([b, a], week(2)).map(shape)).toEqual([
      { id: "a", startCol: 1, endCol: 3, lane: 0, startsHere: true, endsHere: true },
      { id: "b", startCol: 2, endCol: 5, lane: 1, startsHere: true, endsHere: true },
    ]);
    const long = ev({ id: "long", startAt: kstDate(2026, 11, 16, 12), endAt: kstDate(2026, 11, 20, 12) });
    expect(weekBars([a, long], week(2)).map((x) => [x.event.id, x.lane])).toEqual([["long", 0], ["a", 1]]);
  });
  test("겹치지 않는 두 일정은 같은 줄을 쓰고, 빈 줄 중 가장 위를 쓴다", () => {
    const a = ev({ id: "a", startAt: kstDate(2026, 11, 15, 12), endAt: kstDate(2026, 11, 16, 12) });
    const b = ev({ id: "b", startAt: kstDate(2026, 11, 17, 12), endAt: kstDate(2026, 11, 18, 12) });
    expect(weekBars([a, b], week(2)).map((x) => [x.event.id, x.lane])).toEqual([["a", 0], ["b", 0]]);
    const over = ev({ id: "over", startAt: kstDate(2026, 11, 15, 12), endAt: kstDate(2026, 11, 21, 12) });
    const late = ev({ id: "late", startAt: kstDate(2026, 11, 19, 12), endAt: kstDate(2026, 11, 20, 12) });
    expect(weekBars([late, b, over, a], week(2)).map((x) => [x.event.id, x.lane])).toEqual([
      ["over", 0], ["a", 1], ["b", 1], ["late", 1],
    ]);
  });
  test("하루짜리 일정과 끝이 없는 일정은 막대에 나오지 않는다", () => {
    const one = ev({ id: "one", startAt: kstDate(2026, 11, 19, 6), endAt: kstDate(2026, 11, 19, 12) });
    const point = ev({ id: "point", startAt: kstDate(2026, 11, 17, 12), endAt: null });
    expect(weekBars([one, point], week(2))).toEqual([]);
    expect(weekBars([one, point, season], week(2)).map((x) => x.event.id)).toEqual(["s"]);
  });
});
