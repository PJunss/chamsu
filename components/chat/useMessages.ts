"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection, getDocs, limit, onSnapshot, orderBy, query, startAfter, where,
  type QueryConstraint, type QueryDocumentSnapshot, type Timestamp,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { applySnapshot, mergeWindow, prependOlder, visibleAfterCleared, type MessageWindow } from "@/lib/messageWindow";

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

/** clearedAt 이 있으면 그 시각 뒤 메시지만 본다. */
function afterCleared(clearedAt: Timestamp | null): QueryConstraint[] {
  return clearedAt ? [where("createdAt", ">", clearedAt)] : [];
}

/**
 * messagesPath 컬렉션의 최근 메시지를 구독한다. cleared 가 ready 가 아니면 구독하지 않는다.
 * clearedAt 이 있으면 실시간 구독은 조건 없이 받아 그 시각 뒤 메시지와 서버 확정 전 메시지만 보이고
 * (조건을 걸면 방금 보낸 메시지가 서버 확정 전까지 빠진다), 지난 메시지 더 보기는 쿼리 조건으로 그 시각에서 멈춘다.
 * 경로나 clearedAt 이 바뀌면 창 상태를 비우고 다시 구독한다.
 */
export function useMessages(messagesPath: string, cleared: { ready: boolean; clearedAt: Timestamp | null }) {
  const { ready, clearedAt } = cleared;
  const viewKey = `${messagesPath}|${ready ? (clearedAt ? `${clearedAt.seconds}.${clearedAt.nanoseconds}` : "all") : "wait"}`;
  const [path, setPath] = useState(viewKey);
  const [win, setWin] = useState(EMPTY);
  const [windowFull, setWindowFull] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [offline, setOffline] = useState(false);
  const snapshots = useRef(new Map<string, QueryDocumentSnapshot>());
  const loading = useRef(false);
  /** 경로가 바뀔 때마다 늘어난다. 이전 방에서 시작한 loadOlder 결과를 버리는 데 쓴다. */
  const generation = useRef(0);

  if (path !== viewKey) {
    setPath(viewKey);
    setWin(EMPTY);
    setWindowFull(false);
    setExhausted(false);
  }

  useEffect(() => {
    generation.current += 1;
    loading.current = false;
    snapshots.current = new Map();
    if (!ready) return;
    const q = query(collection(getClientDb(), messagesPath), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const { items, full } = visibleAfterCleared(
          snap.docs.map((d) => ({
            item: d,
            pending: d.metadata.hasPendingWrites,
            createdAt: (d.data({ serverTimestamps: "estimate" }).createdAt as Timestamp | undefined) ?? null,
          })),
          clearedAt,
          PAGE_SIZE,
        );
        for (const d of items) snapshots.current.set(d.id, d);
        setOffline(snap.metadata.fromCache);
        setWindowFull(full);
        setWin((prev) => applySnapshot(prev, items.map(toMessage).reverse(), full));
      },
      () => setOffline(true),
    );
  }, [messagesPath, ready, clearedAt]);

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
        ...afterCleared(clearedAt),
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
  }, [oldestId, messagesPath, clearedAt]);

  const hasOlder = !exhausted && (windowFull || win.older.length > 0);

  return { messages, loadOlder, hasOlder, offline };
}
