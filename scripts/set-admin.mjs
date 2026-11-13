/**
 * 계정에 관리자 표시(custom claim admin: true)를 붙인다. 로컬에서만 돌린다.
 *
 *   node scripts/set-admin.mjs <uid>
 *
 * .env.local 의 FIREBASE_SERVICE_ACCOUNT(서비스 계정 JSON 의 base64)를 쓴다.
 * 표시는 새 ID 토큰부터 실리므로, 붙인 뒤 그 계정으로 로그아웃하고 다시 로그인한다.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const uid = process.argv[2];
if (!uid) {
  console.error("usage: node scripts/set-admin.mjs <uid>");
  process.exit(1);
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT) process.loadEnvFile(".env.local");
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT is missing in .env.local");
  process.exit(1);
}

const account = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
initializeApp({
  credential: cert({ projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key }),
});

await getAuth().setCustomUserClaims(uid, { admin: true });
console.log("admin claim set", `${uid.slice(0, 6)}...`);
