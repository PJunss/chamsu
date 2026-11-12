import { beforeEach, expect, test } from "vitest";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { createFakeFirestore } from "./helpers/fakeFirestore";
import { affinityBand, affinityDelta, affinityDocId, displayAffinity, effectiveAffinity } from "@/lib/claude/affinity";
import { applyAffinity, readAffinity } from "@/lib/claude/affinityStore";
import * as constants from "@/lib/claude/constants";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 12, 3, 0);

test("상수", () => {
  expect(constants.AFFINITY_DEFAULT).toBe(50);
  expect(constants.AFFINITY_DECAY_PER_DAY).toBe(0.5);
  expect(constants.AFFINITY_GAIN).toBe(1.0);
  expect(constants.AFFINITY_LOSS).toBe(1.5);
  expect("AFFINITY_MAX_DELTA" in constants).toBe(false);
});

test("시간 복귀: 하루 0.5씩 50 쪽으로, 50 을 넘지 않는다", () => {
  expect(effectiveAffinity(80, T0, T0 + 1.5 * DAY)).toBeCloseTo(79.25);
  expect(effectiveAffinity(20, T0, T0 + 1.5 * DAY)).toBeCloseTo(20.75);
  expect(effectiveAffinity(50.5, T0, T0 + 1.5 * DAY)).toBe(50);
  expect(effectiveAffinity(49.6, T0, T0 + 10 * DAY)).toBe(50);
  expect(effectiveAffinity(50, T0, T0 + 10 * DAY)).toBe(50);
  expect(effectiveAffinity(70, T0, T0)).toBe(70);
  expect(effectiveAffinity(70, T0, T0 - DAY)).toBe(70);
});

test("변화량: 오르기는 현재 값에 비례해 어렵고, 내리기는 1.5배. 반올림하지 않는다", () => {
  expect(affinityDelta(50, 0.98, 0)).toBeCloseTo(0.49, 10);
  expect(affinityDelta(80, 0.98, 0)).toBeCloseTo(0.196, 10);
  expect(affinityDelta(50, 0, 0.97)).toBeCloseTo(-1.455, 10);
  expect(affinityDelta(100, 1, 0)).toBe(0);
  expect(affinityDelta(50, 0.97, 0.02)).toBeCloseTo(0.455, 10);
});

test("화면·구간은 소수점을 버린 정수: 49.6 은 49, 60.99 는 41~60 구간", () => {
  expect(displayAffinity(49.6)).toBe(49);
  expect(affinityBand(49.6)).toBe(2);
  expect(displayAffinity(60.99)).toBe(60);
  expect(affinityBand(60.99)).toBe(2);
  expect(affinityBand(20.99)).toBe(0);
  expect([0, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(affinityBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
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

test("문서가 없으면 50 에서 계산한 소수 값을 그대로 저장한다", async () => {
  const r = await applyAffinity(db(), { ...key, pos: 0.98, neg: 0, now: T0 });
  expect(r.score).toBeCloseTo(50.49, 10);
  expect(r.delta).toBeCloseTo(0.49, 10);
  expect(fake.col("affinity").get("main_bianca_n_a")).toEqual({
    ...key, score: r.score, updatedAt: Timestamp.fromMillis(T0),
  });
});

test("소수가 누적되고, 화면에는 버린 정수로 보인다", async () => {
  fake.col("affinity").set("main_bianca_n_a", { ...key, score: 51, updatedAt: Timestamp.fromMillis(T0) });
  const r = await applyAffinity(db(), { ...key, pos: 0, neg: 0.94, now: T0 });
  expect(r.score).toBeCloseTo(49.59, 10);
  expect(displayAffinity(r.score)).toBe(49);
  expect(affinityBand(r.score)).toBe(2);
});

test("복귀를 반영한 값에서 계산하고 0~100 으로 자른다", async () => {
  fake.col("affinity").set("main_bianca_n_a", { ...key, score: 80, updatedAt: Timestamp.fromMillis(T0) });
  expect(await readAffinity(db(), { ...key, now: T0 + 2 * DAY })).toBe(79);
  expect((await applyAffinity(db(), { ...key, pos: 0.98, neg: 0, now: T0 + 2 * DAY })).score).toBeCloseTo(79 + 0.98 * 0.21, 10);

  fake.col("affinity").set("main_bianca_n_a", { ...key, score: 1, updatedAt: Timestamp.fromMillis(T0) });
  const low = await applyAffinity(db(), { ...key, pos: 0, neg: 1, now: T0 });
  expect(low.score).toBe(0);
  expect(low.delta).toBe(-1);
  expect(fake.col("affinity").get("main_bianca_n_a")?.score).toBe(0);
});
