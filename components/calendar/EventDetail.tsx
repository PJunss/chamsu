"use client";

import { useState } from "react";
import { Sheet } from "@/components/calendar/Sheet";
import { deleteMyEvent } from "@/components/calendar/useMyEvents";
import { GROUP_COLOR, ddayText, groupOf, kindText, whenText, type CalendarEvent } from "@/lib/calendar/events";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * 일정 상세. 공식 일정은 메모, 출처 링크, "알림 받기" 자리를 보이고, 내 일정은 "삭제" 버튼을 보인다.
 * uid 는 내 일정을 지울 때 쓴다.
 */
export function EventDetail({
  event,
  now,
  uid,
  onClose,
}: {
  event: CalendarEvent;
  now: Date;
  uid: string | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const color = GROUP_COLOR[groupOf(event)];
  const dday = ddayText(event, now);

  async function remove() {
    if (!uid || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await deleteMyEvent(uid, event.id);
      onClose();
    } catch (e) {
      console.warn("my event delete failed", e instanceof Error ? e.name : "unknown");
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Sheet
      label="일정 상세"
      onClose={onClose}
      header={
        <p className="flex items-center gap-2 text-sm">
          <span aria-hidden className={`h-2 w-2 rounded-full ${color.dot}`} />
          <span className={`font-bold ${color.text}`}>{kindText(event)}</span>
          {dday && <span className="text-zinc-400">{dday}</span>}
        </p>
      }
    >
      <h2 className="mt-2 break-words text-2xl font-bold text-zinc-900">{event.title}</h2>
      <p className="mt-2 text-sm text-zinc-500">{whenText(event, now)}</p>
      {event.note && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-900">{event.note}</p>}

      {event.mine ? (
        <>
          <button
            type="button"
            onClick={remove}
            disabled={busy || !uid}
            className="mt-6 h-12 w-full rounded-xl border border-zinc-300 text-sm font-bold text-red-600 hover:bg-zinc-50 disabled:opacity-40"
          >
            삭제
          </button>
          {failed && <p className="mt-2 text-center text-xs text-red-500">지우지 못했습니다</p>}
        </>
      ) : (
        <>
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-bold text-zinc-900">출처 보기</span>
                <span className="truncate text-xs text-zinc-400">{hostOf(event.url)}</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400" aria-hidden>
                <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
              </svg>
            </a>
          )}
          <button type="button" disabled className="mt-5 h-12 w-full rounded-xl bg-zinc-800 text-sm font-bold text-white disabled:opacity-40">
            알림 받기
          </button>
          <p className="mt-2 text-center text-xs text-zinc-400">알림은 곧 열립니다</p>
        </>
      )}
    </Sheet>
  );
}
