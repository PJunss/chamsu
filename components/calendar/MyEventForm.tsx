"use client";

import { useState } from "react";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { Sheet } from "@/components/calendar/Sheet";
import { addMyEvent } from "@/components/calendar/useMyEvents";
import { REMIND_OPTIONS, TITLE_MAX, parseMyEvent } from "@/lib/calendar/eventInput";
import { dateInputValue, kstFromInputs } from "@/lib/calendar/formInput";
import type { Ymd } from "@/lib/calendar/kst";

const REMIND_LABEL: Record<string, string> = { none: "없음", 10: "10분 전", 30: "30분 전", 60: "1시간 전" };
const ERROR_TEXT = {
  title: `제목을 1~${TITLE_MAX}자로 적어 주세요`,
  start: "날짜와 시작 시각을 확인해 주세요",
  end: "끝 시각은 시작보다 뒤여야 합니다",
  remind: "미리 알림을 다시 골라 주세요",
  save: "저장하지 못했습니다",
};
type FormError = keyof typeof ERROR_TEXT;

const FIELD = "h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500";
const LABEL = "mb-1.5 block text-xs text-zinc-500";

function ErrorLine({ show, text }: { show: boolean; text: string }) {
  return show ? <p className="mt-1 text-xs text-red-500">{text}</p> : null;
}

/**
 * 내 일정 추가 창. ymd 는 처음 채워 둘 날짜다. uid 가 null(로그인 전)이면 폼 대신 로그인 버튼을 보인다.
 * 날짜와 시각은 한국 시간으로 읽는다. 끝 시각은 같은 날의 시각이다.
 */
export function MyEventForm({ uid, ymd, onClose }: { uid: string | null; ymd: Ymd; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => dateInputValue(ymd));
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("");
  const [remind, setRemind] = useState<number | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!uid || busy) return;
    const parsed = parseMyEvent({
      title,
      startAt: kstFromInputs(date, allDay ? null : start),
      endAt: allDay || !end ? null : (kstFromInputs(date, end) ?? new Date(NaN)),
      allDay,
      remindMinutes: remind,
    });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addMyEvent(uid, parsed.value);
      onClose();
    } catch (e) {
      console.warn("my event save failed", e instanceof Error ? e.name : "unknown");
      setError("save");
      setBusy(false);
    }
  }

  return (
    <Sheet label="내 일정 추가" onClose={onClose} header={<h2 className="text-lg font-bold text-zinc-900">내 일정 추가</h2>}>
      {uid === null ? (
        <div className="h-[380px]">
          <LoginPrompt heading="로그인하고 내 일정을 넣어 보세요" description="넣은 일정은 나만 볼 수 있어요" />
        </div>
      ) : (
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div>
            <label htmlFor="my-event-title" className={LABEL}>
              제목
            </label>
            <input
              id="my-event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              autoComplete="off"
              className={FIELD}
            />
            <ErrorLine show={error === "title"} text={ERROR_TEXT.title} />
          </div>

          <div>
            <label htmlFor="my-event-date" className={LABEL}>
              날짜
            </label>
            <input id="my-event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
            <ErrorLine show={error === "start"} text={ERROR_TEXT.start} />
          </div>

          <div className="flex items-center justify-between">
            <span id="my-event-allday" className="text-sm text-zinc-900">
              하루 종일
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={allDay}
              aria-labelledby="my-event-allday"
              onClick={() => setAllDay((v) => !v)}
              className={`flex h-7 w-12 items-center rounded-full px-0.5 ${allDay ? "justify-end bg-zinc-800" : "justify-start bg-zinc-300"}`}
            >
              <span aria-hidden className="h-6 w-6 rounded-full bg-white" />
            </button>
          </div>

          {!allDay && (
            <div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="my-event-start" className={LABEL}>
                    시작
                  </label>
                  <input id="my-event-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className={FIELD} />
                </div>
                <div>
                  <label htmlFor="my-event-end" className={LABEL}>
                    끝 (선택)
                  </label>
                  <input id="my-event-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={FIELD} />
                </div>
              </div>
              <ErrorLine show={error === "end"} text={ERROR_TEXT.end} />
            </div>
          )}

          <div>
            <p className={LABEL}>미리 알림</p>
            <div className="grid grid-cols-4 gap-1.5">
              {REMIND_OPTIONS.map((m) => (
                <button
                  key={m ?? "none"}
                  type="button"
                  aria-pressed={remind === m}
                  onClick={() => setRemind(m)}
                  className={`h-10 rounded-lg border text-xs ${
                    remind === m ? "border-zinc-800 bg-zinc-800 font-bold text-white" : "border-zinc-300 text-zinc-500"
                  }`}
                >
                  {REMIND_LABEL[m ?? "none"]}
                </button>
              ))}
            </div>
            <ErrorLine show={error === "remind"} text={ERROR_TEXT.remind} />
          </div>

          <div>
            <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-zinc-800 text-sm font-bold text-white disabled:opacity-40">
              저장
            </button>
            <ErrorLine show={error === "save"} text={ERROR_TEXT.save} />
          </div>
        </form>
      )}
    </Sheet>
  );
}
