import { beforeEach, expect, test, vi } from "vitest";
import { createFakeFirestore, ts } from "./helpers/fakeFirestore";
import type { SeasonRow } from "@/lib/er/client";

let fake: ReturnType<typeof createFakeFirestore>;

vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => fake.db }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => ts(Date.now()) } }));

type AdminCheck = { ok: true; uid: string } | { ok: false; error: "unauthorized" | "forbidden" };
const verifyAdminRequest = vi.fn<(req: Request) => Promise<AdminCheck>>();
vi.mock("@/lib/authToken", () => ({ verifyAdminRequest: (r: Request) => verifyAdminRequest(r) }));
const fetchSeasons = vi.fn<() => Promise<SeasonRow[]>>();
vi.mock("@/lib/er/client", () => ({ fetchSeasons: () => fetchSeasons() }));

import { POST } from "@/app/api/admin/season-sync/route";

const NOW = Date.UTC(2026, 10, 13, 5, 0);
const ROWS: SeasonRow[] = [
  { seasonID: 42, seasonName: "Pre-Season22", seasonStart: "2026-11-12 12:00:00", seasonEnd: "2026-11-19 12:00:00", isCurrent: 1 },
  { seasonID: 43, seasonName: "Season22", seasonStart: "2026-11-19 12:00:00", seasonEnd: "2027-02-18 09:00:00", isCurrent: 0 },
];
const req = () => new Request("http://localhost/api/admin/season-sync", { method: "POST" });
const events = () => fake.col("events");

beforeEach(() => {
  fake = createFakeFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  verifyAdminRequest.mockReset().mockResolvedValue({ ok: true, uid: "admin1" });
  fetchSeasons.mockReset().mockResolvedValue(ROWS);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

test("토큰이 없으면 401, 관리자가 아니면 403 이고 ER API 를 부르지도 쓰지도 않는다", async () => {
  verifyAdminRequest.mockResolvedValue({ ok: false, error: "unauthorized" });
  expect((await POST(req())).status).toBe(401);
  verifyAdminRequest.mockResolvedValue({ ok: false, error: "forbidden" });
  expect((await POST(req())).status).toBe(403);
  expect(fetchSeasons).not.toHaveBeenCalled();
  expect(events().size).toBe(0);
});

test("시즌 행마다 events/season-{id} 를 er-api 출처로 만든다", async () => {
  const res = await POST(req());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ synced: 2 });
  expect([...events().keys()].sort()).toEqual(["season-42", "season-43"]);
  expect(events().get("season-43")).toEqual({
    title: "시즌 13", kind: "season",
    startAt: new Date("2026-11-19T03:00:00.000Z"), endAt: new Date("2027-02-18T00:00:00.000Z"),
    allDay: false, url: null, note: null, source: "er-api", updatedAt: expect.anything(),
  });
  expect(events().get("season-42")).toMatchObject({ title: "시즌 13 프리시즌", source: "er-api" });
});

test("다시 돌려도 문서 수가 그대로이고, 바뀐 날짜는 덮어쓴다", async () => {
  await POST(req());
  fetchSeasons.mockResolvedValue([ROWS[0], { ...ROWS[1], seasonEnd: "2027-02-25 09:00:00" }]);
  const res = await POST(req());
  expect(await res.json()).toEqual({ synced: 2 });
  expect(events().size).toBe(2);
  expect(events().get("season-43")).toMatchObject({ endAt: new Date("2027-02-25T00:00:00.000Z") });
});

test("관리자가 넣은 일정은 건드리지 않는다", async () => {
  const mine = { title: "정기 점검", kind: "maintenance", source: "admin", startAt: new Date(NOW), updatedAt: ts(NOW - 1000) };
  events().set("e1", mine);
  await POST(req());
  expect(events().size).toBe(3);
  expect(events().get("e1")).toEqual(mine);
});

test("ER API 가 실패하면 502 이고 쓰지 않는다", async () => {
  fetchSeasons.mockRejectedValue(new Error("er_api_failed"));
  const res = await POST(req());
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: "er_api_failed" });
  expect(events().size).toBe(0);
});
