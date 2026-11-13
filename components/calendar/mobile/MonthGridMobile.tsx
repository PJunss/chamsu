import { GROUP_COLOR, eventsOnDay, groupOf, type CalendarEvent } from "@/lib/calendar/events";
import { monthGrid, type Ymd } from "@/lib/calendar/kst";

export type MonthGridProps = {
  year: number;
  month: number;
  /** 오늘의 한국 날짜. */
  today: Ymd;
  /** 그 달에 걸치는 일정 중 필터로 고른 것. */
  events: readonly CalendarEvent[];
  /** 날짜 칸을 눌렀을 때. 휴대폰은 그날 일정 시트, 데스크톱은 내 일정 추가를 연다. */
  onPickDay: (ymd: Ymd) => void;
  /** 그날 일정 목록을 열 때(데스크톱의 "+n"). */
  onOpenDay: (ymd: Ymd) => void;
  /** 일정을 눌렀을 때. */
  onOpenEvent: (e: CalendarEvent) => void;
};

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
export const sameDay = (a: Ymd, b: Ymd) => a.year === b.year && a.month === b.month && a.day === b.day;
const MAX_DOTS = 3;

/**
 * 휴대폰 월 보기. 칸마다 날짜 숫자와 그 날 일정의 묶음 색 점(최대 3개)을 보인다.
 * 여러 날 일정은 걸친 날마다 점으로 보인다. 칸을 누르면 그 날짜로 onPickDay 를 불러 그날 일정 시트를 연다.
 */
export function MonthGridMobile({ year, month, today, events, onPickDay }: MonthGridProps) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-zinc-200 pb-2 text-center text-xs text-zinc-400">
        {WEEKDAY_LABELS.map((w, i) => (
          <span key={w} className={i === 0 ? "text-rose-600" : ""}>
            {w}
          </span>
        ))}
      </div>
      {monthGrid(year, month).map((week) => (
        <div key={`${week[0].ymd.month}-${week[0].ymd.day}`} className="grid grid-cols-7 border-b border-zinc-200">
          {week.map(({ ymd, inMonth }, i) => {
            const isToday = sameDay(ymd, today);
            const dots = inMonth ? eventsOnDay(events, ymd).slice(0, MAX_DOTS) : [];
            return (
              <button
                key={ymd.day}
                type="button"
                onClick={() => onPickDay(ymd)}
                aria-label={`${ymd.month}월 ${ymd.day}일${dots.length > 0 ? `, 일정 ${dots.length}개` : ""}`}
                aria-current={isToday ? "date" : undefined}
                className="flex h-[60px] flex-col items-center gap-1 pt-1.5"
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                    isToday
                      ? "bg-zinc-900 font-bold text-white"
                      : !inMonth
                        ? "text-zinc-300"
                        : i === 0
                          ? "text-rose-600"
                          : "text-zinc-900"
                  }`}
                >
                  {ymd.day}
                </span>
                <span className="flex h-1.5 gap-0.5">
                  {dots.map((e) => (
                    <span key={`${e.mine ? "m" : "o"}-${e.id}`} className={`h-1.5 w-1.5 rounded-full ${GROUP_COLOR[groupOf(e)].dot}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
