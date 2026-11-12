"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";

export type ClearedAtState = { ready: boolean; clearedAt: Timestamp | null };

const NO_ROOM_DOC: ClearedAtState = { ready: true, clearedAt: null };
const WAITING: ClearedAtState = { ready: false, clearedAt: null };

/**
 * 1:1 방 문서(rooms/{roomId})를 구독해 /clear 한 시각을 돌려준다. roomDocPath 가 null(단체방)이면 구독하지 않고 바로 ready 다.
 * 첫 스냅샷 전에는 ready 가 false 다. 방 문서가 없거나 읽지 못하면 clearedAt 은 null(조건 없이 본다).
 * 값이 같으면 같은 객체를 유지해 이 값에 걸린 구독이 다시 시작되지 않게 한다.
 */
export function useClearedAt(roomDocPath: string | null): ClearedAtState {
  const [path, setPath] = useState(roomDocPath);
  const [state, setState] = useState<ClearedAtState>(roomDocPath ? WAITING : NO_ROOM_DOC);

  if (path !== roomDocPath) {
    setPath(roomDocPath);
    setState(roomDocPath ? WAITING : NO_ROOM_DOC);
  }

  useEffect(() => {
    if (!roomDocPath) return;
    const apply = (clearedAt: Timestamp | null) =>
      setState((prev) =>
        prev.ready && (prev.clearedAt === clearedAt || (prev.clearedAt && clearedAt && prev.clearedAt.isEqual(clearedAt)))
          ? prev
          : { ready: true, clearedAt },
      );
    return onSnapshot(
      doc(getClientDb(), roomDocPath),
      (snap) => {
        const v = snap.data()?.clearedAt;
        apply(v && typeof v.toMillis === "function" ? (v as Timestamp) : null);
      },
      (e) => {
        console.error("room doc subscribe failed", e.code);
        apply(null);
      },
    );
  }, [roomDocPath]);

  return state;
}
