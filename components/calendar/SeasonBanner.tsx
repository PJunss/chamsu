import Link from "next/link";

/** 시즌 시작 표식의 깃발. 색은 글자색을 따른다. */
export function FlagIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d="M5 22V3" fill="none" />
      <path d="M5 3h14l-4 5 4 5H5z" />
    </svg>
  );
}

const BOX = "block w-full rounded-xl bg-indigo-50 px-4 py-3 text-left hover:bg-indigo-100";

/**
 * 시즌 띠. 첫 줄에 제목, 둘째 줄에 진행 막대(progress 가 null 이면 없음)와 날짜·남은 날을 보인다.
 * href 를 주면 그 주소로 가는 링크, 아니면 onOpen 을 부르는 버튼이다.
 */
export function SeasonBanner({
  text,
  href,
  onOpen,
}: {
  text: { title: string; detail: string; progress: number | null };
  href?: string;
  onOpen?: () => void;
}) {
  const percent = text.progress === null ? null : Math.round(text.progress * 100);
  const body = (
    <>
      <span className="block truncate text-sm font-bold text-indigo-900">{text.title}</span>
      <span className="mt-1.5 flex items-center gap-2.5">
        {percent !== null && (
          <span
            role="progressbar"
            aria-label="시즌 진행"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-indigo-200"
          >
            <span className="block h-full rounded-full bg-indigo-600" style={{ width: `${percent}%` }} />
          </span>
        )}
        <span className="truncate text-xs text-indigo-800">{text.detail}</span>
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={BOX}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} className={BOX}>
      {body}
    </button>
  );
}
