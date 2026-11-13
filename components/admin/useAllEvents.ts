"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { toEvent } from "@/components/calendar/toEvent";
import type { CalendarEvent } from "@/lib/calendar/events";
import { getClientDb } from "@/lib/firebaseClient";

const MAX_EVENTS = 200;
const EMPTY: CalendarEvent[] = [];

/** 공식 일정을 시작이 늦은 순으로 200개까지 구독한다. 구독 오류면 빈 목록으로 둔다. */
export function useAllEvents(): { ready: boolean; events: CalendarEvent[] } {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(getClientDb(), "events"), orderBy("startAt", "desc"), limit(MAX_EVENTS)),
      (snap) =>
        setEvents(
          snap.docs.flatMap((d) => {
            const e = toEvent(d.id, d.data(), false);
            return e ? [e] : [];
          }),
        ),
      (e) => {
        console.warn("admin events subscribe failed", e.code);
        setEvents([]);
      },
    );
  }, []);

  return { ready: events !== null, events: events ?? EMPTY };
}
