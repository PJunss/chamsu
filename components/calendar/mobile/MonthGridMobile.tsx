import { FlagIcon } from "@/components/calendar/SeasonBanner";
import { singleDayEvents, weekBars } from "@/lib/calendar/bars";
import { GROUP_COLOR, eventsOnDay, groupOf, type CalendarEvent } from "@/lib/calendar/events";
import { monthGrid, type Ymd } from "@/lib/calendar/kst";
import { seasonMarkersOnDay } from "@/lib/calendar/season";

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
/** 한 주에 그리는 막대 줄 수. 넘는 줄의 막대는 그리지 않는다. */
export const MAX_BAR_LANES = 2;
const MAX_DOTS = 3;
/** 막대 한 줄이 차지하는 높이(px): 막대 4 + 간격 2. */
const BAR_ROW_PX = 6;
/** 주 행의 위에서 첫 막대까지의 거리(px): 칸 위 여백 6 + 날짜 숫자 28 + 간격 4. */
const BAR_TOP_PX = 38;

/**
 * 휴대폰 월 보기. 칸마다 날짜 숫자를 보이고, 그 아래에 여러 날 일정을 칸을 가로지르는 얇은 막대(묶음 색, 최대 2줄)로,
 * 그 아래 한 줄에 시즌 표식(시작하는 날은 깃발, 끝나는 날은 네모)과 하루짜리 일정의 묶음 색 점(최대 3개)을 보인다.
 * 시즌 일정은 막대나 점으로 그리지 않는다. 칸을 누르면 그 날짜로 onPickDay 를 불러 그날 일정 시트를 연다.
 */
export function MonthGridMobile({ year, month, today, events, onPickDay }: MonthGridProps) {
  const singles = singleDayEvents(events);
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-zinc-200 pb-2 text-center text-xs text-zinc-400">
        {WEEKDAY_LABELS.map((w, i) => (
          <span key={w} className={i === 0 ? "text-rose-600" : ""}>
            {w}
          </span>
        ))}
      </div>
      {monthGrid(year, month).map((week) => {
        const bars = weekBars(events, week.map((c) => c.ymd)).filter((b) => b.lane < MAX_BAR_LANES);
        const barRows = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);
        return (
          <div key={`${week[0].ymd.month}-${week[0].ymd.day}`} className="relative grid grid-cols-7 border-b border-zinc-200">
            {week.map(({ ymd, inMonth }, i) => {
              const isToday = sameDay(ymd, today);
              const count = inMonth ? eventsOnDay(events, ymd).length : 0;
              const dots = inMonth ? eventsOnDay(singles, ymd).slice(0, MAX_DOTS) : [];
              const marks = inMonth ? seasonMarkersOnDay(events, ymd) : [];
              return (
                <button
                  key={ymd.day}
                  type="button"
                  onClick={() => onPickDay(ymd)}
                  aria-label={`${ymd.month}월 ${ymd.day}일${count > 0 ? `, 일정 ${count}개` : ""}`}
                  aria-current={isToday ? "date" : undefined}
                  className="flex min-h-[60px] flex-col items-center gap-1 pb-1.5 pt-1.5"
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
                  {barRows > 0 && <span aria-hidden style={{ height: barRows * BAR_ROW_PX - 2 }} />}
                  <span className="flex h-2.5 items-center gap-0.5">
                    {marks.map((m) =>
                      m.type === "start" ? (
                        <span key={`start-${m.event.id}`} className={GROUP_COLOR.season.text}>
                          <FlagIcon size={10} />
                        </span>
                      ) : (
                        <span key={`end-${m.event.id}`} className={`h-1.5 w-1.5 ${GROUP_COLOR.season.dot}`} />
                      ),
                    )}
                    {dots.map((e) => (
                      <span key={`${e.mine ? "m" : "o"}-${e.id}`} className={`h-1.5 w-1.5 rounded-full ${GROUP_COLOR[groupOf(e)].dot}`} />
                    ))}
                  </span>
                </button>
              );
            })}
            {bars.length > 0 && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 grid grid-cols-7 gap-y-[2px]"
                style={{ top: BAR_TOP_PX, gridAutoRows: 4 }}
              >
                {bars.map((b) => (
                  <span
                    key={`${b.event.mine ? "m" : "o"}-${b.event.id}`}
                    style={{ gridColumn: `${b.startCol + 1} / ${b.endCol + 2}`, gridRow: b.lane + 1 }}
                    className={`${GROUP_COLOR[groupOf(b.event)].dot} opacity-60 ${b.startsHere ? "ml-1.5 rounded-l-full" : ""} ${
                      b.endsHere ? "mr-1.5 rounded-r-full" : ""
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
