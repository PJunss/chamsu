import { beforeEach, expect, test } from "vitest";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { createFakeFirestore } from "./helpers/fakeFirestore";
import { affinityBand, affinityDelta, affinityDocId, effectiveAffinity } from "@/lib/claude/affinity";
import { applyAffinity, readAffinity } from "@/lib/claude/affinityStore";
import { AFFINITY_DECAY_PER_DAY, AFFINITY_DEFAULT, AFFINITY_MAX_DELTA } from "@/lib/claude/constants";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 12, 3, 0);

test("상수", () => {
  expect(AFFINITY_DEFAULT).toBe(50);
  expect(AFFINITY_DECAY_PER_DAY).toBe(2);
  expect(AFFINITY_MAX_DELTA).toBe(5);
});

test("시간 복귀: 하루 2씩 50 쪽으로, 50 을 넘지 않는다", () => {
  expect(effectiveAffinity(80, T0, T0 + 1.5 * DAY)).toBeCloseTo(77);
  expect(effectiveAffinity(20, T0, T0 + 1.5 * DAY)).toBeCloseTo(23);
  expect(effectiveAffinity(51, T0, T0 + 1.5 * DAY)).toBe(50);
  expect(effectiveAffinity(49, T0, T0 + 10 * DAY)).toBe(50);
  expect(effectiveAffinity(50, T0, T0 + 10 * DAY)).toBe(50);
  expect(effectiveAffinity(70, T0, T0)).toBe(70);
  expect(effectiveAffinity(70, T0, T0 - DAY)).toBe(70);
});

test("변화량: round(5 × (호의 − 적대)), −5~+5", () => {
  expect(affinityDelta(1, 0)).toBe(5);
  expect(affinityDelta(0, 1)).toBe(-5);
  expect(affinityDelta(0.8, 0)).toBe(4);
  expect(affinityDelta(0.7, 0)).toBe(4);
  expect(affinityDelta(0.69, 0)).toBe(3);
  expect(affinityDelta(0, 0.42)).toBe(-2);
  expect(affinityDelta(0.05, 0.02)).toBe(0);
  expect(Object.is(affinityDelta(0, 0.05), 0)).toBe(true);
  expect(affinityDelta(0.5, 0.5)).toBe(0);
});

test("구간 경계: 20/21, 40/41, 60/61, 80/81", () => {
  expect([0, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(affinityBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  expect(affinityBand(20.4)).toBe(0);
  expect(affinityBand(20.5)).toBe(1);
});

test("문서 id 는 방·페르소나·uid 로 나뉜다", () => {
  expect(affinityDocId("main", "bianca", "n_a")).toBe("main_bianca_n_a");
  expect(affinityDocId("dm_bianca_n_a", "bianca", "n_a")).toBe("dm_bianca_n_a_bianca_n_a");
});

let fake: ReturnType<typeof createFakeFirestore>;
const db = () => fake.db as unknown as Firestore;
const key = { roomId: "main", personaId: "bianca", uid: "n_a" };
beforeEach(() => {
  fake = createFakeFirestore();
});

test("문서가 없으면 50 으로 읽고, 쓰지 않는다", async () => {
  expect(await readAffinity(db(), { ...key, now: T0 })).toBe(50);
  expect(fake.col("affinity").size).toBe(0);
});

test("문서가 없으면 50 에 delta 를 더해 저장한다", async () => {
  expect(await applyAffinity(db(), { ...key, delta: 4, now: T0 })).toBe(54);
  expect(fake.col("affinity").get("main_bianca_n_a")).toEqual({
    ...key, score: 54, updatedAt: Timestamp.fromMillis(T0),
  });
});

test("복귀를 반영한 값에 delta 를 더하고 0~100 으로 자른다", async () => {
  fake.col("affinity").set("main_bianca_n_a", { ...key, score: 80, updatedAt: Timestamp.fromMillis(T0) });
  expect(await readAffinity(db(), { ...key, now: T0 + 1.5 * DAY })).toBe(77);
  expect(await applyAffinity(db(), { ...key, delta: -5, now: T0 + 1.5 * DAY })).toBe(72);

  fake.col("affinity").set("main_bianca_n_a", { ...key, score: 98, updatedAt: Timestamp.fromMillis(T0) });
  expect(await applyAffinity(db(), { ...key, delta: 5, now: T0 })).toBe(100);
  fake.col("affinity").set("main_bianca_n_a", { ...key, score: 2, updatedAt: Timestamp.fromMillis(T0) });
  expect(await applyAffinity(db(), { ...key, delta: -5, now: T0 })).toBe(0);
  expect(fake.col("affinity").get("main_bianca_n_a")?.score).toBe(0);
});
