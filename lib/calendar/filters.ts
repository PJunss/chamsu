import { FILTER_GROUPS, type FilterGroup } from "@/lib/calendar/events";

export const FILTER_STORAGE_KEY = "er.calendar.filters";
export const ALL_FILTERS: readonly FilterGroup[] = FILTER_GROUPS.map((g) => g.key);

/** localStorage 문자열을 켜진 묶음 목록으로 푼다. 없거나 깨졌으면 모두 켠다. 모르는 값은 버린다. */
export function parseFilters(raw: string | null): FilterGroup[] {
  if (raw === null) return [...ALL_FILTERS];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [...ALL_FILTERS];
  }
  if (!Array.isArray(value)) return [...ALL_FILTERS];
  return ALL_FILTERS.filter((k) => value.includes(k));
}

/** 묶음 하나를 켜거나 끈다. 결과는 ALL_FILTERS 순서다. */
export function toggleFilter(on: readonly FilterGroup[], key: FilterGroup): FilterGroup[] {
  return ALL_FILTERS.filter((k) => (k === key ? !on.includes(k) : on.includes(k)));
}
