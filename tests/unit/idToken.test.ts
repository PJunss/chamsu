import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clearIdTokenKeyCache, verifyIdToken } from "@/lib/idToken";

const PROJECT = "demo-project";
const NOW = Date.UTC(2026, 10, 13, 3, 0);
const SEC = Math.floor(NOW / 1000);

const pair = () => generateKeyPairSync("rsa", { modulusLength: 2048 });
const good = pair();
const other = pair();
const pem = (key: KeyObject) => key.export({ type: "spki", format: "pem" }) as string;
const KEYS: Record<string, string> = { k1: pem(good.publicKey) };

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const claims = (over: Record<string, unknown> = {}) => ({
  aud: PROJECT,
  iss: `https://securetoken.google.com/${PROJECT}`,
  sub: "u1",
  iat: SEC - 10,
  auth_time: SEC - 100,
  exp: SEC + 3600,
  ...over,
});
function sign(payload: unknown, header: Record<string, unknown> = { alg: "RS256", kid: "k1" }, key = good.privateKey) {
  const body = `${b64(header)}.${b64(payload)}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(key).toString("base64url")}`;
}

const fetchKeys = vi.fn(async () => KEYS);
const deps = () => ({ fetchKeys, now: () => NOW, projectId: PROJECT });
const check = (token: string) => verifyIdToken(token, deps());

beforeEach(() => {
  fetchKeys.mockClear();
  clearIdTokenKeyCache();
});
afterEach(() => vi.unstubAllGlobals());

describe("verifyIdToken", () => {
  test("올바른 토큰이면 uid", async () => {
    expect(await check(sign(claims()))).toEqual({ uid: "u1", admin: false });
    expect(fetchKeys).toHaveBeenCalledTimes(1);
  });
  test("payload 의 admin 이 true 일 때만 관리자다", async () => {
    expect(await check(sign(claims({ admin: true })))).toEqual({ uid: "u1", admin: true });
    expect(await check(sign(claims({ admin: "true" })))).toEqual({ uid: "u1", admin: false });
    expect(await check(sign(claims({ admin: 1 })))).toEqual({ uid: "u1", admin: false });
    expect(await check(sign(claims({ admin: false })))).toEqual({ uid: "u1", admin: false });
  });
  test("다른 키로 서명한 토큰은 거부", async () => {
    await expect(check(sign(claims(), undefined, other.privateKey))).rejects.toThrow();
  });
  test("payload 를 바꾼 토큰은 거부", async () => {
    const [h, , s] = sign(claims()).split(".");
    await expect(check(`${h}.${b64(claims({ sub: "admin" }))}.${s}`)).rejects.toThrow();
  });
  test("alg 가 none·HS256 이면 거부", async () => {
    await expect(check(`${b64({ alg: "none", kid: "k1" })}.${b64(claims())}.`)).rejects.toThrow();
    await expect(check(sign(claims(), { alg: "none", kid: "k1" }))).rejects.toThrow();
    await expect(check(sign(claims(), { alg: "HS256", kid: "k1" }))).rejects.toThrow();
  });
  test("모르는 kid 는 키를 한 번 더 받아 보고 거부", async () => {
    await expect(check(sign(claims(), { alg: "RS256", kid: "nope" }))).rejects.toThrow();
    expect(fetchKeys).toHaveBeenCalledTimes(2);
    await expect(check(sign(claims(), { alg: "RS256" }))).rejects.toThrow();
  });
  test("다시 받은 키에 kid 가 있으면 통과", async () => {
    fetchKeys.mockResolvedValueOnce({});
    expect(await check(sign(claims()))).toEqual({ uid: "u1", admin: false });
    expect(fetchKeys).toHaveBeenCalledTimes(2);
  });
  test("aud 가 다르면 거부", async () => {
    await expect(check(sign(claims({ aud: "other-project" })))).rejects.toThrow();
  });
  test("iss 가 다르면 거부", async () => {
    await expect(check(sign(claims({ iss: "https://securetoken.google.com/other-project" })))).rejects.toThrow();
  });
  test("만료된 토큰은 거부", async () => {
    await expect(check(sign(claims({ exp: SEC })))).rejects.toThrow();
    await expect(check(sign(claims({ exp: SEC - 1 })))).rejects.toThrow();
    await expect(check(sign(claims({ exp: "later" })))).rejects.toThrow();
  });
  test("미래의 iat·auth_time 은 거부하되 60초 안쪽은 허용", async () => {
    expect(await check(sign(claims({ iat: SEC + 60, auth_time: SEC + 60 })))).toEqual({ uid: "u1", admin: false });
    await expect(check(sign(claims({ iat: SEC + 61 })))).rejects.toThrow();
    await expect(check(sign(claims({ auth_time: SEC + 61 })))).rejects.toThrow();
    await expect(check(sign(claims({ iat: undefined })))).rejects.toThrow();
  });
  test("sub 가 비었거나 문자열이 아니거나 128자를 넘으면 거부", async () => {
    await expect(check(sign(claims({ sub: "" })))).rejects.toThrow();
    await expect(check(sign(claims({ sub: 3 })))).rejects.toThrow();
    await expect(check(sign(claims({ sub: "a".repeat(129) })))).rejects.toThrow();
    expect(await check(sign(claims({ sub: "a".repeat(128) })))).toEqual({ uid: "a".repeat(128), admin: false });
  });
  test("형식이 틀린 문자열은 거부", async () => {
    for (const bad of ["", "abc", "a.b", "a.b.c.d", "!!.??.**", `${b64([1])}.${b64(claims())}.x`]) {
      await expect(check(bad)).rejects.toThrow();
    }
  });
  test("projectId 가 없으면 거부", async () => {
    await expect(verifyIdToken(sign(claims()), { fetchKeys, now: () => NOW, projectId: "" })).rejects.toThrow();
    expect(fetchKeys).not.toHaveBeenCalled();
  });
});

describe("기본 키 받기", () => {
  const stubFetch = (maxAge: number) => {
    const f = vi.fn(async (url: string) =>
      new Response(url ? JSON.stringify(KEYS) : "", { headers: { "cache-control": `public, max-age=${maxAge}, must-revalidate` } }),
    );
    vi.stubGlobal("fetch", f);
    return f;
  };

  test("max-age 안에는 한 번만 받고, 지나면 다시 받는다", async () => {
    const f = stubFetch(3600);
    let now = NOW;
    const d = { now: () => now, projectId: PROJECT };
    expect(await verifyIdToken(sign(claims()), d)).toEqual({ uid: "u1", admin: false });
    now = NOW + 3_599_000;
    expect(await verifyIdToken(sign(claims({ exp: SEC + 7200 })), d)).toEqual({ uid: "u1", admin: false });
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toBe(
      "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
    );
    now = NOW + 3_600_000;
    expect(await verifyIdToken(sign(claims({ exp: SEC + 7200 })), d)).toEqual({ uid: "u1", admin: false });
    expect(f).toHaveBeenCalledTimes(2);
  });
  test("모르는 kid 면 캐시를 버리고 한 번 더 받는다", async () => {
    const f = stubFetch(3600);
    const d = { now: () => NOW, projectId: PROJECT };
    await verifyIdToken(sign(claims()), d);
    await expect(verifyIdToken(sign(claims(), { alg: "RS256", kid: "nope" }), d)).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(2);
  });
  test("키를 받지 못하면 거부", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 503 })));
    await expect(verifyIdToken(sign(claims()), { now: () => NOW, projectId: PROJECT })).rejects.toThrow();
  });
});
