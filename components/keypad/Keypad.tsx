"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PIN_LENGTH, pressKey } from "@/lib/keypad";
import type { EnterResult } from "@/lib/enterApi";

const ROWS = [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"]];

const MESSAGES: Partial<Record<EnterResult, string>> = {
  rate_limited: "1분 뒤 다시 시도",
  error: "잠시 후 다시 시도",
};

export function Keypad({ onSubmit }: { onSubmit: (pin: string) => Promise<EnterResult> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const codeRef = useRef("");
  const busyRef = useRef(false);

  const press = useCallback(
    (key: string) => {
      if (busyRef.current) return;
      const next = pressKey(codeRef.current, key);
      codeRef.current = next;
      setNotice(null);
      setCode(next);
      if (next.length !== PIN_LENGTH) return;
      busyRef.current = true;
      setBusy(true);
      onSubmit(next).then((result) => {
        busyRef.current = false;
        setBusy(false);
        if (result === "ok") return;
        codeRef.current = "";
        setCode("");
        setNotice(MESSAGES[result] ?? null);
      });
    },
    [onSubmit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => press(e.key);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const keyClass =
    "flex h-[78px] items-center justify-center bg-[rgba(150,150,150,0.4)] font-condensed text-[38px] leading-none text-[rgba(55,55,55,0.8)] transition-colors hover:bg-[rgba(165,165,165,0.5)] active:bg-[rgba(120,120,120,0.5)] disabled:cursor-default";

  return (
    <div className="flex w-[240px] flex-col items-stretch select-none">
      <h1 className="mb-1.5 text-center font-condensed text-[34px] leading-none tracking-tight text-[rgba(195,195,195,0.95)]">
        MASTER CODE
      </h1>
      <div className="mb-[3px] flex h-[66px] items-center justify-center gap-7 bg-[rgba(30,30,30,0.5)] font-condensed text-[32px] text-[rgba(185,185,185,0.9)]">
        {code.split("").map((_, i) => (
          <span key={i}>*</span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-[3px]">
        {ROWS.flat().map((k) => (
          <button key={k} type="button" className={keyClass} disabled={busy} onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button type="button" className={`${keyClass} col-span-2`} disabled={busy} onClick={() => press("0")}>
          0
        </button>
        <button type="button" className={keyClass} disabled={busy} onClick={() => press("C")}>
          C
        </button>
      </div>
      <p className="mt-3 h-5 text-center text-sm text-zinc-500">{notice}</p>
    </div>
  );
}
