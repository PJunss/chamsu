"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection, getDocs, limit, onSnapshot, orderBy, query, startAfter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { applySnapshot, mergeWindow, prependOlder, type MessageWindow } from "@/lib/messageWindow";

export const PAGE_SIZE = 50;

export type ChatMessage = {
  id: string;
  text: string;
  nickname: string;
  uid: string;
  createdAt: Date | null;
  /** 봇 답에만 있다. 연쇄 단계와 연쇄를 시작한 사람 uid. */
  chainDepth?: number;
  chainRootUid?: string;
};

function toMessage(d: QueryDocumentSnapshot): ChatMessage {
  const data = d.data({ serverTimestamps: "estimate" });
  return {
    id: d.id,
    text: data.text,
    nickname: data.nickname,
    uid: data.uid,
    createdAt: data.createdAt?.toDate?.() ?? null,
    ...(typeof data.chainDepth === "number" ? { chainDepth: data.chainDepth } : {}),
    ...(typeof data.chainRootUid === "string" ? { chainRootUid: data.chainRootUid } : {}),
  };
}

const EMPTY: MessageWindow<ChatMessage> = { older: [], latest: [] };

/** messagesPath 컬렉션의 최근 메시지를 구독한다. 경로가 바뀌면 창 상태를 비우고 다시 구독한다. */
export function useMessages(messagesPath: string) {
  const [path, setPath] = useState(messagesPath);
  const [win, setWin] = useState(EMPTY);
  const [windowFull, setWindowFull] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [offline, setOffline] = useState(false);
  const snapshots = useRef(new Map<string, QueryDocumentSnapshot>());
  const loading = useRef(false);
  /** 경로가 바뀔 때마다 늘어난다. 이전 방에서 시작한 loadOlder 결과를 버리는 데 쓴다. */
  const generation = useRef(0);

  if (path !== messagesPath) {
    setPath(messagesPath);
    setWin(EMPTY);
    setWindowFull(false);
    setExhausted(false);
  }

  useEffect(() => {
    generation.current += 1;
    loading.current = false;
    snapshots.current = new Map();
    const q = query(collection(getClientDb(), messagesPath), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        for (const d of snap.docs) snapshots.current.set(d.id, d);
        setOffline(snap.metadata.fromCache);
        setWindowFull(snap.docs.length === PAGE_SIZE);
        setWin((prev) => applySnapshot(prev, snap.docs.map(toMessage).reverse()));
      },
      () => setOffline(true),
    );
  }, [messagesPath]);

  const messages = mergeWindow(win);
  const oldestId = messages[0]?.id;

  const loadOlder = useCallback(async () => {
    const cursor = oldestId ? snapshots.current.get(oldestId) : undefined;
    if (loading.current || !cursor) return;
    loading.current = true;
    const gen = generation.current;
    try {
      const q = query(
        collection(getClientDb(), messagesPath),
        orderBy("createdAt", "desc"),
        startAfter(cursor),
        limit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      if (gen !== generation.current) return;
      for (const d of snap.docs) snapshots.current.set(d.id, d);
      if (snap.docs.length < PAGE_SIZE) setExhausted(true);
      setWin((prev) => prependOlder(prev, snap.docs.map(toMessage).reverse()));
    } finally {
      if (gen === generation.current) loading.current = false;
    }
  }, [oldestId, messagesPath]);

  const hasOlder = !exhausted && (windowFull || win.older.length > 0);

  return { messages, loadOlder, hasOlder, offline };
}
