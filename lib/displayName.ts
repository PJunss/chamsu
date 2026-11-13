export const DISPLAY_NAME_MAX = 20;

/** 앞뒤 공백을 지우고 20자로 자른다. 비면 fallback("모험가"). */
export function cleanDisplayName(raw: string | null | undefined, fallback = "모험가"): string {
  const name = [...(raw ?? "").trim()].slice(0, DISPLAY_NAME_MAX).join("").trim();
  return name || fallback;
}

/** 사용자가 입력한 닉네임. 앞뒤 공백을 지우고 20자로 자른다. 남는 글자가 없으면 null. */
export function parseNickname(raw: string): string | null {
  return cleanDisplayName(raw, "") || null;
}

/**
 * users/{uid} 구독 상태.
 * missing 은 서버가 문서가 없다고 확인해 준 경우(닉네임을 아직 정하지 않은 사용자)이고,
 * error 는 문서를 읽지 못한 경우다.
 */
export type DisplayNameState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error" }
  | { status: "ready"; name: string };

/**
 * 화면과 메시지에 쓸 이름. 저장된 닉네임이 있으면 그 이름이다.
 * 문서를 읽지 못했으면 구글 표시 이름(없으면 기본 이름)으로 대신한다.
 * 로딩 중이거나 닉네임을 아직 정하지 않았으면 null.
 */
export function shownDisplayName(state: DisplayNameState, googleName: string | null): string | null {
  if (state.status === "ready") return state.name;
  return state.status === "error" ? cleanDisplayName(googleName) : null;
}
