import { EVENT_KINDS, type EventKind } from "@/lib/calendar/events";

/** 일정 입력 검증. 브라우저와 서버가 같이 쓴다. */

export const TITLE_MAX = 60;
export const NOTE_MAX = 500;
export const URL_MAX = 500;
/** 미리 알림(분). null 은 알림 없음. */
export const REMIND_OPTIONS = [null, 10, 30, 60] as const;

export type MyEventInput = { title: string; startAt: Date; endAt: Date | null; allDay: boolean; remindMinutes: number | null };

const validDate = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());

/** 제목을 다듬어 준다. 1~60자가 아니면 null. */
function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = raw.trim();
  return title.length >= 1 && title.length <= TITLE_MAX ? title : null;
}

/** 내 일정 입력을 확인한다. 틀리면 이유 코드. */
export function parseMyEvent(raw: {
  title: string;
  startAt: Date | null;
  endAt: Date | null;
  allDay: boolean;
  remindMinutes: number | null;
}): { ok: true; value: MyEventInput } | { ok: false; error: "title" | "start" | "end" | "remind" } {
  const title = cleanTitle(raw.title);
  if (title === null) return { ok: false, error: "title" };
  if (!validDate(raw.startAt)) return { ok: false, error: "start" };
  if (raw.endAt !== null && (!validDate(raw.endAt) || raw.endAt.getTime() <= raw.startAt.getTime())) {
    return { ok: false, error: "end" };
  }
  if (!(REMIND_OPTIONS as readonly (number | null)[]).includes(raw.remindMinutes)) return { ok: false, error: "remind" };
  return {
    ok: true,
    value: { title, startAt: raw.startAt, endAt: raw.endAt, allDay: raw.allDay, remindMinutes: raw.remindMinutes },
  };
}

/** startAt − remindMinutes. remindMinutes 가 null 이면 null. */
export function remindAtOf(startAt: Date, remindMinutes: number | null): Date | null {
  return remindMinutes === null ? null : new Date(startAt.getTime() - remindMinutes * 60_000);
}

export type AdminEventInput = {
  title: string;
  kind: EventKind;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  url: string | null;
  note: string | null;
};

/** ISO 문자열을 Date 로. 문자열이 아니거나 날짜로 읽히지 않으면 null. */
function isoDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw) return null;
  const d = new Date(raw);
  return validDate(d) ? d : null;
}

const blank = (v: unknown) => v === null || v === undefined || v === "";

/** 관리자 API 본문(JSON)을 확인한다. startAt·endAt 은 ISO 문자열로 받는다. */
export function parseAdminEvent(
  body: unknown,
): { ok: true; value: AdminEventInput } | { ok: false; error: "title" | "kind" | "start" | "end" | "url" | "note" | "body" } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "body" };
  const b = body as Record<string, unknown>;

  const title = cleanTitle(b.title);
  if (title === null) return { ok: false, error: "title" };
  const kind = EVENT_KINDS.find((k) => k === b.kind);
  if (!kind) return { ok: false, error: "kind" };
  const startAt = isoDate(b.startAt);
  if (!startAt) return { ok: false, error: "start" };
  let endAt: Date | null = null;
  if (!blank(b.endAt)) {
    endAt = isoDate(b.endAt);
    if (!endAt || endAt.getTime() <= startAt.getTime()) return { ok: false, error: "end" };
  }
  if (typeof b.allDay !== "boolean") return { ok: false, error: "body" };

  let url: string | null = null;
  if (!blank(b.url)) {
    if (typeof b.url !== "string") return { ok: false, error: "url" };
    url = b.url.trim();
    if (!url.startsWith("https://") || url.length > URL_MAX) return { ok: false, error: "url" };
  }
  let note: string | null = null;
  if (!blank(b.note)) {
    if (typeof b.note !== "string" || b.note.length > NOTE_MAX) return { ok: false, error: "note" };
    note = b.note;
  }
  return { ok: true, value: { title, kind, startAt, endAt, allDay: b.allDay, url, note } };
}
