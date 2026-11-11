import { createVerify, generateKeyPairSync } from "node:crypto";
import { expect, test } from "vitest";
import { signCustomToken } from "@/lib/customToken";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = {
  client_email: "sa@demo.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

test("Firebase 커스텀 토큰 형식으로 서명한다", () => {
  const token = signCustomToken(account, "u1", { member: true, nickname: "철수" }, 1000);
  const [h, p, s] = token.split(".");

  expect(decode(h)).toEqual({ alg: "RS256", typ: "JWT" });
  expect(decode(p)).toEqual({
    iss: account.client_email,
    sub: account.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: 1000,
    exp: 4600,
    uid: "u1",
    claims: { member: true, nickname: "철수" },
  });
  const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url"));
  expect(ok).toBe(true);
});
