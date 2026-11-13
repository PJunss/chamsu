/**
 * 홈 맨 위 배너 자리. 휴대폰은 화면 폭 전체에 높이 200, 데스크톱은 높이 260 에 둥근 모서리다.
 * 배너 이미지(public/home/banner.*)가 생기면 이 컴포넌트에서 그린다. 지금은 옅은 바탕만 보인다.
 */
export function HomeBanner() {
  return <div aria-hidden className="h-[200px] w-full bg-zinc-100 md:h-[260px] md:rounded-xl" />;
}
