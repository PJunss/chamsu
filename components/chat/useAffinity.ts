"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { affinityByPersona, type AffinityRow } from "@/lib/claude/affinity";

const REFRESH_MS = 60_000;

/**
 * 지금 방에서 내 호감도 문서를 구독해 페르소나 id → 화면 점수(복귀 반영, 버린 정수)를 돌려준다.
 * 첫 스냅샷 전과 구독 오류일 때는 ready 가 false 다. 시간 복귀를 보이려고 1분마다 다시 계산한다.
 * 방이나 uid 가 바뀌면 다시 구독한다.
 */
export function useAffinity(roomId: string, uid: string): { ready: boolean; scores: Record<string, number> } {
  const key = `${roomId}|${uid}`;
  const [shownKey, setShownKey] = useState(key);
  const [rows, setRows] = useState<AffinityRow[]>([]);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  if (shownKey !== key) {
    setShownKey(key);
    setRows([]);
    setReady(false);
  }

  useEffect(() => {
    const q = query(collection(getClientDb(), "affinity"), where("uid", "==", uid), where("roomId", "==", roomId));
    return onSnapshot(
      q,
      (snap) => {
        setNow(Date.now());
        setReady(true);
        setRows(
          snap.docs.flatMap((d) => {
            const x = d.data();
            const updatedAtMs = x.updatedAt?.toMillis?.();
            return typeof x.personaId === "string" && typeof x.score === "number" && typeof updatedAtMs === "number"
              ? [{ personaId: x.personaId, score: x.score, updatedAtMs }]
              : [];
          }),
        );
      },
      (e) => {
        console.error("affinity subscribe failed", e.code);
        setRows([]);
        setReady(false);
      },
    );
  }, [roomId, uid]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const scores = useMemo(() => affinityByPersona(rows, now), [rows, now]);
  return useMemo(() => ({ ready, scores }), [ready, scores]);
}
