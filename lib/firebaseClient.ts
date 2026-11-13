import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider, browserLocalPersistence, getAuth, setPersistence, signInWithRedirect, signOut, type Auth,
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

/** 구글 로그인 화면으로 넘어간다. 로그인 상태는 이 브라우저에 남는다. 돌아온 뒤의 결과는 AuthProvider 가 받는다. */
export async function startGoogleLogin(): Promise<void> {
  const auth = getClientAuth();
  await setPersistence(auth, browserLocalPersistence);
  await signInWithRedirect(auth, new GoogleAuthProvider());
}

export function logout(): Promise<void> {
  return signOut(getClientAuth());
}
