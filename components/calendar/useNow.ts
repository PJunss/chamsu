"use client";

import { useMemo, useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;

function subscribe(onChange: () => void) {
  const t = setInterval(onChange, 30_000);
  return () => clearInterval(t);
}

const currentMinute = () => Math.floor(Date.now() / MINUTE_MS);
const unknown = () => null;

/**
 * 지금 시각(분 단위로 내림). 분이 바뀌면 다시 그린다.
 * 서버에서 미리 그릴 때와 브라우저의 첫 그리기에서는 null 이다. 지금 시각은 브라우저에서만 읽는다.
 */
export function useNow(): Date | null {
  const minute = useSyncExternalStore(subscribe, currentMinute, unknown);
  return useMemo(() => (minute === null ? null : new Date(minute * MINUTE_MS)), [minute]);
}
