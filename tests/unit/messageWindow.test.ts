import { describe, expect, test } from "vitest";
import { applySnapshot, mergeWindow, prependOlder, visibleAfterCleared, type MessageWindow } from "@/lib/messageWindow";

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

const sd = (id: string, seconds: number | null, pending = false) => ({
  item: id,
  pending,
  createdAt: seconds === null ? null : { seconds, nanoseconds: 0 },
});

test("visibleAfterCleared: 지운 시각 이전은 숨기고, 서버 확정 전 메시지는 보인다", () => {
  const cleared = { seconds: 100, nanoseconds: 0 };
  const docs = [sd("mine", 99, true), sd("new", 101), sd("same", 100), sd("old", 50)];
  expect(visibleAfterCleared(docs, cleared, 4)).toEqual({ items: ["mine", "new"], full: false });
  expect(visibleAfterCleared([sd("n", 100)].map((d) => ({ ...d, createdAt: { seconds: 100, nanoseconds: 1 } })), cleared, 1)).toEqual({
    items: ["n"], full: true,
  });
});

test("visibleAfterCleared: 걸러진 게 없으면 창이 다 찼는지로 full 을 정하고, 지운 시각이 없으면 모두 보인다", () => {
  const cleared = { seconds: 100, nanoseconds: 0 };
  expect(visibleAfterCleared([sd("a", 200), sd("b", 150)], cleared, 2)).toEqual({ items: ["a", "b"], full: true });
  expect(visibleAfterCleared([sd("a", 200)], cleared, 2)).toEqual({ items: ["a"], full: false });
  expect(visibleAfterCleared([sd("a", 200), sd("b", 1)], null, 2)).toEqual({ items: ["a", "b"], full: true });
  expect(visibleAfterCleared([sd("x", null)], cleared, 1)).toEqual({ items: ["x"], full: true });
});
