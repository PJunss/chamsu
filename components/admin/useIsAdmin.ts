"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getClientAuth } from "@/lib/firebaseClient";

/**
 * 로그인한 계정의 ID 토큰에 admin 표시가 있는지. 아직 모르면 null, 로그인 전이면 false.
 * 화면을 가리는 데만 쓴다. 관리자 API 는 서버에서 토큰을 다시 확인한다.
 */
export function useIsAdmin(): boolean | null {
  const auth = useAuth();
  const uid = auth.status === "in" ? auth.uid : null;
  const [result, setResult] = useState<{ uid: string; admin: boolean } | null>(null);

  useEffect(() => {
    if (uid === null) return;
    let cancelled = false;
    const user = getClientAuth().currentUser;
    const pending = user && user.uid === uid ? user.getIdTokenResult().then((r) => r.claims.admin === true) : Promise.resolve(false);
    pending
      .catch((e: unknown) => {
        console.warn("admin check failed", e instanceof Error ? e.name : "unknown");
        return false;
      })
      .then((admin) => {
        if (!cancelled) setResult({ uid, admin });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (auth.status === "loading") return null;
  if (uid === null) return false;
  return result?.uid === uid ? result.admin : null;
}
