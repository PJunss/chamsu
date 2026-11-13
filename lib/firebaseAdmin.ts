import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readServiceAccount } from "@/lib/serviceAccount";

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const account = readServiceAccount();
  return initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key,
    }),
  });
}

export const getAdminDb = () => getFirestore(adminApp());
