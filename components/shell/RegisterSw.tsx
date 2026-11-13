"use client";

import { useEffect } from "react";

/** 서비스 워커(/sw.js)를 등록한다. 아무것도 그리지 않는다. */
export function RegisterSw() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((e: unknown) => {
      console.warn("service worker register failed", e instanceof Error ? e.name : "unknown");
    });
  }, []);
  return null;
}
