import { beforeEach, expect, test } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { createFakeFirestore, ts } from "./helpers/fakeFirestore";
import { isClearCommand } from "@/lib/claude/clear";
import { clearRoom } from "@/lib/claude/clearRoom";
import { dmRoomId, resolveRoom } from "@/lib/claude/rooms";

const OWNER = "n_" + "0123456789abcdef".repeat(2);
const OTHER = "n_" + "fedcba9876543210".repeat(2);
const dm = resolveRoom(dmRoomId("bianca", OWNER))!;
const otherDm = resolveRoom(dmRoomId("bianca", OTHER))!;
const main = resolveRoom("main")!;

test("1:1 방 주인의 /clear 만 지우기 명령이다", () => {
  expect(isClearCommand(dm, { uid: OWNER, text: "/clear" })).toBe(true);
  expect(isClearCommand(dm, { uid: OWNER, text: "  /clear \n" })).toBe(true);
  expect(isClearCommand(dm, { uid: OWNER, text: "/clear 해줘" })).toBe(false);
  expect(isClearCommand(dm, { uid: OWNER, text: "/CLEAR" })).toBe(false);
  expect(isClearCommand(dm, { uid: OTHER, text: "/clear" })).toBe(false);
  expect(isClearCommand(dm, { uid: OWNER, text: 3 })).toBe(false);
  expect(isClearCommand(main, { uid: OWNER, text: "/clear" })).toBe(false);
});

let fake: ReturnType<typeof createFakeFirestore>;
beforeEach(() => {
  fake = createFakeFirestore();
});

test("그 방의 메시지·작업·기억·기억 상태·호감도만 지우고 다른 방은 남긴다", async () => {
  for (const r of [dm, otherDm, main]) {
    fake.col(r.messagesPath).set("m1", { uid: OWNER, text: "x", createdAt: ts(1) });
    fake.col(r.messagesPath).set("m2", { uid: "bot_bianca", text: "y", createdAt: ts(2) });
    fake.col(r.jobsPath).set("m1_bianca", { status: "done" });
    fake.col("memories").set(`${r.id}_m1`, { roomId: r.id, text: "x" });
    fake.col("memoryState").set(r.id, { lastJudgedAt: ts(1) });
    fake.col("affinity").set(`${r.id}_bianca_${OWNER}`, { roomId: r.id, uid: OWNER, score: 70 });
  }
  const counts = await clearRoom(fake.db as unknown as Firestore, dm);
  expect(counts).toEqual({ messages: 2, jobs: 1, memories: 1, affinity: 1 });
  expect(fake.col(dm.messagesPath).size).toBe(0);
  expect(fake.col(dm.jobsPath).size).toBe(0);
  expect(fake.col("memories").has(`${dm.id}_m1`)).toBe(false);
  expect(fake.col("memoryState").has(dm.id)).toBe(false);
  expect(fake.col("affinity").has(`${dm.id}_bianca_${OWNER}`)).toBe(false);
  for (const r of [otherDm, main]) {
    expect(fake.col(r.messagesPath).size).toBe(2);
    expect(fake.col(r.jobsPath).size).toBe(1);
    expect(fake.col("memories").has(`${r.id}_m1`)).toBe(true);
    expect(fake.col("memoryState").has(r.id)).toBe(true);
    expect(fake.col("affinity").has(`${r.id}_bianca_${OWNER}`)).toBe(true);
  }
});

test("500개가 넘어도 모두 지운다", async () => {
  for (let i = 0; i < 1203; i++) fake.col(dm.messagesPath).set(`m${i}`, { uid: OWNER, text: "x", createdAt: ts(i) });
  const counts = await clearRoom(fake.db as unknown as Firestore, dm);
  expect(counts.messages).toBe(1203);
  expect(fake.col(dm.messagesPath).size).toBe(0);
});

test("빈 방도 지울 수 있다", async () => {
  expect(await clearRoom(fake.db as unknown as Firestore, dm)).toEqual({ messages: 0, jobs: 0, memories: 0, affinity: 0 });
});
