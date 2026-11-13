"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminEventForm } from "@/components/admin/AdminEventForm";
import { AdminEventList } from "@/components/admin/AdminEventList";
import { removeEvent, syncSeasons } from "@/components/admin/adminApi";
import { useAllEvents } from "@/components/admin/useAllEvents";
import { useIsAdmin } from "@/components/admin/useIsAdmin";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { useNow } from "@/components/calendar/useNow";
import type { CalendarEvent } from "@/lib/calendar/events";
import { kstParts } from "@/lib/calendar/kst";

/**
 * 관리자 화면. 로그인 전이면 로그인 버튼, 관리자 표시를 아직 모르면 빈 화면,
 * 관리자가 아니면 안내와 홈 링크를 보인다.
 */
export function AdminPage() {
  const auth = useAuth();
  const isAdmin = useIsAdmin();
  const now = useNow();

  if (auth.status === "loading") return null;
  if (auth.status === "out") {
    return (
      <div className="h-dvh">
        <LoginPrompt title="관리자" heading="관리자 계정으로 로그인하세요" description={null} />
      </div>
    );
  }
  if (isAdmin === null || now === null) return null;
  if (!isAdmin) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-sm text-zinc-700">관리자만 볼 수 있습니다</p>
        <Link href="/" className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
          홈으로
        </Link>
      </div>
    );
  }
  return <AdminView now={now} />;
}

type Tab = "events" | "drafts";
const TABS: { key: Tab; label: string }[] = [
  { key: "events", label: "일정" },
  { key: "drafts", label: "승인 대기" },
];

function AdminView({ now }: { now: Date }) {
  const { ready, events } = useAllEvents();
  const [tab, setTab] = useState<Tab>("events");
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  /** 폼을 비울 때마다 늘려 폼을 새로 그린다. */
  const [formKey, setFormKey] = useState(0);
  /** 휴대폰에서 폼을 펼쳤는지. 데스크톱은 늘 보인다. */
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  function resetForm() {
    setEditing(null);
    setFormKey((k) => k + 1);
  }

  async function sync() {
    if (syncing) return;
    setSyncing(true);
    setNotice(null);
    const r = await syncSeasons();
    setSyncing(false);
    setNotice(r.ok ? `시즌 ${r.synced}개를 맞췄습니다` : "동기화하지 못했습니다");
  }

  async function remove(e: CalendarEvent) {
    if (!window.confirm(`"${e.title}" 일정을 지울까요?`)) return;
    setNotice(null);
    const r = await removeEvent(e.id);
    if (!r.ok) {
      setNotice("지우지 못했습니다");
      return;
    }
    if (editing?.id === e.id) resetForm();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="flex items-center justify-between gap-3 px-4 pt-5 md:px-8 md:pt-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">관리자</h1>
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900">
            홈 ›
          </Link>
        </div>
        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          className="h-9 rounded-lg border border-zinc-300 px-3 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
        >
          시즌 동기화
        </button>
      </header>
      {notice && (
        <p role="status" className="px-4 pt-2 text-right text-xs text-zinc-500 md:px-8">
          {notice}
        </p>
      )}

      <div role="tablist" aria-label="관리자 메뉴" className="mt-4 flex gap-5 border-b border-zinc-200 px-4 md:px-8">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 pb-2 text-sm ${
              tab === t.key ? "border-zinc-900 font-bold text-zinc-900" : "border-transparent text-zinc-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "drafts" ? (
        <p className="px-4 py-6 text-sm text-zinc-500 md:px-8">공지 자동 초안은 아직 없습니다</p>
      ) : (
        <div className="flex flex-1 flex-col md:flex-row">
          <div className="px-4 pt-4 md:order-last md:w-[380px] md:shrink-0 md:border-l md:border-zinc-200 md:px-6 md:pb-8 md:pt-6">
            <button
              type="button"
              aria-expanded={formOpen}
              onClick={() => setFormOpen((v) => !v)}
              className="h-12 w-full rounded-xl bg-zinc-800 text-sm font-bold text-white md:hidden"
            >
              {formOpen ? "폼 닫기" : "일정 추가"}
            </button>
            <div className={`${formOpen ? "mt-4" : "hidden"} md:mt-0 md:block`}>
              <AdminEventForm
                key={`${editing?.id ?? "new"}-${formKey}`}
                editing={editing}
                today={kstParts(now)}
                onSaved={() => {
                  resetForm();
                  setFormOpen(false);
                  setNotice("저장했습니다");
                }}
                onNew={resetForm}
              />
            </div>
          </div>
          <div className="min-w-0 flex-1 px-4 pb-8 pt-2 md:px-8 md:pt-4">
            {ready && (
              <AdminEventList
                events={events}
                now={now}
                editingId={editing?.id ?? null}
                onEdit={(e) => {
                  setEditing(e);
                  setFormOpen(true);
                }}
                onRemove={remove}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
