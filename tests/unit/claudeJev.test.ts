import { expect, test, vi } from "vitest";
import { askJev, jevConfigured, type NoulQuestion } from "@/lib/claude/jev";

const env = { TYPESAFE_API_KEY: "key-test" } as unknown as NodeJS.ProcessEnv;
const questions: Record<string, NoulQuestion> = {
  k0: { type: "noul", instructions: { memory: "철수: 생일 3월", question: "도움이 되는가?" } },
  k1: { type: "noul", instructions: { memory: "영희: 고수 싫어", question: "도움이 되는가?" } },
};

test("키가 있어야 설정됨", () => {
  expect(jevConfigured(env)).toBe(true);
  expect(jevConfigured({} as NodeJS.ProcessEnv)).toBe(false);
});

test("systemone 에 UA·키를 붙여 보내고 noul 점수를 돌려준다", async () => {
  const f = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ answers: { k0: { type: "noul", noul: 0.92 }, k1: { type: "noul", noul: 0.04 } } }),
        { status: 200 },
      ),
  );
  expect(await askJev("철수: 내 생일 알아?", questions, { fetch: f as unknown as typeof fetch, env })).toEqual({
    k0: 0.92,
    k1: 0.04,
  });
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.typesafe.ai/v1/systemone");
  expect(init.method).toBe("POST");
  expect(init.headers).toEqual({
    Authorization: "Bearer key-test",
    "Content-Type": "application/json",
    "User-Agent": "er-chatbot/1.0",
  });
  expect(JSON.parse(init.body as string)).toEqual({ model: "jev-latest", state: "철수: 내 생일 알아?", questions });
  expect(init.signal).toBeInstanceOf(AbortSignal);
});

test("HTTP 오류는 throw", async () => {
  const f = async () => new Response("{}", { status: 400 });
  await expect(askJev("s", questions, { fetch: f as unknown as typeof fetch, env })).rejects.toThrow("jev_400");
});

test("형식이 틀리면 throw", async () => {
  const f = async () => new Response(JSON.stringify({ answers: { k0: { noul: "x" } } }), { status: 200 });
  await expect(askJev("s", questions, { fetch: f as unknown as typeof fetch, env })).rejects.toThrow("jev_format");
});
