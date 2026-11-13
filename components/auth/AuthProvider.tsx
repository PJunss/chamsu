"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getClientAuth } from "@/lib/firebaseClient";
import { ensureUserDoc } from "@/lib/userDoc";

export type AuthState =
  | { status: "loading" }
  | { status: "out" }
  | { status: "in"; uid: string; email: string | null; googleName: string | null };

const errCode = (e: unknown) => (e instanceof Error ? e.name : "unknown");

const AuthContext = createContext<AuthState>({ status: "loading" });

/** 로그인 상태를 구독해 아래 컴포넌트에 준다. 로그인되면 users/{uid} 가 있는지 보고 없으면 만든다. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    return onAuthStateChanged(getClientAuth(), (user) => {
      if (!user) {
        setState({ status: "out" });
        return;
      }
      setState({ status: "in", uid: user.uid, email: user.email, googleName: user.displayName });
      ensureUserDoc(user.uid, user.displayName).catch((e: unknown) => console.warn("user doc create failed", errCode(e)));
    });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
