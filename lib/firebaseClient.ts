import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider, browserLocalPersistence, getAuth, setPersistence, signInWithPopup, signOut, type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

function clientApp(): FirebaseApp {
  return (
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  );
}

export const getClientAuth = (): Auth => getAuth(clientApp());
export const getClientDb = (): Firestore => getFirestore(clientApp());

/** 구글 로그인 팝업을 띄운다. 로그인 상태는 이 브라우저에 남고, 바뀐 상태는 AuthProvider 가 받는다. */
export async function startGoogleLogin(): Promise<void> {
  const auth = getClientAuth();
  await setPersistence(auth, browserLocalPersistence);
  await signInWithPopup(auth, new GoogleAuthProvider());
}

/** 사용자가 팝업을 닫았거나 팝업을 다시 띄워 앞의 것이 취소된 경우. 실패로 알리지 않는다. */
export function isLoginCancelled(e: unknown): boolean {
  const code = typeof e === "object" && e !== null && "code" in e ? (e as { code: unknown }).code : null;
  return code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
}

export function logout(): Promise<void> {
  return signOut(getClientAuth());
}
