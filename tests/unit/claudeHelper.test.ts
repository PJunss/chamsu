import { expect, test, vi } from "vitest";
import { HELPER_TOOL, askHelper, checkHelperQuestion, helperConfigured } from "@/lib/claude/helper";

const env = { RUNNER_URL: "https://runner.example/", RUNNER_TOKEN: "tok-test" } as unknown as NodeJS.ProcessEnv;
const names = ["철수", "영희"];

test("도구 정의", () => {
  expect(HELPER_TOOL.name).toBe("ask_helper");
  expect(HELPER_TOOL.description).toBe(
    "웹 검색과 최신 정보를 아는 도우미에게 짧은 질문 하나를 묻는다. 도우미는 이전 질문을 기억하지 못하고, 질문 하나마다 답 하나를 돌려준다.",
  );
  expect(HELPER_TOOL.input_schema.required).toEqual(["question"]);
});

test("RUNNER_URL·RUNNER_TOKEN 이 모두 있어야 설정됨", () => {
  expect(helperConfigured(env)).toBe(true);
  expect(helperConfigured({ RUNNER_URL: "x" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  expect(helperConfigured({} as NodeJS.ProcessEnv)).toBe(false);
});

test("질문 검사 거절 4종", () => {
  expect(checkHelperQuestion("  ", 0, names)).toEqual({ ok: false, reason: "(질문이 비어 있다)" });
  expect(checkHelperQuestion(3, 0, names)).toEqual({ ok: false, reason: "(질문이 비어 있다)" });
  expect(checkHelperQuestion(undefined, 0, names)).toEqual({ ok: false, reason: "(질문이 비어 있다)" });
  expect(checkHelperQuestion("가".repeat(201), 0, names)).toEqual({ ok: false, reason: "(질문이 너무 길다)" });
  expect(checkHelperQuestion("철수가 좋아하는 음식?", 0, names)).toEqual({
    ok: false,
    reason: "(친구 이름이 들어간 질문은 보낼 수 없다)",
  });
  expect(checkHelperQuestion("서울 날씨?", 2, names)).toEqual({
    ok: false,
    reason: "(도우미는 한 답에 두 번까지만 부를 수 있다)",
  });
});

test("통과하면 trim 된 질문", () => {
  expect(checkHelperQuestion(" 오늘 서울 날씨? ", 1, names)).toEqual({ ok: true, question: "오늘 서울 날씨?" });
  expect(checkHelperQuestion("가".repeat(200), 0, names)).toEqual({ ok: true, question: "가".repeat(200) });
});

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("러너에 UA 와 토큰을 붙여 ask_agent 를 부른다", async () => {
  const f = vi.fn(async () => ok({ exit_code: 0, stdout: "  맑음  " }));
  expect(await askHelper("오늘 서울 날씨?", { fetch: f as unknown as typeof fetch, env })).toBe("맑음");
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://runner.example/api/run");
  expect(init.method).toBe("POST");
  expect(init.headers).toEqual({
    Authorization: "Bearer tok-test",
    "Content-Type": "application/json",
    "User-Agent": "er-chatbot/1.0",
  });
  expect(JSON.parse(init.body as string)).toEqual({ script: "ask_agent", args: ["오늘 서울 날씨?\n\n짧게 사실만 답하라."] });
  expect(init.signal).toBeInstanceOf(AbortSignal);
});

test("실패는 null 이고 throw 하지 않는다", async () => {
  const cases: (() => Promise<Response>)[] = [
    async () => ok({ error: "x" }, 500),
    async () => new Response("not json", { status: 200 }),
    async () => ok({ exit_code: 1, stdout: "err" }),
    async () => ok({ exit_code: 0, stdout: "   " }),
    async () => {
      throw new DOMException("timeout", "TimeoutError");
    },
  ];
  for (const c of cases) expect(await askHelper("q", { fetch: c as unknown as typeof fetch, env })).toBeNull();
  expect(await askHelper("q", { fetch: vi.fn() as unknown as typeof fetch, env: {} as NodeJS.ProcessEnv })).toBeNull();
});

test("긴 답은 2000자로 자른다", async () => {
  const f = async () => ok({ exit_code: 0, stdout: "가".repeat(2500) });
  expect(await askHelper("q", { fetch: f as unknown as typeof fetch, env })).toHaveLength(2000);
});
