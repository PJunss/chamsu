import { verifyRequestUser } from "@/lib/authToken";
import { readClaudeQuota } from "@/lib/claude/limits";

const NO_STORE = { "cache-control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: NO_STORE });

/** ID 토큰 주인의 지금 봇 사용량. 읽기만 하고 횟수를 세지 않는다. */
export async function GET(req: Request) {
  const uid = await verifyRequestUser(req);
  if (!uid) return fail("unauthorized", 401);
  try {
    return Response.json(await readClaudeQuota(uid, Date.now()), { headers: NO_STORE });
  } catch (e) {
    console.error("claude quota read failed", e instanceof Error ? e.name : "unknown");
    return fail("server_error", 500);
  }
}
