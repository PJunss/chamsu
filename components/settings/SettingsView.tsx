"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { DISPLAY_NAME_MAX, shownDisplayName } from "@/lib/displayName";
import { logout } from "@/lib/firebaseClient";
import { saveDisplayName, useDisplayName } from "@/lib/userDoc";

/** 설정 탭. 로그인 전이면 로그인 버튼을 보이고, 로그인 상태를 아직 모르면 빈 화면이다. */
export function SettingsView() {
  const auth = useAuth();
  if (auth.status === "loading") return null;
  if (auth.status === "out") return <LoginPrompt title="설정" />;
  return <SignedInSettings uid={auth.uid} email={auth.email} googleName={auth.googleName} />;
}

const errName = (e: unknown) => (e instanceof Error ? e.name : "unknown");

function SignedInSettings({ uid, email, googleName }: { uid: string; email: string | null; googleName: string | null }) {
  const nameState = useDisplayName(uid);
  const loading = nameState.status === "loading";
  /** 유저 문서가 없으면 구글 표시 이름을 보이고, 저장을 누르면 그 이름으로 문서를 만든다. */
  const shown = shownDisplayName(nameState, googleName);
  /** 입력 중인 이름. null 이면 저장된 이름을 그대로 보인다. */
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"saved" | "failed" | null>(null);
  const name = draft ?? shown ?? "";

  async function save() {
    if (busy || loading || !name.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      await saveDisplayName(uid, name);
      setDraft(null);
      setNotice("saved");
    } catch (e) {
      console.warn("display name save failed", errName(e));
      setNotice("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col px-4 pb-6 pt-5 md:max-w-[640px] md:px-10 md:pt-6">
      <h1 className="text-2xl font-bold">설정</h1>

      <section className="mt-5">
        <h2 className="text-xs font-bold text-zinc-500">계정</h2>
        <div className="mt-3 flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-900"
          >
            {[...(shown ?? "")][0] ?? ""}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-zinc-900">{email ?? ""}</p>
            <p className="text-xs text-zinc-400">Google 계정</p>
          </div>
          <button
            type="button"
            onClick={() => logout().catch((e: unknown) => console.warn("logout failed", errName(e)))}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            로그아웃
          </button>
        </div>
      </section>

      <section className="mt-7">
        <h2 className="text-xs font-bold text-zinc-500">
          <label htmlFor="display-name">이름</label>
        </h2>
        <div className="mt-3 flex gap-2">
          <input
            id="display-name"
            value={name}
            onChange={(e) => {
              setDraft(e.target.value);
              setNotice(null);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter") save();
            }}
            maxLength={DISPLAY_NAME_MAX}
            disabled={loading}
            className="h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy || loading || !name.trim() || (nameState.status === "ready" && name === nameState.name)}
            className="h-11 rounded-md bg-zinc-800 px-4 text-sm font-bold text-white disabled:opacity-40"
          >
            저장
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-400">비앙카와 루치아가 이 이름으로 불러요</p>
        {notice === "saved" && <p className="mt-1 text-xs text-zinc-500">저장했어요</p>}
        {notice === "failed" && <p className="mt-1 text-xs text-red-500">저장하지 못했습니다</p>}
      </section>

      <p className="mt-auto pt-10 text-center text-xs text-zinc-400 md:text-left">님블뉴런의 공식 서비스가 아닙니다</p>
    </div>
  );
}
