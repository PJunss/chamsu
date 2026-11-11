"use client";

import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { HEARTBEAT_MS, filterOnline, type OnlineUser } from "@/lib/presence";

type Raw = { uid: string; nickname: string; lastSeen: Date | null };

export function usePresence(uid: string, nickname: string): OnlineUser[] {
  const [raw, setRaw] = useState<Raw[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const db = getClientDb();
    const ref = doc(db, "presence", uid);
    const beat = () => setDoc(ref, { nickname, lastSeen: serverTimestamp() }).catch(() => {});
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    const leave = () => {
      deleteDoc(ref).catch(() => {});
    };
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [uid, nickname]);

  useEffect(() => {
    return onSnapshot(collection(getClientDb(), "presence"), (snap) =>
      setRaw(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: "estimate" });
          return { uid: d.id, nickname: data.nickname, lastSeen: data.lastSeen?.toDate?.() ?? null };
        }),
      ),
    );
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  return filterOnline(raw, now);
}
