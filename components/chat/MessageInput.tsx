"use client";

import { useState } from "react";

export const MAX_TEXT = 500;

export function MessageInput({ send }: { send: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    const ok = await send(value);
    setBusy(false);
    setFailed(!ok);
    if (ok) setText("");
  }

  return (
    <div className="border-t border-zinc-200 p-3">
      {failed && <p className="mb-1 text-xs text-red-500">전송 실패</p>}
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={MAX_TEXT}
          rows={1}
          className="max-h-32 flex-1 resize-none border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <button type="button" onClick={submit} disabled={busy || !text.trim()} className="bg-zinc-800 px-4 text-sm text-white disabled:opacity-40">
          전송
        </button>
      </div>
    </div>
  );
}
