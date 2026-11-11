import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT 가 없습니다");
  const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  return initializeApp({ credential: cert(json) });
}

export const getAdminAuth = () => getAuth(adminApp());
export const getAdminDb = () => getFirestore(adminApp());
