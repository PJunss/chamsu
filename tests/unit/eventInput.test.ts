import { describe, expect, test } from "vitest";
import { parseAdminEvent, parseMyEvent, remindAtOf } from "@/lib/calendar/eventInput";
import { kstDate } from "@/lib/calendar/kst";

const START = kstDate(2026, 11, 19, 21);
const END = kstDate(2026, 11, 19, 23);

describe("parseMyEvent", () => {
  const mine = (over: Partial<Parameters<typeof parseMyEvent>[0]> = {}) => ({
    title: "스크림", startAt: START, endAt: null, allDay: false, remindMinutes: null, ...over,
  });

  test("정상 입력이면 제목을 다듬어 돌려준다", () => {
    expect(parseMyEvent(mine({ title: "  스크림  ", endAt: END, remindMinutes: 30 }))).toEqual({
      ok: true,
      value: { title: "스크림", startAt: START, endAt: END, allDay: false, remindMinutes: 30 },
    });
  });
  test("제목은 1~60자", () => {
    expect(parseMyEvent(mine({ title: "" }))).toEqual({ ok: false, error: "title" });
    expect(parseMyEvent(mine({ title: "   " }))).toEqual({ ok: false, error: "title" });
    expect(parseMyEvent(mine({ title: "가".repeat(61) }))).toEqual({ ok: false, error: "title" });
    expect(parseMyEvent(mine({ title: "가".repeat(60) }))).toMatchObject({ ok: true });
  });
  test("시작이 없거나 날짜가 아니면 거부", () => {
    expect(parseMyEvent(mine({ startAt: null }))).toEqual({ ok: false, error: "start" });
    expect(parseMyEvent(mine({ startAt: new Date(NaN) }))).toEqual({ ok: false, error: "start" });
  });
  test("끝이 시작과 같거나 앞이면 거부", () => {
    expect(parseMyEvent(mine({ endAt: START }))).toEqual({ ok: false, error: "end" });
    expect(parseMyEvent(mine({ endAt: kstDate(2026, 11, 19, 20) }))).toEqual({ ok: false, error: "end" });
    expect(parseMyEvent(mine({ endAt: new Date(NaN) }))).toEqual({ ok: false, error: "end" });
  });
  test("미리 알림은 없음·10·30·60 분만", () => {
    expect(parseMyEvent(mine({ remindMinutes: 15 }))).toEqual({ ok: false, error: "remind" });
    expect(parseMyEvent(mine({ remindMinutes: 30 }))).toEqual({ ok: true, value: mine({ remindMinutes: 30 }) });
    expect(parseMyEvent(mine({ remindMinutes: null }))).toEqual({ ok: true, value: mine() });
  });
});

test("remindAtOf: 시작에서 미리 알림 분만큼 앞, 없으면 null", () => {
  expect(remindAtOf(START, 30)).toEqual(kstDate(2026, 11, 19, 20, 30));
  expect(remindAtOf(START, null)).toBeNull();
});

describe("parseAdminEvent", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    title: " 정기 점검 ", kind: "maintenance", startAt: "2026-11-18T21:00:00.000Z", endAt: "2026-11-19T03:00:00.000Z",
    allDay: false, url: "", note: "", ...over,
  });

  test("정상 본문: ISO 문자열은 Date 로, 빈 url·메모는 null 로", () => {
    expect(parseAdminEvent(body())).toEqual({
      ok: true,
      value: {
        title: "정기 점검", kind: "maintenance",
        startAt: new Date("2026-11-18T21:00:00.000Z"), endAt: new Date("2026-11-19T03:00:00.000Z"),
        allDay: false, url: null, note: null,
      },
    });
    expect(parseAdminEvent(body({ endAt: null, url: "https://playeternalreturn.com/posts/1", note: "서버 점검" }))).toEqual({
      ok: true,
      value: {
        title: "정기 점검", kind: "maintenance", startAt: new Date("2026-11-18T21:00:00.000Z"), endAt: null,
        allDay: false, url: "https://playeternalreturn.com/posts/1", note: "서버 점검",
      },
    });
  });
  test("제목이 비었거나 61자면 거부", () => {
    expect(parseAdminEvent(body({ title: " " }))).toEqual({ ok: false, error: "title" });
    expect(parseAdminEvent(body({ title: "가".repeat(61) }))).toEqual({ ok: false, error: "title" });
    expect(parseAdminEvent(body({ title: 3 }))).toEqual({ ok: false, error: "title" });
  });
  test("모르는 종류는 거부", () => {
    expect(parseAdminEvent(body({ kind: "x" }))).toEqual({ ok: false, error: "kind" });
    expect(parseAdminEvent(body({ kind: undefined }))).toEqual({ ok: false, error: "kind" });
  });
  test("시작이 날짜로 읽히지 않으면 거부", () => {
    expect(parseAdminEvent(body({ startAt: "nope" }))).toEqual({ ok: false, error: "start" });
    expect(parseAdminEvent(body({ startAt: 1 }))).toEqual({ ok: false, error: "start" });
  });
  test("끝이 시작과 같거나 앞이면 거부", () => {
    expect(parseAdminEvent(body({ endAt: "2026-11-18T21:00:00.000Z" }))).toEqual({ ok: false, error: "end" });
    expect(parseAdminEvent(body({ endAt: "nope" }))).toEqual({ ok: false, error: "end" });
  });
  test("출처 링크는 https 로 시작하는 500자 이하만", () => {
    expect(parseAdminEvent(body({ url: "http://a" }))).toEqual({ ok: false, error: "url" });
    expect(parseAdminEvent(body({ url: "javascript:1" }))).toEqual({ ok: false, error: "url" });
    expect(parseAdminEvent(body({ url: `https://a/${"x".repeat(500)}` }))).toEqual({ ok: false, error: "url" });
    expect(parseAdminEvent(body({ url: 3 }))).toEqual({ ok: false, error: "url" });
  });
  test("메모는 500자까지", () => {
    expect(parseAdminEvent(body({ note: "a".repeat(501) }))).toEqual({ ok: false, error: "note" });
    expect(parseAdminEvent(body({ note: "a".repeat(500) }))).toMatchObject({ ok: true });
  });
  test("본문이 객체가 아니거나 allDay 가 참·거짓이 아니면 body", () => {
    expect(parseAdminEvent(null)).toEqual({ ok: false, error: "body" });
    expect(parseAdminEvent("x")).toEqual({ ok: false, error: "body" });
    expect(parseAdminEvent([body()])).toEqual({ ok: false, error: "body" });
    expect(parseAdminEvent(body({ allDay: "yes" }))).toEqual({ ok: false, error: "body" });
  });
});
