"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { FilterGroup } from "@/lib/calendar/events";
import { FILTER_STORAGE_KEY, parseFilters, toggleFilter } from "@/lib/calendar/filters";

const listeners = new Set<() => void>();
/** 이 탭에서 쓰는 저장값. undefined 면 아직 localStorage 를 읽지 않은 것이다. */
let stored: string | null | undefined;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function read(): string | null {
  if (stored === undefined) {
    try {
      stored = localStorage.getItem(FILTER_STORAGE_KEY);
    } catch {
      stored = null;
    }
  }
  return stored;
}

function write(on: FilterGroup[]) {
  stored = JSON.stringify(on);
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, stored);
  } catch {
    /** 저장하지 못해도 이 탭에서는 고른 상태를 쓴다. */
  }
  listeners.forEach((l) => l());
}

const serverSnapshot = () => null;

/**
 * 켜진 종류 묶음. 서버에서 미리 그릴 때와 브라우저의 첫 그리기에서는 모두 켠 상태이고,
 * 그 뒤 localStorage 에 둔 값을 따른다. 바꿀 때마다 저장한다.
 */
export function useFilters(): { on: FilterGroup[]; toggle: (key: FilterGroup) => void } {
  const raw = useSyncExternalStore(subscribe, read, serverSnapshot);
  const on = useMemo(() => parseFilters(raw), [raw]);
  const toggle = useCallback((key: FilterGroup) => write(toggleFilter(parseFilters(read()), key)), []);
  return { on, toggle };
}
