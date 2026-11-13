function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

const ARROW = "flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100";

/**
 * 보고 있는 달 이름과 이전·다음 달, "오늘" 버튼.
 * 휴대폰은 달 이름이 왼쪽, 버튼이 오른쪽 끝(이전·오늘·다음)이고, 데스크톱은 달 이름 옆에 이전·다음·오늘 순서다.
 */
export function MonthHeader({
  year,
  month,
  onPrev,
  onNext,
  onToday,
}: {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 md:justify-start md:gap-4">
      <h1 className="text-2xl font-bold">
        {year}년 {month}월
      </h1>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onPrev} aria-label="이전 달" className={ARROW}>
          <Chevron dir="prev" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="mx-1 h-8 rounded-md border border-zinc-300 px-2.5 text-xs text-zinc-700 hover:bg-zinc-50 md:order-last md:ml-2"
        >
          오늘
        </button>
        <button type="button" onClick={onNext} aria-label="다음 달" className={ARROW}>
          <Chevron dir="next" />
        </button>
      </div>
    </div>
  );
}
