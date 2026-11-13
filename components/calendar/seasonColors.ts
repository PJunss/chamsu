import type { CalendarEvent } from "@/lib/calendar/events";
import { seasonColorIndex } from "@/lib/calendar/season";

/**
 * 시즌 색 묶음. 순서가 seasonColorIndex 의 번호다(0 indigo, 1 fuchsia, 2 emerald, 3 orange).
 * soft 는 옅은 바탕(띠, 날짜 숫자), text 는 그 위의 글자, solid 는 진행 막대와 휴대폰 끝 표식,
 * ring 은 오늘 표시 둘레의 고리, track 은 진행 막대의 빈 부분, hover 는 띠에 올렸을 때의 바탕이다.
 */
export type SeasonColor = { soft: string; text: string; solid: string; ring: string; track: string; hover: string };

export const SEASON_COLORS: readonly SeasonColor[] = [
  { soft: "bg-indigo-100", text: "text-indigo-800", solid: "bg-indigo-600", ring: "ring-indigo-600", track: "bg-indigo-200", hover: "hover:bg-indigo-200" },
  { soft: "bg-fuchsia-100", text: "text-fuchsia-800", solid: "bg-fuchsia-600", ring: "ring-fuchsia-600", track: "bg-fuchsia-200", hover: "hover:bg-fuchsia-200" },
  { soft: "bg-emerald-100", text: "text-emerald-800", solid: "bg-emerald-600", ring: "ring-emerald-600", track: "bg-emerald-200", hover: "hover:bg-emerald-200" },
  { soft: "bg-orange-100", text: "text-orange-800", solid: "bg-orange-600", ring: "ring-orange-600", track: "bg-orange-200", hover: "hover:bg-orange-200" },
];

/** 그 시즌 일정의 색 묶음. */
export function seasonColorOf(e: Pick<CalendarEvent, "id">): SeasonColor {
  return SEASON_COLORS[seasonColorIndex(e)];
}
