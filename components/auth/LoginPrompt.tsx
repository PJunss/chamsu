"use client";

import { useState } from "react";
import { PERSONAS } from "@/lib/claude/personas/info";
import { isLoginCancelled, startGoogleLogin } from "@/lib/firebaseClient";

/** 로그인이 필요한 화면의 로그인 전 모습. title 을 주면 휴대폰에서 화면 제목을 위에 보인다. */
export function LoginPrompt({ title }: { title?: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function login() {
    setBusy(true);
    setFailed(false);
    try {
      await startGoogleLogin();
    } catch (e) {
      if (!isLoginCancelled(e)) {
        console.warn("google login failed", e instanceof Error ? e.name : "unknown");
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {title && <h1 className="px-4 pb-3 pt-5 text-2xl font-bold md:hidden">{title}</h1>}
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-10 text-center">
        <div className="flex">
          {PERSONAS.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={p.avatar}
              alt={p.nickname}
              width={64}
              height={64}
              className={`h-16 w-16 rounded-full border-2 border-white object-cover ${i > 0 ? "-ml-3" : ""}`}
            />
          ))}
        </div>
        <h2 className="mt-5 text-lg font-bold text-zinc-900">로그인하고 대화를 시작하세요</h2>
        <p className="mt-2 max-w-[340px] text-sm leading-6 text-zinc-500">
          {PERSONAS.map((p) => p.nickname).join(", ")}와 1:1 로 대화할 수 있어요.
        </p>
        <button
          type="button"
          onClick={login}
          disabled={busy}
          className="mt-6 flex h-12 w-full max-w-[360px] items-center justify-center gap-2.5 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-900 hover:bg-zinc-50 disabled:opacity-40"
        >
          <span aria-hidden className="text-base font-bold text-blue-500">
            G
          </span>
          Google 계정으로 로그인
        </button>
        {failed && <p className="mt-3 text-xs text-red-500">로그인하지 못했습니다. 다시 눌러 주세요.</p>}
        <p className="mt-6 text-xs text-zinc-400">캘린더는 로그인 없이 볼 수 있어요</p>
      </div>
    </div>
  );
}
