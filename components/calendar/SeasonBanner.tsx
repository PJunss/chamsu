import Link from "next/link";
import type { SeasonColor } from "@/components/calendar/seasonColors";

/** 시즌 시작 표식의 깃발. 색은 글자색을 따른다. */
export function FlagIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d="M5 22V3" fill="none" />
      <path d="M5 3h14l-4 5 4 5H5z" />
    </svg>
  );
}

const BOX = "block w-full rounded-xl px-4 py-3 text-left";

/**
 * 시즌 띠. 첫 줄에 제목, 둘째 줄에 진행 막대(progress 가 null 이면 없음)와 날짜·남은 날을 보인다.
 * color 는 그 시즌의 색 묶음이고 바탕·글자·진행 막대에 쓴다. href 를 주면 그 주소로 가는 링크, 아니면 onOpen 을 부르는 버튼이다.
 */
export function SeasonBanner({
  text,
  color,
  href,
  onOpen,
}: {
  text: { title: string; detail: string; progress: number | null };
  color: SeasonColor;
  href?: string;
  onOpen?: () => void;
}) {
  const box = `${BOX} ${color.soft} ${color.hover}`;
  const percent = text.progress === null ? null : Math.round(text.progress * 100);
  const body = (
    <>
      <span className={`block truncate text-sm font-bold ${color.text}`}>{text.title}</span>
      <span className="mt-1.5 flex items-center gap-2.5">
        {percent !== null && (
          <span
            role="progressbar"
            aria-label="시즌 진행"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className={`h-1.5 w-24 shrink-0 overflow-hidden rounded-full ${color.track}`}
          >
            <span className={`block h-full rounded-full ${color.solid}`} style={{ width: `${percent}%` }} />
          </span>
        )}
        <span className={`truncate text-xs ${color.text}`}>{text.detail}</span>
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={box}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} className={box}>
      {body}
    </button>
  );
}
