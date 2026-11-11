import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, inMemoryPersistence, setPersistence, signInWithCustomToken, type Auth, type User } from "firebase/auth";
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

export async function signInWithToken(token: string): Promise<User> {
  const auth = getClientAuth();
  await setPersistence(auth, inMemoryPersistence);
  const cred = await signInWithCustomToken(auth, token);
  return cred.user;
}
