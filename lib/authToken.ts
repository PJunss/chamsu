import { verifyIdToken } from "@/lib/idToken";

/** Authorization 헤더의 Bearer 토큰. 헤더가 없거나 형식이 다르면 null. */
export function bearerToken(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

/** Authorization: Bearer <ID 토큰> 을 확인해 uid 를 준다. 헤더가 없거나 토큰이 틀리면 null. */
export async function verifyRequestUser(
  req: Request,
  verify: (token: string) => Promise<{ uid: string }> = (t) => verifyIdToken(t),
): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    return (await verify(token)).uid;
  } catch {
    return null;
  }
}

/** 관리자 요청인지 확인한다. 토큰이 없거나 틀리면 "unauthorized", 관리자 표시가 없으면 "forbidden". */
export async function verifyAdminRequest(
  req: Request,
  verify: (token: string) => Promise<{ uid: string; admin: boolean }> = (t) => verifyIdToken(t),
): Promise<{ ok: true; uid: string } | { ok: false; error: "unauthorized" | "forbidden" }> {
  const token = bearerToken(req);
  if (!token) return { ok: false, error: "unauthorized" };
  let user: { uid: string; admin: boolean };
  try {
    user = await verify(token);
  } catch {
    return { ok: false, error: "unauthorized" };
  }
  return user.admin === true ? { ok: true, uid: user.uid } : { ok: false, error: "forbidden" };
}
