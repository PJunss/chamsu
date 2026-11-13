"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, activeNav, type NavKey } from "@/components/shell/nav";
import { NavIcon } from "@/components/shell/NavIcon";

/** 데스크톱 왼쪽 메뉴의 항목들. active 가 null 이면 현재 항목 표시 없이 그린다. */
function SideItems({ active }: { active: NavKey | null }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((n) => {
        const on = n.key === active;
        return (
          <li key={n.key}>
            <Link
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                on ? "bg-zinc-100 font-bold text-zinc-900" : "text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              <NavIcon name={n.key} size={18} />
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** 휴대폰 아래 탭의 항목들. */
function TabItems({ active }: { active: NavKey | null }) {
  return (
    <ul className="flex h-full">
      {NAV_ITEMS.map((n) => {
        const on = n.key === active;
        return (
          <li key={n.key} className="flex-1">
            <Link
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={`flex h-full flex-col items-center justify-center gap-1 text-[10px] ${
                on ? "font-bold text-zinc-900" : "text-zinc-400"
              }`}
            >
              <NavIcon name={n.key} />
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveSideItems() {
  return <SideItems active={activeNav(usePathname())} />;
}

function ActiveTabItems() {
  return <TabItems active={activeNav(usePathname())} />;
}

/**
 * 모든 탭 화면의 틀. 휴대폰은 본문 아래에 탭 넷, 데스크톱은 왼쪽에 같은 넷을 메뉴로 보인다.
 * 경로를 읽는 부분은 Suspense 로 감싸, 경로를 미리 알 수 없는 화면에서도 틀이 먼저 그려지게 한다.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-white md:flex-row">
      <aside className="hidden w-[200px] shrink-0 flex-col border-r border-zinc-200 p-3 md:flex">
        <p className="px-1 pb-5 pt-3 text-sm font-bold text-zinc-900">이터널리턴 챗봇</p>
        <nav aria-label="메뉴">
          <Suspense fallback={<SideItems active={null} />}>
            <ActiveSideItems />
          </Suspense>
        </nav>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      <nav aria-label="탭" className="h-16 shrink-0 border-t border-zinc-200 md:hidden">
        <Suspense fallback={<TabItems active={null} />}>
          <ActiveTabItems />
        </Suspense>
      </nav>
    </div>
  );
}
