/** 한국 시간(Asia/Seoul) 기준 날짜 계산. 한국은 서머타임이 없어 UTC+9 고정으로 계산한다. */

export type Ymd = { year: number; month: number; day: number };

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

const seoulParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 달력 날짜의 일 번호(1970-01-01 = 0). */
const ymdDayNumber = (year: number, month: number, day: number) => Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);

function ymdOfDayNumber(n: number): Ymd {
  const d = new Date(n * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 일 번호의 요일. 0 = 일요일. 1970-01-01 은 목요일이다. */
const weekdayOfDayNumber = (n: number) => (((n + 4) % 7) + 7) % 7;

/** Date 를 한국 날짜·시각·요일(0 = 일요일)로 푼다. */
export function kstParts(d: Date): Ymd & { hour: number; minute: number; weekday: number } {
  const p = Object.fromEntries(seoulParts.formatToParts(d).map((x) => [x.type, x.value]));
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  return {
    year,
    month,
    day,
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: weekdayOfDayNumber(ymdDayNumber(year, month, day)),
  };
}

/** 한국 시각으로 준 날짜·시각의 Date. month 가 13 이나 0 이어도 달을 넘겨 계산한다. */
export function kstDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
}

/** 한국 날짜의 일 번호(날짜 차이 계산용). */
export function kstDayNumber(d: Date): number {
  return Math.floor((d.getTime() + KST_OFFSET_MS) / DAY_MS);
}

/** 그 달의 월 보기 칸. 일요일부터 시작하는 주 단위, 앞뒤 달 날짜로 채운다. */
export function monthGrid(year: number, month: number): { ymd: Ymd; inMonth: boolean }[][] {
  const first = ymdDayNumber(year, month, 1);
  const last = ymdDayNumber(year, month + 1, 1) - 1;
  const start = first - weekdayOfDayNumber(first);
  const weeks: { ymd: Ymd; inMonth: boolean }[][] = [];
  for (let n = start; n <= last; n += 7) {
    const week: { ymd: Ymd; inMonth: boolean }[] = [];
    for (let i = 0; i < 7; i++) week.push({ ymd: ymdOfDayNumber(n + i), inMonth: n + i >= first && n + i <= last });
    weeks.push(week);
  }
  return weeks;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}
