import { getClientAuth } from "@/lib/firebaseClient";
import type { EventKind } from "@/lib/calendar/events";

/** 관리자 API 에 보내는 일정. startAt·endAt 은 ISO 문자열이다. */
export type AdminEventPayload = {
  title: string;
  kind: EventKind;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  url: string | null;
  note: string | null;
};

/** 실패한 호출. error 는 서버의 오류 코드(보내지 못했으면 "network", 로그인 전이면 "unauthorized"), field 는 400 일 때 틀린 칸이다. */
export type AdminApiFailure = { ok: false; error: string; field?: string };

/** 내 ID 토큰을 붙여 관리자 API 를 부르고 응답 JSON 을 준다. */
async function call(path: string, method: string, body?: unknown): Promise<{ ok: true; data: Record<string, unknown> } | AdminApiFailure> {
  try {
    const token = await getClientAuth().currentUser?.getIdToken();
    if (!token) return { ok: false, error: "unauthorized" };
    const res = await fetch(path, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (res.ok) return { ok: true, data };
    return {
      ok: false,
      error: typeof data.error === "string" ? data.error : "server_error",
      ...(typeof data.field === "string" ? { field: data.field } : {}),
    };
  } catch (e) {
    console.warn("admin api call failed", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "network" };
  }
}

export async function createEvent(input: AdminEventPayload): Promise<{ ok: true; id: string } | AdminApiFailure> {
  const r = await call("/api/admin/events", "POST", input);
  return r.ok ? { ok: true, id: String(r.data.id ?? "") } : r;
}

export async function updateEvent(id: string, input: AdminEventPayload): Promise<{ ok: true } | AdminApiFailure> {
  const r = await call(`/api/admin/events/${encodeURIComponent(id)}`, "PATCH", input);
  return r.ok ? { ok: true } : r;
}

export async function removeEvent(id: string): Promise<{ ok: true } | AdminApiFailure> {
  const r = await call(`/api/admin/events/${encodeURIComponent(id)}`, "DELETE");
  return r.ok ? { ok: true } : r;
}

export async function syncSeasons(): Promise<{ ok: true; synced: number } | AdminApiFailure> {
  const r = await call("/api/admin/season-sync", "POST");
  return r.ok ? { ok: true, synced: typeof r.data.synced === "number" ? r.data.synced : 0 } : r;
}
