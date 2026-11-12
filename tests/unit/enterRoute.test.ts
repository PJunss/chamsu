import { beforeEach, describe, expect, test, vi } from "vitest";

const consumeAttempt = vi.fn<(ip: string) => Promise<boolean>>();
const createCustomToken = vi.fn<(uid: string, claims: object) => Promise<string>>();

vi.mock("@/lib/attempts", () => ({ consumeAttempt: (ip: string) => consumeAttempt(ip) }));
vi.mock("@/lib/customToken", () => ({
  createCustomToken: (uid: string, c: object) => createCustomToken(uid, c),
}));

import { POST } from "@/app/api/enter/route";
import { uidForNickname } from "@/lib/uid";

function req(body: unknown, ip = "1.2.3.4") {
  return new Request("http://localhost/api/enter", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("CHAT_PIN", "4821");
  vi.stubEnv("CHAT_NICKNAMES", "철수,영희");
  consumeAttempt.mockReset().mockResolvedValue(true);
  createCustomToken.mockReset().mockResolvedValue("tok");
});

describe("POST /api/enter", () => {
  test("JSON 이 아니면 400", async () => expect((await POST(req("{"))).status).toBe(400));
  test("pin 형식이 틀리면 400 이고 시도로 세지 않는다", async () => {
    expect((await POST(req({ pin: "12" }))).status).toBe(400);
    expect(consumeAttempt).not.toHaveBeenCalled();
  });
  test("nickname 이 문자열이 아니면 400", async () =>
    expect((await POST(req({ pin: "4821", nickname: 3 }))).status).toBe(400));
  test("시도 제한에 걸리면 429", async () => {
    consumeAttempt.mockResolvedValue(false);
    expect((await POST(req({ pin: "4821" }))).status).toBe(429);
  });
  test("IP 로 시도를 센다", async () => {
    await POST(req({ pin: "4821" }, "9.9.9.9, 1.1.1.1"));
    expect(consumeAttempt).toHaveBeenCalledWith("9.9.9.9");
  });
  test("pin 이 틀리면 401", async () => {
    const res = await POST(req({ pin: "0000" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "wrong_pin" });
  });
  test("pin 만 맞으면 200 ok, 토큰 없음", async () => {
    const res = await POST(req({ pin: "4821" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(createCustomToken).not.toHaveBeenCalled();
  });
  test("pin 이 틀리면 닉네임이 맞아도 401", async () =>
    expect((await POST(req({ pin: "0000", nickname: "철수" }))).status).toBe(401));
  test("허용되지 않은 닉네임은 403", async () => {
    const res = await POST(req({ pin: "4821", nickname: "민수" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "unknown_nickname" });
  });
  test("둘 다 맞으면 member·nickname claim 토큰", async () => {
    const res = await POST(req({ pin: "4821", nickname: " 철수 " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "tok" });
    const [uid, claims] = createCustomToken.mock.calls[0];
    expect(uid).toBe(uidForNickname("철수"));
    expect(claims).toEqual({ member: true, nickname: "철수" });
  });
  test("CHAT_PIN 이 없으면 401", async () => {
    vi.stubEnv("CHAT_PIN", "");
    expect((await POST(req({ pin: "4821" }))).status).toBe(401);
  });
  test("시도 기록이 실패하면 500", async () => {
    consumeAttempt.mockRejectedValue(new Error("db"));
    expect((await POST(req({ pin: "4821" }))).status).toBe(500);
  });
});

describe("POST /api/enter 봇 닉네임", () => {
  test("허용 목록에 있어도 봇 닉네임으로는 들어올 수 없다", async () => {
    vi.stubEnv("CHAT_NICKNAMES", "철수,비앙카");
    const res = await POST(req({ pin: "4821", nickname: " 비앙카 " }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "unknown_nickname" });
    expect(createCustomToken).not.toHaveBeenCalled();
  });
});
