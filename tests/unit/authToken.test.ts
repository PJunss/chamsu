import { describe, expect, test, vi } from "vitest";
import { bearerToken, verifyAdminRequest, verifyRequestUser } from "@/lib/authToken";

const req = (h?: string) => new Request("http://x/api", { headers: h ? { authorization: h } : {} });

describe("bearerToken", () => {
  test("Bearer 토큰만 꺼낸다", () => {
    expect(bearerToken(req("Bearer abc.def"))).toBe("abc.def");
    expect(bearerToken(req("bearer abc"))).toBe("abc");
    expect(bearerToken(req("Basic abc"))).toBeNull();
    expect(bearerToken(req("Bearer "))).toBeNull();
    expect(bearerToken(req())).toBeNull();
  });
});

describe("verifyRequestUser", () => {
  test("확인된 토큰이면 uid", async () => {
    const verify = vi.fn().mockResolvedValue({ uid: "u1" });
    expect(await verifyRequestUser(req("Bearer t"), verify)).toBe("u1");
    expect(verify).toHaveBeenCalledWith("t");
  });
  test("헤더가 없으면 확인하지 않고 null", async () => {
    const verify = vi.fn();
    expect(await verifyRequestUser(req(), verify)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });
  test("확인이 실패하면 null", async () => {
    expect(await verifyRequestUser(req("Bearer t"), () => Promise.reject(new Error("bad")))).toBeNull();
  });
});

describe("verifyAdminRequest", () => {
  test("헤더가 없으면 확인하지 않고 unauthorized", async () => {
    const verify = vi.fn();
    expect(await verifyAdminRequest(req(), verify)).toEqual({ ok: false, error: "unauthorized" });
    expect(verify).not.toHaveBeenCalled();
  });
  test("확인이 실패하면 unauthorized", async () => {
    expect(await verifyAdminRequest(req("Bearer t"), () => Promise.reject(new Error("bad")))).toEqual({
      ok: false,
      error: "unauthorized",
    });
  });
  test("관리자 표시가 없으면 forbidden", async () => {
    const verify = vi.fn().mockResolvedValue({ uid: "u1", admin: false });
    expect(await verifyAdminRequest(req("Bearer t"), verify)).toEqual({ ok: false, error: "forbidden" });
    expect(verify).toHaveBeenCalledWith("t");
  });
  test("관리자 표시가 있으면 uid", async () => {
    const verify = vi.fn().mockResolvedValue({ uid: "u1", admin: true });
    expect(await verifyAdminRequest(req("Bearer t"), verify)).toEqual({ ok: true, uid: "u1" });
  });
});
