import { createPublicKey, verify } from "node:crypto";

/** 서버 전용. Firebase ID 토큰을 Google 공개 인증서로 직접 확인한다. 토큰과 키 내용은 로그에 남기지 않는다. */

const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
/** iat·auth_time 에 허용하는 시계 오차(초). */
const CLOCK_SKEW_SEC = 60;
const MAX_UID_LENGTH = 128;

export type IdTokenDeps = {
  /** kid → PEM(X.509 인증서 또는 공개키). 기본값은 Google securetoken 인증서를 받아 Cache-Control max-age 동안 메모리에 둔다. */
  fetchKeys?: () => Promise<Record<string, string>>;
  /** ms, 기본 Date.now */
  now?: () => number;
  /** 기본 process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID */
  projectId?: string;
};

let cache: { keys: Record<string, string>; expiresAt: number } | null = null;

/** 메모리에 둔 인증서를 버린다. */
export function clearIdTokenKeyCache(): void {
  cache = null;
}

async function fetchGoogleKeys(now: () => number): Promise<Record<string, string>> {
  if (cache && now() < cache.expiresAt) return cache.keys;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error("id_token_keys_unavailable");
  const keys = (await res.json()) as Record<string, string>;
  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "");
  cache = { keys, expiresAt: now() + (maxAge ? Number(maxAge[1]) * 1000 : 0) };
  return keys;
}

const invalid = (reason: string) => new Error(`id_token_${reason}`);

function decodePart(part: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    throw invalid("malformed");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("malformed");
  return value as Record<string, unknown>;
}

function validSignature(pem: string, signed: string, signature: string): boolean {
  try {
    return verify("RSA-SHA256", Buffer.from(signed), createPublicKey(pem), Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

/**
 * Firebase ID 토큰(JWT)을 확인해 uid(sub)와 관리자 표시를 준다. 하나라도 어긋나면 throw.
 * admin 은 payload 의 admin 이 true(불리언)일 때만 true 다.
 */
export async function verifyIdToken(token: string, deps: IdTokenDeps = {}): Promise<{ uid: string; admin: boolean }> {
  const now = deps.now ?? Date.now;
  const projectId = deps.projectId ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw invalid("no_project");
  const loadKeys = deps.fetchKeys ?? (() => fetchGoogleKeys(now));

  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) throw invalid("malformed");
  const [rawHeader, rawPayload, signature] = parts;
  const header = decodePart(rawHeader);
  if (header.alg !== "RS256") throw invalid("alg");
  const kid = header.kid;
  if (typeof kid !== "string" || !kid) throw invalid("kid");

  /** 인증서가 바뀐 직후일 수 있어, kid 가 없으면 둔 것을 버리고 한 번만 다시 받는다. */
  let keys = await loadKeys();
  if (!Object.hasOwn(keys, kid)) {
    clearIdTokenKeyCache();
    keys = await loadKeys();
  }
  const pem = Object.hasOwn(keys, kid) ? keys[kid] : undefined;
  if (typeof pem !== "string") throw invalid("kid");
  if (!validSignature(pem, `${rawHeader}.${rawPayload}`, signature)) throw invalid("signature");

  const claims = decodePart(rawPayload);
  const nowSec = now() / 1000;
  if (claims.aud !== projectId) throw invalid("aud");
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw invalid("iss");
  const { sub, exp, iat, auth_time: authTime } = claims;
  if (typeof sub !== "string" || !sub || sub.length > MAX_UID_LENGTH) throw invalid("sub");
  if (typeof exp !== "number" || exp <= nowSec) throw invalid("expired");
  if (typeof iat !== "number" || iat > nowSec + CLOCK_SKEW_SEC) throw invalid("iat");
  if (typeof authTime !== "number" || authTime > nowSec + CLOCK_SKEW_SEC) throw invalid("auth_time");
  return { uid: sub, admin: claims.admin === true };
}
