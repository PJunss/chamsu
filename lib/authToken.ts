import { getAdminAuth } from "@/lib/firebaseAdmin";

/** Authorization 헤더의 Bearer 토큰. 헤더가 없거나 형식이 다르면 null. */
export function bearerToken(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

/** Authorization: Bearer <ID 토큰> 을 확인해 uid 를 준다. 헤더가 없거나 토큰이 틀리면 null. */
export async function verifyRequestUser(
  req: Request,
  verify: (token: string) => Promise<{ uid: string }> = (t) => getAdminAuth().verifyIdToken(t),
): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    return (await verify(token)).uid;
  } catch {
    return null;
  }
}
