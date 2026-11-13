"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { toEvent } from "@/components/calendar/toEvent";
import { useNow } from "@/components/calendar/useNow";
import { getClientDb } from "@/lib/firebaseClient";
import { QUERY_BACK_DAYS, monthQueryRange, overlapsMonth, upcomingEvents, type CalendarEvent } from "@/lib/calendar/events";

const DAY_MS = 86_400_000;
const EMPTY: CalendarEvent[] = [];

/**
 * 일정 컬렉션에서 startAt 이 [fromMs, toMs) 인 문서를 시작 순으로 구독한다. toMs 가 null 이면 끝을 두지 않는다.
 * path 가 null 이면 읽지 않고 빈 결과를 준다. fromMs 가 null 이면 아직 읽을 범위를 모르는 것이라 ready 가 false 다.
 * 구독 오류면 빈 결과로 둔다.
 */
export function useEventDocs(
  path: string | null,
  fromMs: number | null,
  toMs: number | null,
  mine: boolean,
): { ready: boolean; events: CalendarEvent[] } {
  const key = path === null || fromMs === null ? null : `${path}|${fromMs}|${toMs ?? ""}`;
  const [state, setState] = useState<{ key: string; events: CalendarEvent[] } | null>(null);

  useEffect(() => {
    if (key === null || path === null || fromMs === null) return;
    const range = [where("startAt", ">=", new Date(fromMs))];
    if (toMs !== null) range.push(where("startAt", "<", new Date(toMs)));
    return onSnapshot(
      query(collection(getClientDb(), path), ...range, orderBy("startAt")),
      (snap) => {
        const events = snap.docs.flatMap((d) => {
          const e = toEvent(d.id, d.data(), mine);
          return e ? [e] : [];
        });
        setState({ key, events });
      },
      (e) => {
        console.warn("events subscribe failed", e.code);
        setState({ key, events: [] });
      },
    );
  }, [key, path, fromMs, toMs, mine]);

  if (path === null) return { ready: true, events: EMPTY };
  if (key === null || state?.key !== key) return { ready: false, events: EMPTY };
  return { ready: true, events: state.events };
}

/** 그 달을 그릴 공식 일정(D-14 범위로 읽고 그 달에 걸치는 것만). 로그인 없이 읽는다. */
export function useMonthEvents(year: number, month: number): { ready: boolean; events: CalendarEvent[] } {
  const { from, to } = monthQueryRange(year, month);
  const { ready, events } = useEventDocs("events", from.getTime(), to.getTime(), false);
  const inMonth = useMemo(() => events.filter((e) => overlapsMonth(e, year, month)), [events, year, month]);
  return { ready, events: inMonth };
}

/**
 * 끝나지 않은 일정을 찾으려고 읽을 startAt 의 시작(ms). 이미 시작한 일정(진행 중인 시즌 등)을 잡으려고 QUERY_BACK_DAYS 일을 거슬러 간다.
 * 날 단위로 내려, 분이 바뀔 때마다 다시 구독하지 않게 한다. 지금 시각을 모르면 null.
 */
export function upcomingFromMs(now: Date | null): number | null {
  return now === null ? null : (Math.floor(now.getTime() / DAY_MS) - QUERY_BACK_DAYS) * DAY_MS;
}

/** 지금부터 n 개(끝나지 않은 공식 일정). 지금 시각을 알기 전에는 ready 가 false 다. */
export function useUpcomingOfficial(n: number): { ready: boolean; events: CalendarEvent[] } {
  const now = useNow();
  const { ready, events } = useEventDocs("events", upcomingFromMs(now), null, false);
  const upcoming = useMemo(() => (now === null ? EMPTY : upcomingEvents(events, now, n)), [events, now, n]);
  return { ready, events: upcoming };
}
