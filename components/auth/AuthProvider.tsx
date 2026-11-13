"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getClientAuth } from "@/lib/firebaseClient";

export type AuthState =
  | { status: "loading" }
  | { status: "out" }
  | { status: "in"; uid: string; email: string | null; googleName: string | null };

const AuthContext = createContext<AuthState>({ status: "loading" });

/** 로그인 상태를 구독해 아래 컴포넌트에 준다. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    return onAuthStateChanged(getClientAuth(), (user) => {
      if (!user) {
        setState({ status: "out" });
        return;
      }
      setState({ status: "in", uid: user.uid, email: user.email, googleName: user.displayName });
    });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
