"use client";

import { useMemo } from "react";
import { addDoc, collection, deleteDoc, doc } from "firebase/firestore";
import { useEventDocs } from "@/components/calendar/useEvents";
import { getClientDb } from "@/lib/firebaseClient";
import { remindAtOf, type MyEventInput } from "@/lib/calendar/eventInput";
import { monthQueryRange, overlapsMonth, type CalendarEvent } from "@/lib/calendar/events";

const myEventsPath = (uid: string) => `users/${uid}/events`;

/** 그 달을 그릴 내 일정. uid 가 null(로그인 전)이면 읽지 않고 빈 결과를 준다. */
export function useMyMonthEvents(uid: string | null, year: number, month: number): { ready: boolean; events: CalendarEvent[] } {
  const { from, to } = monthQueryRange(year, month);
  const { ready, events } = useEventDocs(uid === null ? null : myEventsPath(uid), from.getTime(), to.getTime(), true);
  const inMonth = useMemo(() => events.filter((e) => overlapsMonth(e, year, month)), [events, year, month]);
  return { ready, events: inMonth };
}

/** 내 일정을 더한다. 앱에서 넣은 일정이라 via 는 "app" 이고, 알림 보낸 시각(notifiedAt)은 비워 둔다. */
export async function addMyEvent(uid: string, input: MyEventInput): Promise<void> {
  await addDoc(collection(getClientDb(), myEventsPath(uid)), {
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay,
    remindMinutes: input.remindMinutes,
    remindAt: remindAtOf(input.startAt, input.remindMinutes),
    notifiedAt: null,
    via: "app",
  });
}

export async function deleteMyEvent(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(getClientDb(), myEventsPath(uid), id));
}
