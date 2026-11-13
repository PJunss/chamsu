"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DISPLAY_NAME_MAX, parseNickname } from "@/lib/displayName";
import { logout } from "@/lib/firebaseClient";
import { saveDisplayName, useDisplayName } from "@/lib/userDoc";

const errName = (e: unknown) => (e instanceof Error ? e.name : "unknown");

/** 로그인했지만 닉네임을 아직 정하지 않은 사용자에게는 앱 대신 닉네임 정하기 화면을 보인다. */
export function NicknameGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.status !== "in") return <>{children}</>;
  return <SignedInGate uid={auth.uid}>{children}</SignedInGate>;
}

function SignedInGate({ uid, children }: { uid: string; children: React.ReactNode }) {
  const nameState = useDisplayName(uid);
  if (nameState.status === "missing") return <NicknameSetup uid={uid} />;
  return <>{children}</>;
}

/** 첫 로그인 때 닉네임을 받는다. 저장하면 유저 문서가 생기고 앱 화면으로 넘어간다. */
function NicknameSetup({ uid }: { uid: string }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const nickname = parseNickname(value);

  async function save() {
    if (busy || !nickname) return;
    setBusy(true);
    setFailed(false);
    try {
      await saveDisplayName(uid, nickname);
    } catch (e) {
      console.warn("nickname save failed", errName(e));
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <main className="flex h-dvh flex-col items-center justify-center bg-white px-8">
      <div className="w-full max-w-[360px]">
        <h1 className="text-xl font-bold text-zinc-900">닉네임을 정해 주세요</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          비앙카와 루치아가 이 이름으로 불러요. 설정에서 언제든 바꿀 수 있어요.
        </p>
        <label htmlFor="nickname" className="mt-6 block text-xs font-bold text-zinc-500">
          닉네임
        </label>
        <input
          id="nickname"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setFailed(false);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") save();
          }}
          maxLength={DISPLAY_NAME_MAX}
          autoFocus
          autoComplete="off"
          placeholder="1~20자"
          className="mt-2 h-12 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || !nickname}
          className="mt-3 h-12 w-full rounded-xl bg-zinc-800 text-sm font-bold text-white disabled:opacity-40"
        >
          시작하기
        </button>
        {failed && <p className="mt-3 text-xs text-red-500">저장하지 못했습니다. 다시 눌러 주세요.</p>}
        <button
          type="button"
          onClick={() => logout().catch((e: unknown) => console.warn("logout failed", errName(e)))}
          className="mt-6 w-full text-center text-xs text-zinc-400 underline"
        >
          다른 계정으로 로그인
        </button>
      </div>
    </main>
  );
}
