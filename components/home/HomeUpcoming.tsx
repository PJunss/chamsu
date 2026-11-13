"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { EventDetail } from "@/components/calendar/EventDetail";
import { UpcomingRow } from "@/components/calendar/UpcomingList";
import { useUpcomingOfficial } from "@/components/calendar/useEvents";
import { useNow } from "@/components/calendar/useNow";
import type { CalendarEvent } from "@/lib/calendar/events";

const COUNT = 3;

/** 홈의 "다가오는 일정". 끝나지 않은 공식 일정 3건을 보이고, 줄을 누르면 상세를 띄운다. */
export function HomeUpcoming() {
  const now = useNow();
  const { ready, events } = useUpcomingOfficial(COUNT);
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);

  return (
    <section className="px-4 md:px-0">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-bold">다가오는 일정</h2>
        <Link href="/calendar" className="text-xs text-zinc-500">
          캘린더 ›
        </Link>
      </div>
      {now && events.length > 0 && (
        <ul className="divide-y divide-zinc-200">
          {events.map((e) => (
            <li key={e.id}>
              <UpcomingRow event={e} now={now} onOpen={setDetail} />
            </li>
          ))}
        </ul>
      )}
      {ready && events.length === 0 && <p className="mt-3 text-sm text-zinc-500">예정된 일정이 없습니다</p>}
      {now && detail && <EventDetail event={detail} now={now} uid={null} onClose={closeDetail} />}
    </section>
  );
}
