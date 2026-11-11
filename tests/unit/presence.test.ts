import { expect, test } from "vitest";
import { ONLINE_WINDOW_MS, HEARTBEAT_MS, filterOnline } from "@/lib/presence";

const now = 1_000_000;
test("60초 안만 남기고 닉네임순 정렬", () => {
  const docs = [
    { uid: "b", nickname: "영희", lastSeen: new Date(now - 10_000) },
    { uid: "a", nickname: "철수", lastSeen: new Date(now - 61_000) },
    { uid: "c", nickname: "가람", lastSeen: new Date(now - 59_000) },
    { uid: "d", nickname: "나래", lastSeen: null },
  ];
  expect(filterOnline(docs, now)).toEqual([
    { uid: "c", nickname: "가람" },
    { uid: "d", nickname: "나래" },
    { uid: "b", nickname: "영희" },
  ]);
});
test("상수는 60초·20초", () => {
  expect(ONLINE_WINDOW_MS).toBe(60_000);
  expect(HEARTBEAT_MS).toBe(20_000);
});
