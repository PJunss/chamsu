import { timingSafeEqual } from "node:crypto";

export function isValidPinFormat(v: unknown): v is string {
  return typeof v === "string" && /^[0-9]{4}$/.test(v);
}

export function pinMatches(input: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
