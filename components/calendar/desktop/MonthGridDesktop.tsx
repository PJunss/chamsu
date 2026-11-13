import { WEEKDAY_LABELS, sameDay, type MonthGridProps } from "@/components/calendar/mobile/MonthGridMobile";
import { GROUP_COLOR, eventsOnDay, groupOf } from "@/lib/calendar/events";
import { monthGrid } from "@/lib/calendar/kst";

const MAX_LABELS = 3;

/**
 * 데스크톱 월 보기. 칸마다 날짜 숫자와 일정 이름표(옅은 묶음 색 바탕, 최대 3개, 넘치면 "+n")를 보인다.
 * 이름표를 누르면 onOpenEvent, 칸의 빈 곳을 누르면 그 날짜로 onPickDay 를 부른다.
 */
export function MonthGridDesktop({ year, month, today, events, onPickDay, onOpenEvent }: MonthGridProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b border-zinc-200 pb-1.5 text-xs text-zinc-400">
        {WEEKDAY_LABELS.map((w, i) => (
          <span key={w} className={`px-2 ${i === 0 ? "text-rose-600" : ""}`}>
            {w}
          </span>
        ))}
      </div>
      {monthGrid(year, month).map((week) => (
        <div key={`${week[0].ymd.month}-${week[0].ymd.day}`} className="grid min-h-[112px] flex-1 grid-cols-7 border-b border-zinc-200">
          {week.map(({ ymd, inMonth }, i) => {
            const isToday = sameDay(ymd, today);
            const dayEvents = inMonth ? eventsOnDay(events, ymd) : [];
            const more = dayEvents.length - MAX_LABELS;
            return (
              <div key={ymd.day} className={`relative min-w-0 p-1.5 ${i > 0 ? "border-l border-zinc-200" : ""}`}>
                <button
                  type="button"
                  onClick={() => onPickDay(ymd)}
                  aria-label={`${ymd.month}월 ${ymd.day}일에 내 일정 추가`}
                  className="absolute inset-0 hover:bg-zinc-50"
                />
                <span
                  aria-current={isToday ? "date" : undefined}
                  className={`pointer-events-none relative flex h-6 w-6 items-center justify-center rounded-full text-xs ${
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
                <ul className="pointer-events-none relative mt-1 flex flex-col gap-1">
                  {dayEvents.slice(0, MAX_LABELS).map((e) => (
                    <li key={`${e.mine ? "m" : "o"}-${e.id}`}>
                      <button
                        type="button"
                        onClick={() => onOpenEvent(e)}
                        className={`pointer-events-auto block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] ${GROUP_COLOR[groupOf(e)].soft}`}
                      >
                        {e.title}
                      </button>
                    </li>
                  ))}
                  {more > 0 && <li className="px-1.5 text-[11px] text-zinc-400">+{more}</li>}
                </ul>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
