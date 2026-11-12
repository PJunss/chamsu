"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { QUESTION_TTL_MS } from "@/lib/claude/constants";
import { findPersonaById, type PersonaInfo } from "@/lib/claude/personas/info";

/** personaId 가 없는 작업 문서는 이 페르소나로 본다. */
const DEFAULT_PERSONA_ID = "bianca";

type Pending = { ms: number | null; personaId: string };

/**
 * jobsPath 에서 2분 안에 만들어진 pending 작업의 페르소나 목록(중복 없음).
 * createdAt 이 아직 없으면 방금 만든 것으로 본다. 경로가 바뀌면 다시 구독한다.
 */
export function useClaudeTyping(jobsPath: string): PersonaInfo[] {
  const [path, setPath] = useState(jobsPath);
  const [pending, setPending] = useState<Pending[]>([]);
  const [now, setNow] = useState(() => Date.now());

  if (path !== jobsPath) {
    setPath(jobsPath);
    setPending([]);
  }

  useEffect(() => {
    const q = query(collection(getClientDb(), jobsPath), where("status", "==", "pending"));
    return onSnapshot(
      q,
      (snap) => {
        setNow(Date.now());
        setPending(
          snap.docs.map((d) => {
            const data = d.data({ serverTimestamps: "estimate" });
            return {
              ms: data.createdAt?.toMillis?.() ?? null,
              personaId: typeof data.personaId === "string" ? data.personaId : DEFAULT_PERSONA_ID,
            };
          }),
        );
      },
      () => setPending([]),
    );
  }, [jobsPath]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  return useMemo(() => {
    const out: PersonaInfo[] = [];
    for (const p of pending) {
      if (p.ms !== null && now - p.ms >= QUESTION_TTL_MS) continue;
      const persona = findPersonaById(p.personaId);
      if (persona && !out.includes(persona)) out.push(persona);
    }
    return out;
  }, [pending, now]);
}
