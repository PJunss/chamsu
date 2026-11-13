import { expect, test, vi } from "vitest";
import { fetchSeasons } from "@/lib/er/client";

const ROW = { seasonID: 43, seasonName: "Season22", seasonStart: "2026-11-19 12:00:00", seasonEnd: "2027-02-18 09:00:00", isCurrent: 0 };
const env = (key?: string) => ({ ER_API_KEY: key }) as unknown as NodeJS.ProcessEnv;
const fetchOf = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("키를 x-api-key 로 붙여 시즌 표를 받는다", async () => {
  const f = fetchOf({ code: 200, message: "Success", data: [ROW] });
  expect(await fetchSeasons(env("k1"), f)).toEqual([ROW]);
  const [url, init] = vi.mocked(f).mock.calls[0];
  expect(String(url)).toBe("https://open-api.bser.io/v2/data/Season");
  expect(new Headers(init?.headers).get("x-api-key")).toBe("k1");
});

test("모양이 다른 행은 뺀다", async () => {
  const f = fetchOf({ code: 200, data: [ROW, { seasonID: "x" }, null] });
  expect(await fetchSeasons(env("k1"), f)).toEqual([ROW]);
});

test("키가 없으면 부르지 않고 throw", async () => {
  const f = fetchOf({ code: 200, data: [] });
  await expect(fetchSeasons(env(), f)).rejects.toThrow();
  expect(f).not.toHaveBeenCalled();
});

test("응답이 200 이 아니거나 본문의 code 가 200 이 아니거나 data 가 배열이 아니면 throw", async () => {
  await expect(fetchSeasons(env("k1"), fetchOf({}, 403))).rejects.toThrow();
  await expect(fetchSeasons(env("k1"), fetchOf({ code: 429, message: "Too Many Requests" }))).rejects.toThrow();
  await expect(fetchSeasons(env("k1"), fetchOf({ code: 200, data: {} }))).rejects.toThrow();
});
