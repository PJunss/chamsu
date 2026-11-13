import { describe, expect, test } from "vitest";
import {
  FILTER_GROUPS, QUERY_BACK_DAYS, dayTitle, ddayText, eventsOnDay, groupOf, monthQueryRange, overlapsMonth, upcomingEvents, upcomingVisible, visibleEvents, whenText,
  type CalendarEvent,
} from "@/lib/calendar/events";
import { kstDate } from "@/lib/calendar/kst";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e", title: "t", kind: "patch", mine: false, startAt: kstDate(2026, 11, 19, 12), endAt: null, allDay: false,
  url: null, note: null, source: "admin", remindMinutes: null, ...over,
});
const now = kstDate(2026, 11, 13, 14);

test("필터 묶음: 점검·패치, 시즌·이벤트, 대회·방송, 내 일정", () => {
  expect(FILTER_GROUPS.map((g) => [g.key, g.label])).toEqual([
    ["maint", "점검·패치"], ["season", "시즌·이벤트"], ["match", "대회·방송"], ["mine", "내 일정"],
  ]);
  expect(groupOf(ev({ kind: "maintenance" }))).toBe("maint");
  expect(groupOf(ev({ kind: "event" }))).toBe("season");
  expect(groupOf(ev({ kind: "broadcast" }))).toBe("match");
  expect(groupOf(ev({ kind: null, mine: true }))).toBe("mine");
});

test("한 달 읽기 범위: 1일 − 130일 부터 다음 달 1일 전까지(KST)", () => {
  expect(QUERY_BACK_DAYS).toBe(130);
  const r = monthQueryRange(2026, 11);
  expect(r.to).toEqual(kstDate(2026, 12, 1));
  expect(r.from).toEqual(new Date(kstDate(2026, 11, 1).getTime() - 130 * 86_400_000));
});

test("정규 시즌은 끝나는 달을 볼 때도 읽기 범위에 들고 그 달에 걸친다", () => {
  const season = ev({ kind: "season", startAt: kstDate(2026, 11, 19, 12), endAt: kstDate(2027, 2, 18, 9) });
  const { from, to } = monthQueryRange(2027, 2);
  expect(from.getTime()).toBeLessThanOrEqual(season.startAt.getTime());
  expect(season.startAt.getTime()).toBeLessThan(to.getTime());
  expect(overlapsMonth(season, 2027, 2)).toBe(true);
});

describe("overlapsMonth", () => {
  test("그 달에 시작하면 걸친다", () => expect(overlapsMonth(ev({}), 2026, 11)).toBe(true));
  test("전달에 시작해 그 달에 끝나면 걸친다", () =>
    expect(overlapsMonth(ev({ startAt: kstDate(2026, 10, 20), endAt: kstDate(2026, 11, 2) }), 2026, 11)).toBe(true));
  test("전달에 시작해 전달에 끝나면 걸치지 않는다", () =>
    expect(overlapsMonth(ev({ startAt: kstDate(2026, 10, 20), endAt: kstDate(2026, 10, 31, 23) }), 2026, 11)).toBe(false));
  test("그 달 1일 00:00 에 끝난 일정은 걸치지 않는다", () =>
    expect(overlapsMonth(ev({ startAt: kstDate(2026, 10, 20), endAt: kstDate(2026, 11, 1) }), 2026, 11)).toBe(false));
  test("다음 달에 시작하면 걸치지 않는다", () =>
    expect(overlapsMonth(ev({ startAt: kstDate(2026, 12, 1) }), 2026, 11)).toBe(false));
  test("끝이 없는 전달 일정은 걸치지 않는다", () =>
    expect(overlapsMonth(ev({ startAt: kstDate(2026, 10, 31, 23) }), 2026, 11)).toBe(false));
});

test("eventsOnDay: 여러 날 일정은 걸친 날마다, 끝난 시각의 날까지 나온다", () => {
  const season = ev({ id: "s", startAt: kstDate(2026, 11, 12, 12), endAt: kstDate(2026, 11, 19, 12) });
  const one = ev({ id: "o", startAt: kstDate(2026, 11, 14, 21) });
  const all = [season, one];
  expect(eventsOnDay(all, { year: 2026, month: 11, day: 11 })).toEqual([]);
  expect(eventsOnDay(all, { year: 2026, month: 11, day: 12 }).map((e) => e.id)).toEqual(["s"]);
  expect(eventsOnDay(all, { year: 2026, month: 11, day: 14 }).map((e) => e.id)).toEqual(["s", "o"]);
  expect(eventsOnDay(all, { year: 2026, month: 11, day: 19 }).map((e) => e.id)).toEqual(["s"]);
  expect(eventsOnDay(all, { year: 2026, month: 11, day: 20 })).toEqual([]);
});

test("upcomingEvents: 끝나지 않은 일정을 시작 순으로 n 개", () => {
  const past = ev({ id: "past", startAt: kstDate(2026, 11, 10, 12) });
  const ongoing = ev({ id: "ongoing", startAt: kstDate(2026, 11, 12, 12), endAt: kstDate(2026, 11, 19, 12) });
  const soon = ev({ id: "soon", startAt: kstDate(2026, 11, 14, 21) });
  const later = ev({ id: "later", startAt: kstDate(2026, 11, 26, 12) });
  expect(upcomingEvents([later, past, soon, ongoing], now, 2).map((e) => e.id)).toEqual(["ongoing", "soon"]);
  expect(upcomingEvents([later, past, soon, ongoing], now, 10).map((e) => e.id)).toEqual(["ongoing", "soon", "later"]);
});

