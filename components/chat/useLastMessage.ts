"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import type { LastMessage } from "@/lib/lastMessage";
import { visibleAfterCleared } from "@/lib/messageWindow";

/**
 * 그 방의 가장 최근 메시지를 구독한다. /clear 이전 메시지는 없는 것으로 본다.
 * cleared 가 ready 가 아니거나 첫 결과 전이면 ready 가 false 다. 메시지가 없으면 message 가 null 이다.
 */
export function useLastMessage(
  roomId: string,
  cleared: { ready: boolean; clearedAt: Timestamp | null },
): { ready: boolean; message: LastMessage | null } {
  const { ready, clearedAt } = cleared;
  const key = `${roomId}|${ready ? (clearedAt ? `${clearedAt.seconds}.${clearedAt.nanoseconds}` : "all") : "wait"}`;
  const [state, setState] = useState<{ key: string; message: LastMessage | null } | null>(null);

  useEffect(() => {
    if (!ready) return;
    const q = query(collection(getClientDb(), `rooms/${roomId}/messages`), orderBy("createdAt", "desc"), limit(1));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const { items } = visibleAfterCleared(
          snap.docs.map((d) => ({
            item: d,
            pending: d.metadata.hasPendingWrites,
            createdAt: (d.data({ serverTimestamps: "estimate" }).createdAt as Timestamp | undefined) ?? null,
          })),
          clearedAt,
          1,
        );
        const d = items[0];
        if (!d) {
          setState({ key, message: null });
          return;
        }
        const data = d.data({ serverTimestamps: "estimate" });
        setState({
          key,
          message: {
            uid: typeof data.uid === "string" ? data.uid : "",
            text: typeof data.text === "string" ? data.text : "",
            createdAt: data.createdAt?.toDate?.() ?? null,
          },
        });
      },
      () => setState({ key, message: null }),
    );
  }, [roomId, ready, clearedAt, key]);

  return state && state.key === key ? { ready: true, message: state.message } : { ready: false, message: null };
}
