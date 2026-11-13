import { describe, expect, test } from "vitest";
import { addMonths, kstDate, kstDayNumber, kstParts, monthGrid } from "@/lib/calendar/kst";

describe("kstDate / kstParts", () => {
  test("한국 시각을 UTC 로 9시간 앞당긴 Date 로 만든다", () => {
    expect(kstDate(2026, 11, 19, 12, 0).toISOString()).toBe("2026-11-19T03:00:00.000Z");
    expect(kstDate(2026, 11, 1).toISOString()).toBe("2026-10-31T15:00:00.000Z");
  });
  test("달이 범위를 넘으면 해를 넘긴다", () => {
    expect(kstDate(2026, 13, 1).toISOString()).toBe("2026-12-31T15:00:00.000Z");
    expect(kstDate(2026, 0, 1).toISOString()).toBe("2025-11-30T15:00:00.000Z");
  });
  test("Date 를 한국 날짜와 요일로 푼다", () => {
    expect(kstParts(new Date("2026-11-12T15:00:00Z"))).toEqual({ year: 2026, month: 11, day: 13, hour: 0, minute: 0, weekday: 5 });
    expect(kstParts(new Date("2026-11-12T14:59:00Z"))).toMatchObject({ day: 12, hour: 23, minute: 59, weekday: 4 });
  });
  test("일 번호는 한국 날짜가 바뀔 때 1 늘어난다", () => {
    const a = kstDayNumber(new Date("2026-11-12T14:59:00Z"));
    expect(kstDayNumber(new Date("2026-11-12T15:00:00Z"))).toBe(a + 1);
  });
});

describe("monthGrid", () => {
  test("2026년 11월은 일요일에 시작해 5주, 마지막 주는 12월 1~5일로 채운다", () => {
    const g = monthGrid(2026, 11);
    expect(g).toHaveLength(5);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0][0]).toEqual({ ymd: { year: 2026, month: 11, day: 1 }, inMonth: true });
    expect(g[4][1]).toEqual({ ymd: { year: 2026, month: 11, day: 30 }, inMonth: true });
    expect(g[4][2]).toEqual({ ymd: { year: 2026, month: 12, day: 1 }, inMonth: false });
    expect(g[4][6]).toEqual({ ymd: { year: 2026, month: 12, day: 5 }, inMonth: false });
  });
  test("2026년 12월은 화요일에 시작해 앞을 11월 29~30일로 채운다", () => {
    const g = monthGrid(2026, 12);
    expect(g[0][0]).toEqual({ ymd: { year: 2026, month: 11, day: 29 }, inMonth: false });
    expect(g[0][2]).toEqual({ ymd: { year: 2026, month: 12, day: 1 }, inMonth: true });
  });
});

test("addMonths 는 해를 넘긴다", () => {
  expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  expect(addMonths(2026, 11, 0)).toEqual({ year: 2026, month: 11 });
});
