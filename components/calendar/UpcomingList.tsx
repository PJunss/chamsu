import { GROUP_COLOR, ddayText, groupOf, kindText, whenText, type CalendarEvent } from "@/lib/calendar/events";

/** 일정 한 줄: 묶음 색 막대, 제목, "{종류} · {시각}", 오른쪽에 남은 날. 누르면 onOpen 을 부른다. */
export function UpcomingRow({ event, now, onOpen }: { event: CalendarEvent; now: Date; onOpen: (e: CalendarEvent) => void }) {
  return (
    <button type="button" onClick={() => onOpen(event)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-zinc-50">
      <span aria-hidden className={`h-9 w-[3px] shrink-0 rounded-full ${GROUP_COLOR[groupOf(event)].dot}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold text-zinc-900">{event.title}</span>
        <span className="truncate text-xs text-zinc-500">
          {kindText(event)} · {whenText(event, now)}
        </span>
      </span>
      <span className="shrink-0 text-xs font-bold text-zinc-500">{ddayText(event, now)}</span>
    </button>
  );
}

/** "다가오는 일정" 목록. events 는 이미 고른 일정(시작 순)이다. */
export function UpcomingList({
  events,
  now,
  ready,
  onOpen,
}: {
  events: readonly CalendarEvent[];
  now: Date;
  ready: boolean;
  onOpen: (e: CalendarEvent) => void;
}) {
  return (
    <section>
      <h2 className="text-base font-bold">다가오는 일정</h2>
      {events.length > 0 ? (
        <ul className="mt-2 divide-y divide-zinc-200">
          {events.map((e) => (
            <li key={`${e.mine ? "mine" : "official"}-${e.id}`}>
              <UpcomingRow event={e} now={now} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      ) : (
        ready && <p className="mt-3 text-sm text-zinc-500">예정된 일정이 없습니다</p>
      )}
    </section>
  );
}
