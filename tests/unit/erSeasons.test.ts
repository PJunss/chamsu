import { expect, test } from "vitest";
import { parseKstDateTime, seasonEventDocs, seasonTitle } from "@/lib/er/seasons";

test("날짜 문자열을 한국 시각으로 읽는다", () => {
  expect(parseKstDateTime("2026-11-19 12:00:00")?.toISOString()).toBe("2026-11-19T03:00:00.000Z");
  expect(parseKstDateTime("2027-02-18 09:00:00")?.toISOString()).toBe("2027-02-18T00:00:00.000Z");
  expect(parseKstDateTime("2026-11-19")).toBeNull();
  expect(parseKstDateTime("")).toBeNull();
});
test("API 시즌 이름을 공식 번호로 바꾼다", () => {
  expect(seasonTitle("Season20")).toBe("시즌 11");
  expect(seasonTitle("Season22")).toBe("시즌 13");
  expect(seasonTitle("Pre-Season22")).toBe("시즌 13 프리시즌");
  expect(seasonTitle("Season9")).toBe("Season9");
  expect(seasonTitle("EA Season 3")).toBe("EA Season 3");
});
test("시즌 행을 일정 문서로 만들고 날짜가 틀린 행은 뺀다", () => {
  const docs = seasonEventDocs([
    { seasonID: 43, seasonName: "Season22", seasonStart: "2026-11-19 12:00:00", seasonEnd: "2027-02-18 09:00:00", isCurrent: 0 },
    { seasonID: 44, seasonName: "Season23", seasonStart: "soon", seasonEnd: "2027-05-20 09:00:00", isCurrent: 0 },
  ]);
  expect(docs).toEqual([
    {
      id: "season-43", title: "시즌 13", kind: "season",
      startAt: new Date("2026-11-19T03:00:00.000Z"), endAt: new Date("2027-02-18T00:00:00.000Z"),
      allDay: false, url: null, note: null, source: "er-api",
    },
  ]);
});
