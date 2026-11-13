export type NavKey = "home" | "calendar" | "chat" | "settings";

/** 아래 탭(휴대폰)과 왼쪽 메뉴(데스크톱)가 함께 쓰는 항목. needsLogin 인 화면은 로그인 전에 로그인 버튼을 보인다. */
export const NAV_ITEMS: readonly { key: NavKey; label: string; href: string; needsLogin: boolean }[] = [
  { key: "home", label: "홈", href: "/", needsLogin: false },
  { key: "calendar", label: "캘린더", href: "/calendar", needsLogin: false },
  { key: "chat", label: "Chat", href: "/chat", needsLogin: true },
  { key: "settings", label: "설정", href: "/settings", needsLogin: true },
];

/** 경로가 항목의 href 와 같거나 그 아래(`href/…`)면 그 항목이다. 어디에도 들지 않으면 홈. */
export function activeNav(pathname: string): NavKey {
  const hit = NAV_ITEMS.find((n) => n.href !== "/" && (pathname === n.href || pathname.startsWith(`${n.href}/`)));
  return hit ? hit.key : "home";
}
