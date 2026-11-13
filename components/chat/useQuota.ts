"use client";

import { useCallback, useEffect, useState } from "react";
import { getClientAuth } from "@/lib/firebaseClient";
import type { QuotaStatus } from "@/lib/claude/limits";
import { quotaExhausted, quotaText } from "@/lib/claude/quotaText";

type Window = QuotaStatus["window"];

/** 남은 분 표시를 줄이려고 지금 시각을 다시 읽는 간격. */
const NOW_REFRESH_MS = 30_000;
/** 풀리는 시각이 지난 뒤 다시 읽을 때까지 두는 여유. */
const RESET_SLACK_MS = 1_000;
/** 이 기기 시계로는 풀리는 시각이 이미 지났을 때, 다시 읽기를 잇달아 부르지 않게 두는 최소 간격. */
const MIN_REREAD_MS = 5_000;

/** 내 ID 토큰을 붙여 한도를 읽는다. 읽지 못하면 null. */
async function fetchWindow(): Promise<Window> {
  try {
    const token = await getClientAuth().currentUser?.getIdToken();
    if (!token) return null;
    const res = await fetch("/api/claude/quota", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<QuotaStatus> | null;
    const w = body?.window;
    if (!w || typeof w.max !== "number" || typeof w.used !== "number") return null;
    return { max: w.max, used: w.used, resetAt: typeof w.resetAt === "number" ? w.resetAt : null };
  } catch (e) {
    console.warn("quota read failed", e instanceof Error ? e.name : "unknown");
    return null;
  }
}

/**
 * 채팅방 입력창 위에 보일 내 10분 한도 한 줄. roomKey 가 바뀌거나 refresh() 를 부르면 다시 읽고,
 * 풀리는 시각이 지나면 한 번 더 읽는다. 읽지 못했거나 제한이 꺼져 있으면 text 는 null 이다.
 * exhausted 는 한도를 다 써서 풀리기를 기다리는 중인지다.
 */
export function useQuota(roomKey: string): { text: string | null; exhausted: boolean; refresh: () => void } {
  const [result, setResult] = useState<{ key: string; window: Window; at: number } | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    void fetchWindow().then((window) => {
      if (cancelled) return;
      const at = Date.now();
      setResult({ key: roomKey, window, at });
      setNowMs(at);
    });
    return () => {
      cancelled = true;
    };
  }, [roomKey, tick]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), NOW_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const resetAt = result?.window?.resetAt ?? null;
  useEffect(() => {
    if (resetAt === null) return;
    const t = setTimeout(refresh, Math.max(resetAt + RESET_SLACK_MS - Date.now(), MIN_REREAD_MS));
    return () => clearTimeout(t);
  }, [resetAt, result?.at, refresh]);

  if (!result || result.key !== roomKey || nowMs === null) return { text: null, exhausted: false, refresh };
  return { text: quotaText(result.window, nowMs), exhausted: quotaExhausted(result.window, nowMs), refresh };
}
