import { signInWithToken } from "@/lib/firebaseClient";

export type EnterResult = "ok" | "wrong_pin" | "rate_limited" | "error";
export type JoinResult =
  | { kind: "ok"; uid: string; nickname: string }
  | { kind: "wrong_pin" | "unknown_nickname" | "rate_limited" | "error" };

async function post(body: object): Promise<Response | null> {
  try {
    return await fetch("/api/enter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

function failure(res: Response | null): "wrong_pin" | "unknown_nickname" | "rate_limited" | "error" {
  if (!res) return "error";
  if (res.status === 401) return "wrong_pin";
  if (res.status === 403) return "unknown_nickname";
  if (res.status === 429) return "rate_limited";
  return "error";
}

export async function checkPin(pin: string): Promise<EnterResult> {
  const res = await post({ pin });
  if (res?.ok) return "ok";
  const f = failure(res);
  return f === "unknown_nickname" ? "error" : f;
}

export async function join(pin: string, nickname: string): Promise<JoinResult> {
  const trimmed = nickname.trim();
  const res = await post({ pin, nickname: trimmed });
  if (!res?.ok) return { kind: failure(res) };
  try {
    const { token } = (await res.json()) as { token: string };
    const user = await signInWithToken(token);
    return { kind: "ok", uid: user.uid, nickname: trimmed };
  } catch {
    return { kind: "error" };
  }
}
