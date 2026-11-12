import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { CHAIN_HEADER, chainToken, isChainRequest } from "@/lib/claude/chainToken";

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
