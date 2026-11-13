"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { cleanDisplayName } from "@/lib/displayName";

const userRef = (uid: string) => doc(getClientDb(), "users", uid);

/** users/{uid} 가 없으면 구글 표시 이름으로 만든다. 있으면 건드리지 않는다. */
export async function ensureUserDoc(uid: string, googleName: string | null): Promise<void> {
  const ref = userRef(uid);
  if ((await getDoc(ref)).exists()) return;
  await setDoc(ref, { displayName: cleanDisplayName(googleName), createdAt: serverTimestamp() });
}

export function saveDisplayName(uid: string, name: string): Promise<void> {
  return updateDoc(userRef(uid), { displayName: cleanDisplayName(name) });
}

/** users/{uid} 의 displayName 을 구독한다. uid 가 없거나 아직 모르면(로딩·문서 없음·오류) null. */
export function useDisplayName(uid: string | null): string | null {
  const [shownUid, setShownUid] = useState(uid);
  const [name, setName] = useState<string | null>(null);

  if (shownUid !== uid) {
    setShownUid(uid);
    setName(null);
  }

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      userRef(uid),
      (snap) => {
        const v = snap.data()?.displayName;
        setName(typeof v === "string" && v ? v : null);
      },
      (e) => {
        console.warn("user doc subscribe failed", e.code);
        setName(null);
      },
    );
  }, [uid]);

  return name;
}
