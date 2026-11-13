import { ChatbotCards } from "@/components/home/ChatbotCards";
import { HomeBanner } from "@/components/home/HomeBanner";
import { HomeUpcoming } from "@/components/home/HomeUpcoming";
import { SeasonStrip } from "@/components/home/SeasonStrip";

/** 홈: 배너, 지금 시즌 한 줄, 다가오는 일정, 챗봇 카드. 데스크톱은 시즌·일정이 왼쪽 열, 챗봇 카드가 오른쪽 열(폭 400)이다. */
export default function HomePage() {
  return (
    <div className="flex flex-col gap-6 pb-6 md:gap-8 md:p-6">
      <HomeBanner />
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <div className="flex min-w-0 flex-col gap-6 md:flex-1">
          <SeasonStrip />
          <HomeUpcoming />
        </div>
        <div className="md:w-[400px] md:shrink-0">
          <ChatbotCards />
        </div>
      </div>
    </div>
  );
}
