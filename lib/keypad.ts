export const PIN_LENGTH = 4;

export function pressKey(code: string, key: string): string {
  if (key === "C" || key === "Escape") return "";
  if (key === "Backspace") return code.slice(0, -1);
  if (/^[0-9]$/.test(key) && code.length < PIN_LENGTH) return code + key;
  return code;
}
