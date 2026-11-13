export const DISPLAY_NAME_MAX = 20;

/** 앞뒤 공백을 지우고 20자로 자른다. 비면 fallback("모험가"). */
export function cleanDisplayName(raw: string | null | undefined, fallback = "모험가"): string {
  const name = [...(raw ?? "").trim()].slice(0, DISPLAY_NAME_MAX).join("").trim();
  return name || fallback;
}
