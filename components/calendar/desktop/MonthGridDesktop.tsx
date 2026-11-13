import { MAX_BAR_LANES, WEEKDAY_LABELS, sameDay, type MonthGridProps } from "@/components/calendar/mobile/MonthGridMobile";
import { FlagIcon } from "@/components/calendar/SeasonBanner";
import { singleDayEvents, weekBars } from "@/lib/calendar/bars";
import { GROUP_COLOR, eventsOnDay, groupOf } from "@/lib/calendar/events";
import { monthGrid } from "@/lib/calendar/kst";
import { seasonMarkersOnDay } from "@/lib/calendar/season";

const MAX_LABELS = 3;
/** 막대 한 줄이 차지하는 높이(px): 막대 20 + 간격 2. */
const BAR_ROW_PX = 22;
/** 주 행의 위에서 첫 막대까지의 거리(px): 칸 안쪽 여백 6 + 날짜 숫자 24 + 간격 4. */
const BAR_TOP_PX = 34;
/** 그리지 못한 막대 수("+n") 줄의 높이(px). */
const MORE_ROW_PX = 18;

/**
 * 데스크톱 월 보기. 칸마다 날짜 숫자를 보이고, 그 아래에 여러 날 일정을 칸을 가로지르는 막대(옅은 묶음 색 바탕에 제목, 최대 2줄)로,
 * 그 아래에 하루짜리 일정을 이름표(최대 3개, 넘치면 "+n")로 보인다. 막대가 2줄을 넘으면 그 주 첫 칸에 "+n" 을 보인다.
 * 시즌 일정은 막대나 이름표 대신, 시작하는 날에 깃발과 "{제목} 시작", 끝나는 날에 "{제목} 종료" 를 시즌 색 글자로 보인다.
 * 막대·이름표·시즌 표식을 누르면 onOpenEvent, "+n" 을 누르면 onOpenDay, 칸의 빈 곳을 누르면 그 날짜로 onPickDay 를 부른다.
 */
export function MonthGridDesktop({ year, month, today, events, onPickDay, onOpenDay, onOpenEvent }: MonthGridProps) {
  const singles = singleDayEvents(events);
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b border-zinc-200 pb-1.5 text-xs text-zinc-400">
        {WEEKDAY_LABELS.map((w, i) => (
          <span key={w} className={`px-2 ${i === 0 ? "text-rose-600" : ""}`}>
            {w}
          </span>
        ))}
      </div>
      {monthGrid(year, month).map((week) => {
        const allBars = weekBars(events, week.map((c) => c.ymd));
        const bars = allBars.filter((b) => b.lane < MAX_BAR_LANES);
        const hidden = allBars.filter((b) => b.lane >= MAX_BAR_LANES);
        const barRows = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);
        const reserved = barRows * BAR_ROW_PX + (hidden.length > 0 ? MORE_ROW_PX : 0);
        return (
          <div key={`${week[0].ymd.month}-${week[0].ymd.day}`} className="relative grid min-h-[112px] flex-1 grid-cols-7 border-b border-zinc-200">
            {week.map(({ ymd, inMonth }, i) => {
              const isToday = sameDay(ymd, today);
              const dayEvents = inMonth ? eventsOnDay(singles, ymd) : [];
              const more = dayEvents.length - MAX_LABELS;
              const marks = inMonth ? seasonMarkersOnDay(events, ymd) : [];
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
                  <ul className="pointer-events-none relative mt-1 flex flex-col gap-1" style={{ paddingTop: reserved }}>
                    {marks.map((m) => (
                      <li key={`${m.type}-${m.event.id}`}>
                        <button
                          type="button"
                          onClick={() => onOpenEvent(m.event)}
                          className={`pointer-events-auto flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] font-bold hover:bg-indigo-50 ${GROUP_COLOR.season.text}`}
                        >
                          {m.type === "start" && <FlagIcon size={10} />}
                          <span className="truncate">
                            {m.event.title} {m.type === "start" ? "시작" : "종료"}
                          </span>
                        </button>
                      </li>
                    ))}
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
                    {more > 0 && (
                      <li>
                        <button
                          type="button"
                          onClick={() => onOpenDay(ymd)}
                          aria-label={`${ymd.month}월 ${ymd.day}일 일정 ${more}개 더 보기`}
                          className="pointer-events-auto rounded px-1.5 text-[11px] text-zinc-500 hover:bg-zinc-100"
                        >
                          +{more}
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
            {allBars.length > 0 && (
              <div className="pointer-events-none absolute inset-x-0 grid grid-cols-7 gap-y-[2px]" style={{ top: BAR_TOP_PX, gridAutoRows: 20 }}>
                {bars.map((b) => (
                  <button
                    key={`${b.event.mine ? "m" : "o"}-${b.event.id}`}
                    type="button"
                    onClick={() => onOpenEvent(b.event)}
                    style={{ gridColumn: `${b.startCol + 1} / ${b.endCol + 2}`, gridRow: b.lane + 1 }}
                    className={`pointer-events-auto min-w-0 truncate px-1.5 text-left text-[11px] leading-5 ${GROUP_COLOR[groupOf(b.event)].soft} ${
                      b.startsHere ? "ml-1.5 rounded-l" : ""
                    } ${b.endsHere ? "mr-1.5 rounded-r" : ""}`}
                  >
                    {b.event.title}
                  </button>
                ))}
                {hidden.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(week[hidden[0].startCol].ymd)}
                    aria-label={`이 주의 여러 날 일정 ${hidden.length}개 더 보기`}
                    style={{ gridColumn: "1 / 2", gridRow: barRows + 1 }}
                    className="pointer-events-auto ml-1.5 justify-self-start rounded px-1.5 text-[11px] leading-4 text-zinc-500 hover:bg-zinc-100"
                  >
                    +{hidden.length}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
