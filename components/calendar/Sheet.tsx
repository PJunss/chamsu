"use client";

import { useEffect } from "react";

/**
 * 화면 위에 뜨는 창. 휴대폰은 아래에서 올라오는 시트, 데스크톱은 가운데 창(폭 440)이다.
 * 바깥을 누르거나 X, Esc 로 닫는다. header 는 맨 윗줄 왼쪽에, X 는 오른쪽에 놓인다.
 */
export function Sheet({
  label,
  header,
  onClose,
  children,
}: {
  label: string;
  header: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-5 pb-6 pt-3 md:w-[440px] md:rounded-2xl md:p-6"
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-zinc-300 md:hidden" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">{header}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
