import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeFirestore, ts } from "./helpers/fakeFirestore";

let fake: ReturnType<typeof createFakeFirestore>;

vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => fake.db }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => ts(Date.now()) } }));

type AdminCheck = { ok: true; uid: string } | { ok: false; error: "unauthorized" | "forbidden" };
const verifyAdminRequest = vi.fn<(req: Request) => Promise<AdminCheck>>();
vi.mock("@/lib/authToken", () => ({ verifyAdminRequest: (r: Request) => verifyAdminRequest(r) }));

import { POST } from "@/app/api/admin/events/route";
import { DELETE, PATCH } from "@/app/api/admin/events/[id]/route";

const NOW = Date.UTC(2026, 10, 13, 5, 0);
const START = "2026-11-18T21:00:00.000Z";
const END = "2026-11-19T03:00:00.000Z";

const input = (over: Record<string, unknown> = {}) => ({
  title: "정기 점검", kind: "maintenance", startAt: START, endAt: END, allDay: false, url: "https://example.com/notice/1", note: "", ...over,
});

function req(method: string, body?: unknown) {
  return new Request("http://localhost/api/admin/events", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const events = () => fake.col("events");

function seedEvent(id: string, source: string) {
  events().set(id, {
    title: "시즌 13", kind: "season", startAt: new Date(START), endAt: new Date(END), allDay: false, url: null, note: null,
    source, updatedAt: ts(NOW - 1000),
  });
}

beforeEach(() => {
  fake = createFakeFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  verifyAdminRequest.mockReset().mockResolvedValue({ ok: true, uid: "admin1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("관리자 확인", () => {
  test("토큰이 없으면 401 이고 본문이 틀려도 401 이 먼저다", async () => {
    verifyAdminRequest.mockResolvedValue({ ok: false, error: "unauthorized" });
    seedEvent("e1", "admin");
    const before = { ...events().get("e1") };

    for (const res of [
      await POST(req("POST", input())),
      await POST(req("POST", "{")),
      await PATCH(req("PATCH", input({ title: "바꿈" })), ctx("e1")),
      await DELETE(req("DELETE"), ctx("e1")),
    ]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    expect(events().size).toBe(1);
    expect(events().get("e1")).toEqual(before);
    expect(fake.reads).toEqual([]);
  });
  test("관리자가 아니면 403 이고 아무것도 쓰지 않는다", async () => {
    verifyAdminRequest.mockResolvedValue({ ok: false, error: "forbidden" });
    seedEvent("e1", "admin");
    const before = { ...events().get("e1") };

    for (const res of [
      await POST(req("POST", input())),
      await PATCH(req("PATCH", input({ title: "바꿈" })), ctx("e1")),
      await DELETE(req("DELETE"), ctx("e1")),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
    }
    expect(events().size).toBe(1);
    expect(events().get("e1")).toEqual(before);
    expect(fake.reads).toEqual([]);
  });
});

describe("POST /api/admin/events", () => {
  test("정상이면 source 가 admin 인 문서를 만들고 id 를 준다", async () => {
    const res = await POST(req("POST", input()));
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect(events().get(id)).toEqual({
      title: "정기 점검", kind: "maintenance", startAt: new Date(START), endAt: new Date(END), allDay: false,
      url: "https://example.com/notice/1", note: null, source: "admin", updatedAt: expect.anything(),
    });
    expect(events().size).toBe(1);
  });
  test("종류가 틀리면 400 이고 쓰지 않는다", async () => {
    const res = await POST(req("POST", input({ kind: "x" })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request", field: "kind" });
    expect(events().size).toBe(0);
  });
  test("JSON 이 아니면 400", async () => {
    const res = await POST(req("POST", "{"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request", field: "body" });
  });
});

describe("PATCH /api/admin/events/{id}", () => {
  test("없는 id 는 404", async () => {
    expect((await PATCH(req("PATCH", input()), ctx("nope"))).status).toBe(404);
    expect(events().size).toBe(0);
  });
  test("er-api 문서는 409 이고 내용이 그대로다", async () => {
    seedEvent("season-43", "er-api");
    const before = { ...events().get("season-43") };
    const res = await PATCH(req("PATCH", input({ title: "바꿈" })), ctx("season-43"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "locked" });
    expect(events().get("season-43")).toEqual(before);
  });
  test("정상이면 입력 필드를 고치고 source 는 그대로 둔다", async () => {
    seedEvent("e1", "draft");
    const res = await PATCH(req("PATCH", input({ title: "바꿈", endAt: null })), ctx("e1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(events().get("e1")).toMatchObject({ title: "바꿈", kind: "maintenance", endAt: null, source: "draft" });
    expect((events().get("e1")!.updatedAt as { toMillis: () => number }).toMillis()).toBe(NOW);
  });
  test("입력이 틀리면 400 이고 고치지 않는다", async () => {
    seedEvent("e1", "admin");
    const res = await PATCH(req("PATCH", input({ startAt: "nope" })), ctx("e1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request", field: "start" });
    expect(events().get("e1")).toMatchObject({ title: "시즌 13" });
  });
});

describe("id 검사", () => {
  test("빈 값, 점만 있는 값, 빗금이 든 값, 너무 긴 값은 400 이고 Firestore 를 읽지 않는다", async () => {
    seedEvent("e1", "admin");
    for (const id of ["", ".", "..", "a/b", "__x__", "a".repeat(1501)]) {
      const patched = await PATCH(req("PATCH", input()), ctx(id));
      expect(patched.status).toBe(400);
      expect(await patched.json()).toEqual({ error: "bad_request", field: "id" });
      const deleted = await DELETE(req("DELETE"), ctx(id));
      expect(deleted.status).toBe(400);
      expect(await deleted.json()).toEqual({ error: "bad_request", field: "id" });
    }
    expect(fake.reads).toEqual([]);
    expect(events().size).toBe(1);
  });
});

describe("DELETE /api/admin/events/{id}", () => {
  test("없는 id 는 404", async () => {
    expect((await DELETE(req("DELETE"), ctx("nope"))).status).toBe(404);
  });
  test("er-api 문서는 409 이고 문서가 남는다", async () => {
    seedEvent("season-43", "er-api");
    const res = await DELETE(req("DELETE"), ctx("season-43"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "locked" });
    expect(events().has("season-43")).toBe(true);
  });
  test("정상이면 문서가 없어진다", async () => {
    seedEvent("e1", "admin");
    const res = await DELETE(req("DELETE"), ctx("e1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(events().has("e1")).toBe(false);
  });
});
