import { beforeEach, expect, test, vi } from "vitest";
import type { QuotaStatus } from "@/lib/claude/limits";

const verifyRequestUser = vi.fn<(req: Request) => Promise<string | null>>();
vi.mock("@/lib/authToken", () => ({ verifyRequestUser: (r: Request) => verifyRequestUser(r) }));
const readClaudeQuota = vi.fn<(uid: string, nowMs: number) => Promise<QuotaStatus>>();
vi.mock("@/lib/claude/limits", () => ({ readClaudeQuota: (uid: string, nowMs: number) => readClaudeQuota(uid, nowMs) }));

import { GET } from "@/app/api/claude/quota/route";

const NOW = Date.UTC(2026, 10, 13, 5, 0);
const STATUS: QuotaStatus = { window: { max: 10, used: 3, resetAt: NOW + 400_000 }, day: { max: 100, used: 12 } };
const req = () => new Request("http://localhost/api/claude/quota", { headers: { authorization: "Bearer t" } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  verifyRequestUser.mockReset().mockResolvedValue("u1");
  readClaudeQuota.mockReset().mockResolvedValue(STATUS);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

test("토큰이 없거나 틀리면 401 이고 사용량을 읽지 않는다", async () => {
  verifyRequestUser.mockResolvedValue(null);
  const res = await GET(req());
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
  expect(readClaudeQuota).not.toHaveBeenCalled();
});

test("정상이면 토큰의 uid 로 읽은 값을 그대로 주고 캐시하지 않게 한다", async () => {
  const res = await GET(req());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(STATUS);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(readClaudeQuota).toHaveBeenCalledTimes(1);
  expect(readClaudeQuota).toHaveBeenCalledWith("u1", NOW);
});

test("읽다가 실패하면 500", async () => {
  readClaudeQuota.mockRejectedValue(new Error("MONGODB_URI missing"));
  const res = await GET(req());
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "server_error" });
});
