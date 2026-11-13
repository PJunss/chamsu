import { kstDate, kstParts, type Ymd } from "@/lib/calendar/kst";

/** 날짜·시각 입력칸(<input type="date">, <input type="time">)의 문자열과 한국 시각 Date 사이의 변환. */

const two = (n: number) => String(n).padStart(2, "0");

/** 날짜 입력칸 값 "2026-11-14". */
export function dateInputValue(ymd: Ymd): string {
  return `${ymd.year}-${two(ymd.month)}-${two(ymd.day)}`;
}

/** Date 의 한국 날짜와 시각을 입력칸 값으로. */
export function inputValuesOf(d: Date): { date: string; time: string } {
  const p = kstParts(d);
  return { date: dateInputValue(p), time: `${two(p.hour)}:${two(p.minute)}` };
}

/**
 * 날짜 입력값("2026-11-14")과 시각 입력값("21:00")을 한국 시각의 Date 로 만든다.
 * time 이 null 이면 그 날 00:00 이다. 형식이 틀리거나 없는 날짜·시각이면 null.
 */
export function kstFromInputs(date: string, time: string | null): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  let hour = 0;
  let minute = 0;
  if (time !== null) {
    const t = /^(\d{2}):(\d{2})$/.exec(time);
    if (!t) return null;
    [hour, minute] = [Number(t[1]), Number(t[2])];
    if (hour > 23 || minute > 59) return null;
  }
  const at = kstDate(year, month, day, hour, minute);
  const back = kstParts(at);
  return back.year === year && back.month === month && back.day === day ? at : null;
}
