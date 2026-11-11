"use client";

import { useState } from "react";
import type { JoinResult } from "@/lib/enterApi";

const MESSAGES: Record<Exclude<JoinResult["kind"], "ok" | "wrong_pin">, string> = {
  unknown_nickname: "등록되지 않은 닉네임",
  rate_limited: "1분 뒤 다시 시도",
  error: "잠시 후 다시 시도",
};

export function NicknameForm({ onSubmit }: { onSubmit: (nickname: string) => Promise<JoinResult> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    const result = await onSubmit(value);
    setBusy(false);
    if (result.kind === "ok" || result.kind === "wrong_pin") return;
    setNotice(MESSAGES[result.kind]);
  }

  return (
    <form onSubmit={submit} className="flex w-[240px] flex-col gap-2">
      <label className="text-center font-condensed text-[28px] tracking-tight text-zinc-400" htmlFor="nickname">
        NICKNAME
      </label>
      <input
        id="nickname"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={30}
        className="h-12 border border-zinc-300 px-3 text-center text-lg outline-none focus:border-zinc-500"
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="h-12 bg-zinc-800 text-white disabled:opacity-40"
      >
        입장
      </button>
      <p className="h-5 text-center text-sm text-red-500">{notice}</p>
    </form>
  );
}
