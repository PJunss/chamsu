import { expect, test } from "vitest";
import { limitDayExpireAt, limitDayKey, userDayDocId } from "@/lib/claude/limits";

test("한도 날짜는 한국 시간 06:00 에 바뀐다", () => {
  /** 2026-11-11 05:59 KST 는 아직 11-10 */
  expect(limitDayKey(Date.UTC(2026, 10, 10, 20, 59))).toBe("20261110");
  /** 2026-11-11 06:00 KST 부터 11-11 */
  expect(limitDayKey(Date.UTC(2026, 10, 10, 21, 0))).toBe("20261111");
  /** 2026-11-11 00:00 KST(자정)는 아직 11-10 */
  expect(limitDayKey(Date.UTC(2026, 10, 10, 15, 0))).toBe("20261110");
  /** 2026-11-12 05:59:59 KST 까지 11-11 */
  expect(limitDayKey(Date.UTC(2026, 10, 11, 20, 59, 59, 999))).toBe("20261111");
});

test("하루 문서는 그 한도 날짜가 끝나고 하루 뒤에 지워진다", () => {
  expect(limitDayExpireAt(Date.UTC(2026, 10, 10, 21, 0))).toEqual(new Date(Date.UTC(2026, 10, 12, 21, 0)));
  expect(limitDayExpireAt(Date.UTC(2026, 10, 11, 20, 59, 59, 999))).toEqual(new Date(Date.UTC(2026, 10, 12, 21, 0)));
  expect(limitDayExpireAt(Date.UTC(2026, 10, 11, 21, 0))).toEqual(new Date(Date.UTC(2026, 10, 13, 21, 0)));
});

test("사람당 하루 문서 id 는 uid 와 한도 날짜로 만든다", () => {
  expect(userDayDocId("u1", Date.UTC(2026, 10, 10, 20, 59))).toBe("userday_u1_20261110");
  expect(userDayDocId("u1", Date.UTC(2026, 10, 10, 21, 0))).toBe("userday_u1_20261111");
});