test("visibleEvents: 켠 묶음의 일정만", () => {
  const a = ev({ id: "a", kind: "maintenance" });
  const b = ev({ id: "b", kind: "tournament" });
  const c = ev({ id: "c", kind: null, mine: true });
  expect(visibleEvents([a, b, c], ["maint", "mine"]).map((e) => e.id)).toEqual(["a", "c"]);
  expect(visibleEvents([a, b, c], [])).toEqual([]);
});

describe("whenText", () => {
  test("한 시점", () => expect(whenText(ev({}), now)).toBe("11.19 (목) 12:00"));
  test("같은 날 안의 기간", () =>
    expect(whenText(ev({ startAt: kstDate(2026, 11, 19, 6), endAt: kstDate(2026, 11, 19, 12) }), now)).toBe("11.19 (목) 06:00 ~ 12:00"));
  test("다른 날에 끝나면 끝 날짜만, 해가 다르면 연도까지", () => {
    expect(whenText(ev({ startAt: kstDate(2026, 11, 12, 12), endAt: kstDate(2026, 11, 19, 12) }), now)).toBe("11.12 (목) 12:00 ~ 11.19");
    expect(whenText(ev({ endAt: kstDate(2027, 2, 18, 9) }), now)).toBe("11.19 (목) 12:00 ~ 2027.2.18");
  });
  test("하루 종일이면 시각을 빼고, 올해가 아니면 연도를 붙인다", () => {
    expect(whenText(ev({ allDay: true }), now)).toBe("11.19 (목)");
    expect(whenText(ev({ allDay: true, startAt: kstDate(2027, 1, 5) }), now)).toBe("2027.1.5 (화)");
  });
});

test("ddayText: 오늘, D-n, 진행 중, 지났으면 빈 문자열", () => {
  expect(ddayText(ev({ startAt: kstDate(2026, 11, 13, 21) }), now)).toBe("오늘");
  expect(ddayText(ev({ startAt: kstDate(2026, 11, 19, 6) }), now)).toBe("D-6");
  expect(ddayText(ev({ startAt: kstDate(2026, 11, 12, 12), endAt: kstDate(2026, 11, 19, 12) }), now)).toBe("진행 중");
  expect(ddayText(ev({ startAt: kstDate(2026, 11, 10, 12) }), now)).toBe("");
});

describe("upcomingVisible", () => {
  const patch = ev({ id: "patch", kind: "patch", startAt: kstDate(2026, 11, 26, 12) });
  const season = ev({ id: "season", kind: "season", startAt: kstDate(2026, 11, 12, 12), endAt: kstDate(2026, 11, 19, 12) });
  const nextMonth = ev({ id: "next", kind: "tournament", startAt: kstDate(2026, 12, 5, 19) });
  const done = ev({ id: "done", kind: "maintenance", startAt: kstDate(2026, 11, 10, 6), endAt: kstDate(2026, 11, 10, 12) });
  const duo = ev({ id: "duo", kind: null, mine: true, source: null, startAt: kstDate(2026, 11, 14, 21) });
  const myDone = ev({ id: "myDone", kind: null, mine: true, source: null, startAt: kstDate(2026, 11, 12, 21) });
  const official = [patch, nextMonth, done, season];
  const mine = [myDone, duo];
  const ALL = ["maint", "season", "match", "mine"] as const;

  test("공식 일정과 내 일정이 시작 순으로 섞이고, 다음 달 일정도 들어간다", () => {
    expect(upcomingVisible(official, mine, ALL, now, 5).map((e) => e.id)).toEqual(["season", "duo", "patch", "next"]);
  });
  test("꺼진 묶음은 빠진다", () => {
    expect(upcomingVisible(official, mine, ["maint", "match"], now, 5).map((e) => e.id)).toEqual(["patch", "next"]);
    expect(upcomingVisible(official, mine, ["mine"], now, 5).map((e) => e.id)).toEqual(["duo"]);
    expect(upcomingVisible(official, mine, [], now, 5)).toEqual([]);
  });
  test("끝난 일정은 빠진다", () => {
    const ids = upcomingVisible(official, mine, ALL, now, 10).map((e) => e.id);
    expect(ids).not.toContain("done");
    expect(ids).not.toContain("myDone");
  });
  test("n 개에서 자른다. 꺼진 묶음을 뺀 뒤에 센다", () => {
    expect(upcomingVisible(official, mine, ALL, now, 2).map((e) => e.id)).toEqual(["season", "duo"]);
    expect(upcomingVisible(official, mine, ["maint", "match", "mine"], now, 2).map((e) => e.id)).toEqual(["duo", "patch"]);
  });
});

test("dayTitle: 그날 일정 시트의 제목", () => {
  expect(dayTitle({ year: 2026, month: 11, day: 14 })).toBe("11월 14일 (토)");
  expect(dayTitle({ year: 2026, month: 11, day: 1 })).toBe("11월 1일 (일)");
  expect(dayTitle({ year: 2027, month: 1, day: 5 })).toBe("1월 5일 (화)");
});
