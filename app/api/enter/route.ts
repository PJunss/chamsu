import { uidForNickname } from "@/lib/uid";
import { consumeAttempt } from "@/lib/attempts";
import { getClientIp } from "@/lib/clientIp";
import { createCustomToken } from "@/lib/customToken";
import { isAllowedNickname } from "@/lib/nicknames";
import { isValidPinFormat, pinMatches } from "@/lib/pin";

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(req: Request) {
  let body: { pin?: unknown; nickname?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", 400);
  }
  const { pin, nickname } = body ?? {};
  if (!isValidPinFormat(pin)) return fail("bad_request", 400);
  if (nickname !== undefined && typeof nickname !== "string") return fail("bad_request", 400);

  try {
    if (!(await consumeAttempt(getClientIp(req.headers)))) return fail("rate_limited", 429);
    if (!pinMatches(pin, process.env.CHAT_PIN)) return fail("wrong_pin", 401);
    if (nickname === undefined) return Response.json({ ok: true });
    if (!isAllowedNickname(nickname, process.env.CHAT_NICKNAMES)) return fail("unknown_nickname", 403);
    const name = nickname.trim();
    const token = await createCustomToken(uidForNickname(name), { member: true, nickname: name });
    return Response.json({ token });
  } catch (e) {
    console.error("enter failed", e);
    return fail("server_error", 500);
  }
}
