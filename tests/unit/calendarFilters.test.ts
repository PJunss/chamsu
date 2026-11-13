import { expect, test } from "vitest";
import { ALL_FILTERS, parseFilters, toggleFilter } from "@/lib/calendar/filters";

test("저장된 값이 없거나 깨졌으면 모두 켠다", () => {
  expect(parseFilters(null)).toEqual(ALL_FILTERS);
  expect(parseFilters("{")).toEqual(ALL_FILTERS);
  expect(parseFilters('"maint"')).toEqual(ALL_FILTERS);
});
test("저장된 묶음만 켜고 모르는 값은 버린다", () => {
  expect(parseFilters('["mine","maint","nope"]')).toEqual(["maint", "mine"]);
  expect(parseFilters("[]")).toEqual([]);
});
test("누르면 켜고 끈다, 순서는 그대로", () => {
  expect(toggleFilter(["maint", "mine"], "season")).toEqual(["maint", "season", "mine"]);
  expect(toggleFilter(["maint", "mine"], "mine")).toEqual(["maint"]);
});
