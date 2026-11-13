import { kstDate } from "@/lib/calendar/kst";
import type { SeasonRow } from "@/lib/er/client";

/** "2026-11-19 12:00:00" 을 한국 시각으로 읽은 Date. 형식이 틀리면 null. */
export function parseKstDateTime(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  return new Date(kstDate(year, month, day, hour, minute).getTime() + second * 1000);
}

/** API 의 시즌 번호와 공식 시즌 번호의 차이. API Season20 이 공식 시즌 11 이다. */
const SEASON_NUMBER_OFFSET = 9;
const FIRST_MAPPED_SEASON = 10;

/** API 시즌 이름을 화면 제목으로. Season20 → "시즌 11", Pre-Season22 → "시즌 13 프리시즌", 그 밖은 그대로. */
export function seasonTitle(seasonName: string): string {
  const m = /^(Pre-)?Season(\d+)$/.exec(seasonName);
  if (!m) return seasonName;
  const n = Number(m[2]);
  if (n < FIRST_MAPPED_SEASON) return seasonName;
  return `시즌 ${n - SEASON_NUMBER_OFFSET}${m[1] ? " 프리시즌" : ""}`;
}

export type SeasonEventDoc = {
  id: string;
  title: string;
  kind: "season";
  startAt: Date;
  endAt: Date;
  allDay: false;
  url: null;
  note: null;
  source: "er-api";
};

/** 시즌 행을 events 문서로. 날짜를 읽지 못한 행은 뺀다. id 는 `season-{seasonID}`. */
export function seasonEventDocs(rows: readonly SeasonRow[]): SeasonEventDoc[] {
  return rows.flatMap((r) => {
    const startAt = parseKstDateTime(r.seasonStart);
    const endAt = parseKstDateTime(r.seasonEnd);
    if (!startAt || !endAt) return [];
    return [
      { id: `season-${r.seasonID}`, title: seasonTitle(r.seasonName), kind: "season", startAt, endAt, allDay: false, url: null, note: null, source: "er-api" },
    ];
  });
}
