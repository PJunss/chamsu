import { Timestamp, type DocumentData } from "firebase/firestore";
import { EVENT_KINDS, type CalendarEvent, type EventSource } from "@/lib/calendar/events";

const SOURCES: readonly EventSource[] = ["admin", "draft", "er-api"];

const dateOf = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);
const textOf = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Firestore 일정 문서를 화면용 일정으로 바꾼다. 없는 필드는 null 로 둔다.
 * mine 이 true 면 내 일정(users/{uid}/events)이고 kind 는 null 이다.
 * 제목이나 시작 시각이 없거나, 공식 일정인데 종류를 모르면 null 을 준다.
 */
export function toEvent(id: string, data: DocumentData, mine: boolean): CalendarEvent | null {
  const title = textOf(data.title);
  const startAt = dateOf(data.startAt);
  if (!title || !startAt) return null;
  const kind = mine ? null : (EVENT_KINDS.find((k) => k === data.kind) ?? null);
  if (!mine && !kind) return null;
  return {
    id,
    title,
    kind,
    mine,
    startAt,
    endAt: dateOf(data.endAt),
    allDay: data.allDay === true,
    url: mine ? null : textOf(data.url),
    note: mine ? null : textOf(data.note),
    source: mine ? null : (SOURCES.find((s) => s === data.source) ?? null),
    remindMinutes: typeof data.remindMinutes === "number" ? data.remindMinutes : null,
  };
}
