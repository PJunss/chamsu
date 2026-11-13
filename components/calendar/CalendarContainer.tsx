"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DaySheet } from "@/components/calendar/DaySheet";
import { EventDetail } from "@/components/calendar/EventDetail";
import { FilterChips } from "@/components/calendar/FilterChips";
import { MonthHeader } from "@/components/calendar/MonthHeader";
import { MyEventForm } from "@/components/calendar/MyEventForm";
import { UpcomingList } from "@/components/calendar/UpcomingList";
import { MonthGridDesktop } from "@/components/calendar/desktop/MonthGridDesktop";
import { MonthGridMobile } from "@/components/calendar/mobile/MonthGridMobile";
import { useMonthEvents, useRecentOfficial } from "@/components/calendar/useEvents";
import { useFilters } from "@/components/calendar/useFilters";
import { useMyMonthEvents, useMyRecentEvents } from "@/components/calendar/useMyEvents";
import { useNow } from "@/components/calendar/useNow";
import { upcomingVisible, visibleEvents, type CalendarEvent } from "@/lib/calendar/events";
import { addMonths, kstParts, type Ymd } from "@/lib/calendar/kst";

const UPCOMING_COUNT = 5;

/** 캘린더 탭. 지금 시각을 알기 전(서버에서 미리 그릴 때)에는 빈 화면이다. */
export function CalendarContainer() {
  const now = useNow();
  return now ? <CalendarView now={now} /> : null;
}

/**
 * 월 보기와 다가오는 일정. 공식 일정과 내 일정의 구독, 필터, 창(그날 일정·상세·내 일정 추가) 상태는 여기 한 곳에 두고
 * 월 격자만 휴대폰·데스크톱 컴포넌트로 나눈다.
 */
function CalendarView({ now }: { now: Date }) {
  const auth = useAuth();
  const uid = auth.status === "in" ? auth.uid : null;

  const nowParts = kstParts(now);
  const today = useMemo<Ymd>(
    () => ({ year: nowParts.year, month: nowParts.month, day: nowParts.day }),
    [nowParts.year, nowParts.month, nowParts.day],
  );
  /** 보고 있는 달. null 이면 오늘이 든 달이다. */
  const [picked, setPicked] = useState<{ year: number; month: number } | null>(null);
  const { year, month } = picked ?? today;

  const official = useMonthEvents(year, month);
  const mine = useMyMonthEvents(uid, year, month);
  const { on, toggle } = useFilters();
  const visible = useMemo(() => visibleEvents([...official.events, ...mine.events], on), [official.events, mine.events, on]);
  /** "다가오는 일정"은 보고 있는 달과 상관없이 지금부터 고른다. */
  const recentOfficial = useRecentOfficial(now);
  const recentMine = useMyRecentEvents(uid, now);
  const upcoming = useMemo(
    () => upcomingVisible(recentOfficial.events, recentMine.events, on, now, UPCOMING_COUNT),
    [recentOfficial.events, recentMine.events, on, now],
  );

  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const [addFor, setAddFor] = useState<Ymd | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);
  /** 그날 일정 시트를 띄운 날짜. */
  const [dayFor, setDayFor] = useState<Ymd | null>(null);
  const closeAdd = useCallback(() => setAddFor(null), []);
  const closeDay = useCallback(() => setDayFor(null), []);

  const grid = { year, month, today, events: visible, onOpenDay: setDayFor, onOpenEvent: setDetail };

  return (
    <div className="flex min-h-full flex-col md:h-full md:flex-row">
      <div className="flex min-w-0 flex-col px-4 pt-5 md:flex-1 md:overflow-y-auto md:px-6 md:pb-6 md:pt-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <MonthHeader
            year={year}
            month={month}
            onPrev={() => setPicked(addMonths(year, month, -1))}
            onNext={() => setPicked(addMonths(year, month, 1))}
            onToday={() => setPicked(null)}
          />
          <FilterChips on={on} onToggle={toggle} />
        </div>
        <div className="mt-4 md:hidden">
          <MonthGridMobile {...grid} onPickDay={setDayFor} />
        </div>
        <div className="mt-4 hidden min-h-0 flex-1 md:block">
          <MonthGridDesktop {...grid} onPickDay={setAddFor} />
        </div>
      </div>
      <aside className="px-4 pb-6 pt-7 md:w-[320px] md:shrink-0 md:overflow-y-auto md:border-l md:border-zinc-200 md:px-5 md:pt-7">
        <UpcomingList events={upcoming} now={now} ready={recentOfficial.ready && recentMine.ready} onOpen={setDetail} />
      </aside>

      {dayFor && (
        <DaySheet
          ymd={dayFor}
          events={visible}
          now={now}
          onOpenEvent={(e) => {
            setDayFor(null);
            setDetail(e);
          }}
          onAdd={(ymd) => {
            setDayFor(null);
            setAddFor(ymd);
          }}
          onClose={closeDay}
        />
      )}
      {detail && <EventDetail event={detail} now={now} uid={uid} onClose={closeDetail} />}
      {addFor && auth.status !== "loading" && <MyEventForm uid={uid} ymd={addFor} onClose={closeAdd} />}
    </div>
  );
}
