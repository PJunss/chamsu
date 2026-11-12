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
  expect(constants.AFFINITY_GAIN_COOLDOWN_MS).toBe(600_000);
  expect(constants.AFFINITY_NOISE).toBe(0.1);
  expect(constants.AFFINITY_NEG_MIN).toBe(0.55);
  expect(constants.AFFINITY_GAIN_MIN).toBe(0.5);
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
  expect(affinityDelta(50, 0.98, 0, null, T0)).toBeCloseTo(0.49, 10);
  expect(affinityDelta(80, 0.98, 0, null, T0)).toBeCloseTo(0.196, 10);
  expect(affinityDelta(50, 0, 0.97, null, T0)).toBeCloseTo(-1.455, 10);
  expect(affinityDelta(100, 1, 0, null, T0)).toBe(0);
  expect(affinityDelta(50, 0.97, 0.2, null, T0)).toBeCloseTo(0.485, 10);
  expect(affinityDelta(50, 0.97, 0.6, null, T0)).toBeCloseTo(0.485 - 0.9, 10);
  expect(affinityDelta(50, 0, 0.54, null, T0)).toBe(0);
  expect(affinityDelta(50, 0, 0.83, null, T0)).toBeCloseTo(-1.245, 10);
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
    ...key, score: r.score, updatedAt: Timestamp.fromMillis(T0), lastGainAt: Timestamp.fromMillis(T0),
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

test("화면 점수: 페르소나별로 복귀를 반영해 버린 정수, 문서가 없으면 50", async () => {
  const { affinityByPersona, shownAffinity } = await import("@/lib/claude/affinity");
  const scores = affinityByPersona(
    [
      { personaId: "bianca", score: 49.6, updatedAtMs: T0 },
      { personaId: "lucia", score: 80, updatedAtMs: T0 - 2 * DAY },
    ],
    T0,
  );
  expect(scores).toEqual({ bianca: 49, lucia: 79 });
  expect(shownAffinity(scores, "bianca")).toBe(49);
  expect(shownAffinity(scores, "nobody")).toBe(50);
  expect(affinityByPersona([], T0)).toEqual({});
});

const MIN = 60_000;

test("오른 뒤 10분 안에는 호의 몫이 0 이고 적대 몫은 그대로 뺀다", () => {
  expect(affinityDelta(50, 0.98, 0, T0, T0 + 10 * MIN - 1000)).toBe(0);
  expect(affinityDelta(50, 0.98, 0.97, T0, T0 + 10 * MIN - 1000)).toBeCloseTo(-1.455, 10);
  expect(affinityDelta(50, 0.98, 0, T0, T0 + 10 * MIN)).toBeCloseTo(0.49, 10);
});

test("몰아 보낸 칭찬은 10분에 한 번만 오르고, 오르지 않으면 lastGainAt 을 유지한다", async () => {
  const first = await applyAffinity(db(), { ...key, pos: 0.98, neg: 0, now: T0 });
  expect(first.delta).toBeCloseTo(0.49, 10);
  const soon = await applyAffinity(db(), { ...key, pos: 0.98, neg: 0, now: T0 + 10 * MIN - 1000 });
  expect(soon.delta).toBe(0);
  expect(fake.col("affinity").get("main_bianca_n_a")?.lastGainAt).toEqual(Timestamp.fromMillis(T0));
  const insult = await applyAffinity(db(), { ...key, pos: 0, neg: 0.97, now: T0 + 5 * MIN });
  expect(insult.delta).toBeCloseTo(-1.455, 10);
  expect(fake.col("affinity").get("main_bianca_n_a")?.lastGainAt).toEqual(Timestamp.fromMillis(T0));
  const later = await applyAffinity(db(), { ...key, pos: 0.98, neg: 0, now: T0 + 10 * MIN });
  expect(later.delta).toBeGreaterThan(0);
  expect(fake.col("affinity").get("main_bianca_n_a")?.lastGainAt).toEqual(Timestamp.fromMillis(T0 + 10 * MIN));
});

test("처음부터 내려가면 lastGainAt 은 null 이다", async () => {
  await applyAffinity(db(), { ...key, pos: 0, neg: 0.5, now: T0 });
  expect(fake.col("affinity").get("main_bianca_n_a")?.lastGainAt).toBeNull();
});

