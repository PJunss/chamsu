import { createSign } from "node:crypto";
import { readServiceAccount, type ServiceAccount } from "@/lib/serviceAccount";

/**
 * Firebase 커스텀 토큰을 서비스 계정 키로 직접 서명한다.
 * firebase-admin/auth 는 ESM 전용 jose 를 require 해서 Vercel 함수에서 불러올 수 없으므로 쓰지 않는다.
 * 형식: https://firebase.google.com/docs/auth/admin/create-custom-tokens#create_custom_tokens_using_a_third-party_jwt_library
 */
const AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
const LIFETIME_SEC = 3600;

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

export function signCustomToken(
  account: Pick<ServiceAccount, "client_email" | "private_key">,
  uid: string,
  claims: Record<string, unknown>,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: account.client_email,
    sub: account.client_email,
    aud: AUDIENCE,
    iat: nowSec,
    exp: nowSec + LIFETIME_SEC,
    uid,
    claims,
  };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(input).sign(account.private_key);
  return `${input}.${b64url(signature)}`;
}

export async function createCustomToken(uid: string, claims: Record<string, unknown>): Promise<string> {
  return signCustomToken(readServiceAccount(), uid, claims);
}
