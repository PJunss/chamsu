"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { cleanDisplayName, type DisplayNameState } from "@/lib/displayName";

const userRef = (uid: string) => doc(getClientDb(), "users", uid);

/** users/{uid} 가 없으면 구글 표시 이름으로 만든다. 있으면 건드리지 않는다. */
export async function ensureUserDoc(uid: string, googleName: string | null): Promise<void> {
  const ref = userRef(uid);
  if ((await getDoc(ref)).exists()) return;
  await setDoc(ref, { displayName: cleanDisplayName(googleName), createdAt: serverTimestamp() });
}

/** 이름을 저장한다. 문서가 있으면 displayName 만 고치고, 없으면 그 이름으로 만든다. */
export async function saveDisplayName(uid: string, name: string): Promise<void> {
  const ref = userRef(uid);
  const displayName = cleanDisplayName(name);
  if ((await getDoc(ref)).exists()) await updateDoc(ref, { displayName });
  else await setDoc(ref, { displayName, createdAt: serverTimestamp() });
}

const LOADING: DisplayNameState = { status: "loading" };
const MISSING: DisplayNameState = { status: "missing" };

/** users/{uid} 의 displayName 을 구독한다. 첫 스냅샷 전에는 loading, 문서가 없거나 읽지 못하면 missing 이다. */
export function useDisplayName(uid: string): DisplayNameState {
  const [shownUid, setShownUid] = useState(uid);
  const [state, setState] = useState<DisplayNameState>(LOADING);

  if (shownUid !== uid) {
    setShownUid(uid);
    setState(LOADING);
  }

  useEffect(() => {
    return onSnapshot(
      userRef(uid),
      (snap) => {
        const v = snap.data()?.displayName;
        setState(typeof v === "string" && v ? { status: "ready", name: v } : MISSING);
      },
      (e) => {
        console.warn("user doc subscribe failed", e.code);
        setState(MISSING);
      },
    );
  }, [uid]);

  return state;
}
