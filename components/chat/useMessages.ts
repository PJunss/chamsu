"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection, getDocs, limit, onSnapshot, orderBy, query, startAfter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";

export const PAGE_SIZE = 50;

export type ChatMessage = { id: string; text: string; nickname: string; uid: string; createdAt: Date | null };

function toMessage(d: QueryDocumentSnapshot): ChatMessage {
  const data = d.data({ serverTimestamps: "estimate" });
  return {
    id: d.id,
    text: data.text,
    nickname: data.nickname,
    uid: data.uid,
    createdAt: data.createdAt?.toDate?.() ?? null,
  };
}

export function useMessages() {
  const [latest, setLatest] = useState<ChatMessage[]>([]);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [offline, setOffline] = useState(false);
  const cursor = useRef<QueryDocumentSnapshot | null>(null);
  const loadedOlder = useRef(false);
  const loading = useRef(false);

  useEffect(() => {
    const q = query(collection(getClientDb(), "messages"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        setOffline(snap.metadata.fromCache);
        setLatest(snap.docs.map(toMessage).reverse());
        if (!loadedOlder.current) {
          cursor.current = snap.docs[snap.docs.length - 1] ?? null;
          setHasOlder(snap.docs.length === PAGE_SIZE);
        }
      },
      () => setOffline(true),
    );
  }, []);

  const loadOlder = useCallback(async () => {
    if (loading.current || !cursor.current) return;
    loading.current = true;
    try {
      const q = query(
        collection(getClientDb(), "messages"),
        orderBy("createdAt", "desc"),
        startAfter(cursor.current),
        limit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      loadedOlder.current = true;
      cursor.current = snap.docs[snap.docs.length - 1] ?? cursor.current;
      setHasOlder(snap.docs.length === PAGE_SIZE);
      setOlder((prev) => [...snap.docs.map(toMessage).reverse(), ...prev]);
    } finally {
      loading.current = false;
    }
  }, []);

  const seen = new Set<string>();
  const messages = [...older, ...latest].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));

  return { messages, loadOlder, hasOlder, offline };
}