test("호의·적대 점수는 0~1 로 잘라 쓴다", () => {
  expect(affinityDelta(50, 3, 0, null, T0)).toBe(affinityDelta(50, 1, 0, null, T0));
  expect(affinityDelta(50, -0.5, 0, null, T0)).toBe(0);
  expect(affinityDelta(50, 0, 2, null, T0)).toBe(affinityDelta(50, 0, 1, null, T0));
  expect(affinityDelta(50, 0, -1, null, T0)).toBe(0);
});

test("0.1 미만 점수는 잡음으로 0 이다", () => {
  expect(affinityDelta(50, 0.07, 0.01, null, T0)).toBe(0);
  expect(affinityDelta(50, 0.09, 0, null, T0)).toBe(0);
  expect(affinityDelta(50, 0.1, 0, null, T0)).toBeCloseTo(0.05, 10);
  expect(affinityDelta(50, 0.97, 0.02, null, T0)).toBeCloseTo(0.485, 10);
});

test("실제 사례: 반가워는 변화 없음, 15초 뒤 멋지네는 오르고 간격을 시작한다", async () => {
  fake.col("affinity").set("main_bianca_n_a", { ...key, score: 50, updatedAt: Timestamp.fromMillis(T0 - DAY), lastGainAt: null });
  const hello = await applyAffinity(db(), { ...key, pos: 0.07, neg: 0.01, now: T0 });
  expect(hello.delta).toBe(0);
  expect(fake.col("affinity").get("main_bianca_n_a")?.lastGainAt).toBeNull();
  const nice = await applyAffinity(db(), { ...key, pos: 0.97, neg: 0.02, now: T0 + 15_000 });
  expect(nice.delta).toBeCloseTo(0.485, 10);
  expect(fake.col("affinity").get("main_bianca_n_a")?.lastGainAt).toEqual(Timestamp.fromMillis(T0 + 15_000));
});

test("약한 호의(0.3)는 오르지만 간격을 시작하지 않아, 바로 뒤 강한 호의도 오른다", async () => {
  const weak = await applyAffinity(db(), { ...key, pos: 0.3, neg: 0, now: T0 });
  expect(weak.delta).toBeCloseTo(0.15, 10);
  expect(fake.col("affinity").get("main_bianca_n_a")?.lastGainAt).toBeNull();
  const strong = await applyAffinity(db(), { ...key, pos: 0.97, neg: 0, now: T0 + 15_000 });
  expect(strong.delta).toBeGreaterThan(0.4);
  expect(fake.col("affinity").get("main_bianca_n_a")?.lastGainAt).toEqual(Timestamp.fromMillis(T0 + 15_000));
});

test("startsGainCooldown: 호의 0.5 이상이고 실제로 올랐을 때만", async () => {
  const { startsGainCooldown } = await import("@/lib/claude/affinity");
  expect(startsGainCooldown(0.5, 0.1)).toBe(true);
  expect(startsGainCooldown(0.49, 0.1)).toBe(false);
  expect(startsGainCooldown(0.97, 0)).toBe(false);
  expect(startsGainCooldown(0.97, -1)).toBe(false);
});

test("웃음 표시가 있으면 적대 점수를 절반으로 보되, 가드레일에 걸린 메시지는 줄이지 않는다", async () => {
  const { affinityNeg, hasLaugh } = await import("@/lib/claude/affinity");
  expect(hasLaugh("ㅋㅋ 바보야")).toBe(true);
  expect(hasLaugh("바보야 ㅎㅎ")).toBe(true);
  expect(hasLaugh("뒤질래?")).toBe(false);
  expect(affinityNeg(0.8, "ㅋㅋ 바보야", false)).toBeCloseTo(0.4, 10);
  expect(affinityNeg(0.64, "뒤질래?", false)).toBe(0.64);
  expect(affinityNeg(0.9, "ㅋㅋ 병신아", true)).toBe(0.9);
  expect(affinityDelta(50, 0, affinityNeg(0.8, "ㅋㅋ 바보야", false), null, T0)).toBe(0);
  expect(affinityDelta(50, 0, affinityNeg(0.64, "뒤질래?", false), null, T0)).toBeCloseTo(-0.96, 10);
});
