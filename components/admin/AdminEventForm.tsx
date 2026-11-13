"use client";

import { useState } from "react";
import { createEvent, updateEvent, type AdminEventPayload } from "@/components/admin/adminApi";
import { NOTE_MAX, TITLE_MAX, URL_MAX } from "@/lib/calendar/eventInput";
import { EVENT_KINDS, KIND_LABEL, type CalendarEvent, type EventKind } from "@/lib/calendar/events";
import { dateInputValue, inputValuesOf, kstFromInputs } from "@/lib/calendar/formInput";
import type { Ymd } from "@/lib/calendar/kst";

/** 서버가 알려 준 틀린 칸(또는 화면에서 먼저 찾은 칸)별 안내. */
const FIELD_ERROR: Record<string, string> = {
  title: `제목을 1~${TITLE_MAX}자로 적어 주세요`,
  kind: "종류를 골라 주세요",
  start: "시작 날짜와 시각을 확인해 주세요",
  end: "끝은 시작보다 뒤여야 합니다",
  url: `출처 링크는 https:// 로 시작하는 ${URL_MAX}자 이하 주소여야 합니다`,
  note: `메모는 ${NOTE_MAX}자까지 적을 수 있습니다`,
};

function failureText(error: string): string {
  if (error === "locked") return "ER API 에서 온 일정은 고칠 수 없습니다";
  if (error === "not_found") return "이미 지워진 일정입니다";
  if (error === "unauthorized" || error === "forbidden") return "관리자 권한을 확인하지 못했습니다";
  return "저장하지 못했습니다";
}

const FIELD = "h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500";
const LABEL = "mb-1.5 block text-xs text-zinc-500";

function ErrorLine({ field, error }: { field: string; error: string | null }) {
  return error === field ? <p className="mt-1 text-xs text-red-500">{FIELD_ERROR[field]}</p> : null;
}

/** 하루 종일 일정의 끝 날짜는 그 날의 마지막 분으로 둔다. 그래야 끝 날짜까지 달력에 걸친다. */
const ALL_DAY_END_TIME = "23:59";

/**
 * 관리자 일정 폼. editing 이 있으면 그 일정을 고치고, 없으면 새 일정을 만든다.
 * 날짜와 시각은 한국 시간으로 읽어 ISO 문자열로 보낸다. 끝 날짜를 비우면 끝이 없는 일정이다.
 * 다른 일정으로 바꿀 때는 key 를 바꿔 새로 그린다. today 는 새 일정의 처음 날짜다.
 */
export function AdminEventForm({
  editing,
  today,
  onSaved,
  onNew,
}: {
  editing: CalendarEvent | null;
  today: Ymd;
  onSaved: () => void;
  onNew: () => void;
}) {
  const startInit = editing ? inputValuesOf(editing.startAt) : { date: dateInputValue(today), time: "12:00" };
  const endInit = editing?.endAt ? inputValuesOf(editing.endAt) : { date: "", time: "" };

  const [title, setTitle] = useState(editing?.title ?? "");
  const [kind, setKind] = useState<EventKind>(editing?.kind ?? "patch");
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [startDate, setStartDate] = useState(startInit.date);
  const [startTime, setStartTime] = useState(startInit.time);
  const [endDate, setEndDate] = useState(endInit.date);
  const [endTime, setEndTime] = useState(endInit.time);
  const [url, setUrl] = useState(editing?.url ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setFailure(null);
    const startAt = kstFromInputs(startDate, allDay ? null : startTime);
    if (!startAt) {
      setFieldError("start");
      return;
    }
    let endAt: Date | null = null;
    if (endDate) {
      endAt = kstFromInputs(endDate, allDay ? ALL_DAY_END_TIME : endTime || startTime);
      if (!endAt) {
        setFieldError("end");
        return;
      }
    }
    const payload: AdminEventPayload = {
      title,
      kind,
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : null,
      allDay,
      url: url.trim() || null,
      note: note || null,
    };

    setBusy(true);
    setFieldError(null);
    const result = editing ? await updateEvent(editing.id, payload) : await createEvent(payload);
    setBusy(false);
    if (result.ok) {
      onSaved();
      return;
    }
    if (result.error === "bad_request" && result.field && result.field in FIELD_ERROR) setFieldError(result.field);
    else setFailure(failureText(result.error));
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h2 className="text-base font-bold text-zinc-900">{editing ? "일정 수정" : "새 일정"}</h2>

      <div>
        <label htmlFor="admin-event-title" className={LABEL}>
          제목
        </label>
        <input id="admin-event-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} autoComplete="off" className={FIELD} />
        <ErrorLine field="title" error={fieldError} />
      </div>

      <div>
        <label htmlFor="admin-event-kind" className={LABEL}>
          종류
        </label>
        <select
          id="admin-event-kind"
          value={kind}
          onChange={(e) => setKind(EVENT_KINDS.find((k) => k === e.target.value) ?? "patch")}
          className={`${FIELD} bg-white`}
        >
          {EVENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]} ({k})
            </option>
          ))}
        </select>
        <ErrorLine field="kind" error={fieldError} />
      </div>

      <label className="flex items-center justify-between text-sm text-zinc-900">
        하루 종일
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-zinc-800" />
      </label>

      <div>
        <p className={LABEL}>시작</p>
        <div className="flex gap-2">
          <input type="date" aria-label="시작 날짜" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={FIELD} />
          {!allDay && (
            <input type="time" aria-label="시작 시각" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${FIELD} w-[130px] shrink-0`} />
          )}
        </div>
        <ErrorLine field="start" error={fieldError} />
      </div>

      <div>
        <p className={LABEL}>끝 (선택)</p>
        <div className="flex gap-2">
          <input type="date" aria-label="끝 날짜" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={FIELD} />
          {!allDay && (
            <input type="time" aria-label="끝 시각" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={`${FIELD} w-[130px] shrink-0`} />
          )}
        </div>
        <ErrorLine field="end" error={fieldError} />
      </div>

      <div>
        <label htmlFor="admin-event-url" className={LABEL}>
          출처 링크
        </label>
        <input id="admin-event-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" autoComplete="off" className={FIELD} />
        <ErrorLine field="url" error={fieldError} />
      </div>

      <div>
        <label htmlFor="admin-event-note" className={LABEL}>
          메모
        </label>
        <textarea
          id="admin-event-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX}
          rows={3}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-zinc-500"
        />
        <ErrorLine field="note" error={fieldError} />
      </div>

      <div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onNew} className="h-11 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50">
            새 일정
          </button>
          <button type="submit" disabled={busy} className="h-11 rounded-lg bg-zinc-800 text-sm font-bold text-white disabled:opacity-40">
            저장
          </button>
        </div>
        {failure && <p className="mt-2 text-xs text-red-500">{failure}</p>}
      </div>
    </form>
  );
}
