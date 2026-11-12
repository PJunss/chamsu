import { createHash, timingSafeEqual } from "node:crypto";

export const CHAIN_HEADER = "x-chamsu-chain";

/** 서버가 자기 /api/claude 로 연쇄를 이을 때 붙이는 토큰. ANTHROPIC_API_KEY 에서 만들고, 키가 없으면 throw 한다. */
export function chainToken(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  return createHash("sha256").update(`chamsu-chain:${key}`).digest("hex");
}

/** 요청의 연쇄 헤더가 토큰과 같은지 시간 일정 비교로 본다. 헤더나 키가 없으면 false. */
export function isChainRequest(req: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const got = req.headers.get(CHAIN_HEADER);
  if (!got) return false;
  let expected: string;
  try {
    expected = chainToken(env);
  } catch {
    return false;
  }
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
