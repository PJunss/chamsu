"use client";

import { useState } from "react";

export const MAX_TEXT = 500;

export function MessageInput({
  send,
  offline,
  claudeFailed,
}: {
  send: (text: string) => Promise<boolean>;
  offline: boolean;
  claudeFailed: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit() {
    const value = text.trim();
    if (!value || busy || offline) return;
    setBusy(true);
    const ok = await send(value);
    setBusy(false);
    setFailed(!ok);
    if (ok) setText("");
  }

  return (
    <div className="border-t border-zinc-200 p-3">
      {offline ? (
        <p className="mb-1 text-xs text-amber-700">연결 끊김</p>
      ) : (
        <>
          {failed && <p className="mb-1 text-xs text-red-500">전송 실패</p>}
          {claudeFailed && <p className="mb-1 text-xs text-red-500">비앙카 호출 실패</p>}
        </>
      )}
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={MAX_TEXT}
          rows={1}
          className="max-h-32 flex-1 resize-none border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <button type="button" onClick={submit} disabled={busy || offline || !text.trim()} className="bg-zinc-800 px-4 text-sm text-white disabled:opacity-40">
          전송
        </button>
      </div>
    </div>
  );
}
