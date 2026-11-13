import { ChatbotCards } from "@/components/home/ChatbotCards";
import { HomeBanner } from "@/components/home/HomeBanner";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6 pb-6 md:gap-8 md:p-6">
      <HomeBanner />
      <ChatbotCards />
    </div>
  );
}
