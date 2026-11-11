"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { QUESTION_TTL_MS } from "@/lib/claude/constants";

/** claudeJobs 에 2분 안에 만들어진 pending 작업이 하나라도 있으면 true. createdAt 이 아직 없으면 방금 만든 것으로 본다. */
export function useClaudeTyping(): boolean {
  const [pending, setPending] = useState<(number | null)[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const q = query(collection(getClientDb(), "claudeJobs"), where("status", "==", "pending"));
    return onSnapshot(
      q,
      (snap) => {
        setNow(Date.now());
        setPending(
          snap.docs.map((d) => {
            const created = d.data({ serverTimestamps: "estimate" }).createdAt;
            return created?.toMillis?.() ?? null;
          }),
        );
      },
      () => setPending([]),
    );
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  return pending.some((ms) => ms === null || now - ms < QUESTION_TTL_MS);
}
