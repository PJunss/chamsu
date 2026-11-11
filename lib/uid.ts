import { createHash } from "node:crypto";

/** 같은 닉네임은 언제 들어와도 같은 uid 가 되게 한다. 접속자 목록과 내 메시지 판정이 이 값을 쓴다. */
export function uidForNickname(nickname: string): string {
  return "n_" + createHash("sha256").update(nickname.trim(), "utf8").digest("hex").slice(0, 32);
}
