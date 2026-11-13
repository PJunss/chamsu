export const DISPLAY_NAME_MAX = 20;

/** 앞뒤 공백을 지우고 20자로 자른다. 비면 fallback("모험가"). */
export function cleanDisplayName(raw: string | null | undefined, fallback = "모험가"): string {
  const name = [...(raw ?? "").trim()].slice(0, DISPLAY_NAME_MAX).join("").trim();
  return name || fallback;
}

/** users/{uid} 구독 상태. missing 은 문서가 없거나 읽지 못한 경우다. */
export type DisplayNameState = { status: "loading" } | { status: "missing" } | { status: "ready"; name: string };

/** 화면과 메시지에 쓸 이름. 로딩 중이면 null, 문서가 없으면 구글 표시 이름(없으면 기본 이름), 있으면 저장된 이름. */
export function shownDisplayName(state: DisplayNameState, googleName: string | null): string | null {
  if (state.status === "loading") return null;
  return state.status === "ready" ? state.name : cleanDisplayName(googleName);
}
