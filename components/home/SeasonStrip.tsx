"use client";

import { useUpcomingOfficial } from "@/components/calendar/useEvents";
import { useNow } from "@/components/calendar/useNow";
import { GROUP_COLOR, ddayText, whenText } from "@/lib/calendar/events";
import { currentAndNextSeason } from "@/lib/calendar/season";

/** 시즌을 찾으려고 읽는 다가오는 공식 일정 수. */
const LOOKAHEAD = 20;

/**
 * 홈의 시즌 한 줄. "{지금 시즌} 진행 중" 아래에 다음 시즌의 시작 시각을 보이고, 오른쪽에 다음 시즌까지 남은 날을 보인다.
 * 지금 시즌이 없으면 다음 시즌만 보이고, 둘 다 없으면 아무것도 그리지 않는다.
 */
export function SeasonStrip() {
  const now = useNow();
  const { events } = useUpcomingOfficial(LOOKAHEAD);
  if (!now) return null;
  const { current, next } = currentAndNextSeason(events, now);
  if (!current && !next) return null;

  const nextStart = next ? `${next.title} 시작 ${whenText({ startAt: next.startAt, endAt: null, allDay: next.allDay }, now)}` : null;
  return (
    <section aria-label="시즌" className="mx-4 flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 md:mx-0">
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${GROUP_COLOR.season.dot}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {current ? (
          <>
            <p className="truncate text-[15px] font-bold text-zinc-900">{current.title} 진행 중</p>
            {nextStart && <p className="truncate text-xs text-zinc-500">{nextStart}</p>}
          </>
        ) : (
          <p className="truncate text-[15px] font-bold text-zinc-900">{nextStart}</p>
        )}
      </div>
      {next && <span className="shrink-0 text-xs font-bold text-zinc-500">{ddayText({ startAt: next.startAt, endAt: null }, now)}</span>}
    </section>
  );
}
