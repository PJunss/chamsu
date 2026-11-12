import { describe, expect, test } from "vitest";
import { applySnapshot, mergeWindow, prependOlder, type MessageWindow } from "@/lib/messageWindow";

type M = { id: string; createdAt: Date | null };

const m = (n: number): M => ({ id: String(n), createdAt: new Date(10_000 - n) });
const asc = (from: number, to: number) => {
  const out: M[] = [];
  for (let n = from; n >= to; n--) out.push(m(n));
  return out;
};
const ids = (list: M[]) => list.map((x) => x.id);

describe("applySnapshot", () => {
  test("이전 메시지를 불러온 뒤 새 메시지가 오면 밀려난 문서를 older 로 옮긴다", () => {
    const prev: MessageWindow<M> = { older: asc(100, 51), latest: asc(50, 1) };
    const next = applySnapshot(prev, asc(49, 0));
    const merged = mergeWindow(next);
    expect(ids(merged)).toEqual(ids(asc(100, 0)));
    expect(new Set(ids(merged)).size).toBe(merged.length);
    expect(ids(next.older)).toContain("50");
  });
  test("이전 메시지를 불러오지 않았어도 밀려난 문서를 남긴다", () => {
    const next = applySnapshot({ older: [], latest: asc(50, 1) }, asc(49, 0));
    expect(ids(mergeWindow(next))).toEqual(ids(asc(50, 0)));
  });
  test("메타데이터만 바뀌면 그대로", () => {
    const prev = { older: [], latest: asc(3, 1) };
    expect(applySnapshot(prev, asc(3, 1))).toEqual(prev);
  });
  test("창 안에서 사라진 문서는 옮기지 않는다", () => {
    const pending: M = { id: "p", createdAt: null };
    const next = applySnapshot({ older: [], latest: [...asc(3, 1), pending] }, asc(3, 1));
    expect(ids(mergeWindow(next))).toEqual(["3", "2", "1"]);
  });
  test("창이 다 차지 않으면 사라진 메시지는 지워진 것으로 보고 older 도 비운다", () => {
    const prev: MessageWindow<M> = { older: asc(100, 51), latest: asc(50, 1) };
    expect(applySnapshot(prev, [], false)).toEqual({ older: [], latest: [] });
    const greet = m(0);
    expect(ids(mergeWindow(applySnapshot(prev, [greet], false)))).toEqual(["0"]);
  });
  test("latest 로 돌아온 문서는 older 에서 뺀다", () => {
    const next = applySnapshot({ older: asc(5, 4), latest: asc(3, 1) }, asc(4, 2));
    expect(ids(next.older)).toEqual(["5"]);
    expect(ids(mergeWindow(next))).toEqual(["5", "4", "3", "2"]);
  });
});

describe("prependOlder", () => {
  test("앞에 붙이고 중복을 뺀다", () => {
    const next = prependOlder({ older: asc(5, 4), latest: asc(3, 1) }, asc(7, 5));
    expect(ids(mergeWindow(next))).toEqual(ids(asc(7, 1)));
  });
});
