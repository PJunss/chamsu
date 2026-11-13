"use client";

import { SeasonBanner } from "@/components/calendar/SeasonBanner";
import { useRecentOfficial } from "@/components/calendar/useEvents";
import { useNow } from "@/components/calendar/useNow";
import { currentAndNextSeason, seasonBannerText } from "@/lib/calendar/season";

/**
 * 홈의 시즌 한 줄. 캘린더와 같은 시즌 띠를 보이고, 누르면 캘린더로 간다.
 * 지금 시즌도 다음 시즌도 없으면 아무것도 그리지 않는다.
 */
export function SeasonStrip() {
  const now = useNow();
  const { events } = useRecentOfficial(now);
  if (!now) return null;
  const { current, next } = currentAndNextSeason(events, now);
  const text = seasonBannerText(current, next, now);
  if (!text) return null;
  return (
    <section aria-label="시즌" className="px-4 md:px-0">
      <SeasonBanner text={text} href="/calendar" />
    </section>
  );
}
