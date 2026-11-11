export type ServiceAccount = { project_id: string; client_email: string; private_key: string };

export function readServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT 가 없습니다");
  return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
}
