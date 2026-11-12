import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { CHAIN_HEADER, chainOrigin, chainToken, isChainRequest } from "@/lib/claude/chainToken";

const env = { ANTHROPIC_API_KEY: "k" } as unknown as NodeJS.ProcessEnv;
const req = (headers: Record<string, string>) => new Request("http://localhost/api/claude", { method: "POST", headers });

test("토큰은 sha256(chamsu-chain:키) 의 hex 이고 키가 없으면 throw", () => {
  expect(chainToken(env)).toBe(createHash("sha256").update("chamsu-chain:k").digest("hex"));
  expect(() => chainToken({} as unknown as NodeJS.ProcessEnv)).toThrow();
});

test("헤더가 토큰과 같을 때만 연쇄 요청이다", () => {
  expect(isChainRequest(req({ [CHAIN_HEADER]: chainToken(env) }), env)).toBe(true);
  expect(isChainRequest(req({ [CHAIN_HEADER]: chainToken(env).slice(1) + "0" }), env)).toBe(false);
  expect(isChainRequest(req({ [CHAIN_HEADER]: "short" }), env)).toBe(false);
  expect(isChainRequest(req({}), env)).toBe(false);
  expect(isChainRequest(req({ [CHAIN_HEADER]: chainToken(env) }), {} as NodeJS.ProcessEnv)).toBe(false);
});

test("연쇄 origin: 운영은 운영 주소, 로컬 개발은 요청 origin, 그 밖은 null", () => {
  const e = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;
  const url = "http://evil.example:8080/api/claude";
  expect(chainOrigin(e({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "chamsu.vercel.app", NODE_ENV: "production" }), url)).toBe(
    "https://chamsu.vercel.app",
  );
  expect(chainOrigin(e({ VERCEL_ENV: "production", NODE_ENV: "production" }), url)).toBeNull();
  expect(chainOrigin(e({ NODE_ENV: "development" }), "http://localhost:3122/api/claude")).toBe("http://localhost:3122");
  expect(chainOrigin(e({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "chamsu.vercel.app", NODE_ENV: "production" }), url)).toBeNull();
  expect(chainOrigin(e({ NODE_ENV: "production" }), url)).toBeNull();
  expect(chainOrigin(e({ NODE_ENV: "test" }), url)).toBeNull();
});
