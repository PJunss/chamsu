"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { cleanDisplayName, type DisplayNameState } from "@/lib/displayName";

const userRef = (uid: string) => doc(getClientDb(), "users", uid);

/** 닉네임을 저장한다. 문서가 있으면 displayName 만 고치고, 없으면(첫 로그인) 그 이름으로 만든다. */
export async function saveDisplayName(uid: string, name: string): Promise<void> {
  const ref = userRef(uid);
  const displayName = cleanDisplayName(name);
  if ((await getDoc(ref)).exists()) await updateDoc(ref, { displayName });
  else await setDoc(ref, { displayName, createdAt: serverTimestamp() });
}

const LOADING: DisplayNameState = { status: "loading" };

/**
 * users/{uid} 의 displayName 을 구독한다. 첫 결과 전에는 loading 이다.
 * 문서가 없다는 결과는 서버에서 온 것만 missing 으로 본다(캐시만 본 결과는 loading 으로 둔다).
 * 읽지 못하면 error 다.
 */
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
      { includeMetadataChanges: true },
      (snap) => {
        const v = snap.data()?.displayName;
        if (typeof v === "string" && v) setState({ status: "ready", name: v });
        else setState(snap.metadata.fromCache ? LOADING : { status: "missing" });
      },
      (e) => {
        console.warn("user doc subscribe failed", e.code);
        setState({ status: "error" });
      },
    );
  }, [uid]);

  return state;
}
