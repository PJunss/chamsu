"use client";

import { Sheet } from "@/components/calendar/Sheet";
import { UpcomingRow } from "@/components/calendar/UpcomingList";
import { dayTitle, eventsOnDay, type CalendarEvent } from "@/lib/calendar/events";
import type { Ymd } from "@/lib/calendar/kst";

/**
 * 날짜 하나의 일정 목록과 "내 일정 추가" 버튼. events 는 필터로 고른 일정이고, 그 날짜에 걸치는 것만 보인다.
 * 일정을 누르면 onOpenEvent, 버튼을 누르면 onAdd 를 부른다.
 */
export function DaySheet({
  ymd,
  events,
  now,
  onOpenEvent,
  onAdd,
  onClose,
}: {
  ymd: Ymd;
  events: readonly CalendarEvent[];
  now: Date;
  onOpenEvent: (e: CalendarEvent) => void;
  onAdd: (ymd: Ymd) => void;
  onClose: () => void;
}) {
  const title = dayTitle(ymd);
  const dayEvents = eventsOnDay(events, ymd);
  return (
    <Sheet label={`${title} 일정`} onClose={onClose} header={<h2 className="text-lg font-bold text-zinc-900">{title}</h2>}>
      {dayEvents.length > 0 ? (
        <ul className="mt-2 divide-y divide-zinc-200">
          {dayEvents.map((e) => (
            <li key={`${e.mine ? "mine" : "official"}-${e.id}`}>
              <UpcomingRow event={e} now={now} onOpen={onOpenEvent} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">일정이 없습니다</p>
      )}
      <button type="button" onClick={() => onAdd(ymd)} className="mt-5 h-12 w-full rounded-xl bg-zinc-800 text-sm font-bold text-white">
        내 일정 추가
      </button>
    </Sheet>
  );
}
