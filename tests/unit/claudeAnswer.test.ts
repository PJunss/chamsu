import { expect, test, vi } from "vitest";
import { answer, type ModelResponse } from "@/lib/claude/answer";
import { getPersonaConfig } from "@/lib/claude/personas";
import { resolveRoom } from "@/lib/claude/rooms";

const persona = getPersonaConfig("bianca")!;
const room = resolveRoom("main")!;
const history = [{ id: "q", uid: "u1", nickname: "철수", text: "@비앙카 서울 날씨 어때?" }];
const runner = { RUNNER_URL: "https://runner.example", RUNNER_TOKEN: "t" } as unknown as NodeJS.ProcessEnv;
const noRunner = {} as NodeJS.ProcessEnv;

type Req = { model: string; system: string; tools?: { name: string }[]; messages: { role: string; content: unknown }[] };

const text = (t: string): ModelResponse => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });
const toolUse = (id: string, question: unknown, extra: { type: string; text?: string }[] = []): ModelResponse => ({
  stop_reason: "tool_use",
  content: [...extra, { type: "tool_use", id, name: "ask_helper", input: { question } }],
});

function fakeCreate(...responses: ModelResponse[]) {
  const calls: Req[] = [];
  const create = vi.fn(async (req: object) => {
    calls.push(structuredClone(req) as Req);
    return responses[Math.min(calls.length - 1, responses.length - 1)];
  });
  return { create, calls };
}

test("도구 없이 바로 답하면 한 번만 부르고, 러너 설정이 없으면 tools 를 빼고 보낸다", async () => {
  const { create, calls } = fakeCreate(text("흐흥, 맑느니라."));
  const askHelper = vi.fn();
  expect(await answer({ room, persona, history, memories: [] }, { create, askHelper, env: noRunner, nicknames: [] })).toBe(
    "흐흥, 맑느니라.",
  );
  expect(create).toHaveBeenCalledTimes(1);
  expect(calls[0]).toMatchObject({
    model: "claude-haiku-5-5",
    max_tokens: 1024,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  expect(calls[0].system).toContain(room.description);
  expect(calls[0].messages).toEqual([{ role: "user", content: "철수: @비앙카 서울 날씨 어때?" }]);
  expect(calls[0].tools).toBeUndefined();
  expect(askHelper).not.toHaveBeenCalled();
});

test("기억은 첫 user 메시지 앞에 들어간다", async () => {
  const { create, calls } = fakeCreate(text("응"));
  const memories = [{ text: "생일 3월", nickname: "철수", context: [], createdAt: new Date(Date.UTC(2026, 10, 1)) }];
  await answer({ room, persona, history, memories }, { create, env: noRunner, nicknames: [] });
  expect(calls[0].messages[0].content).toContain("[기억]\n2026-11-01 철수: 생일 3월");
});

test("러너 설정이 있으면 ask_helper 도구를 넣는다", async () => {
  const { create, calls } = fakeCreate(text("응"));
  await answer({ room, persona, history, memories: [] }, { create, env: runner, nicknames: [] });
  expect(calls[0].tools?.[0].name).toBe("ask_helper");
});

test("useHelper 가 꺼진 페르소나는 러너 설정이 있어도 도구를 넣지 않는다", async () => {
  const { create, calls } = fakeCreate(text("응"));
  await answer({ room, persona: { ...persona, useHelper: false }, history, memories: [] }, { create, env: runner, nicknames: [] });
  expect(calls[0].tools).toBeUndefined();
});

test("tool_use 면 도우미 답을 tool_result 로 붙여 다시 부른다", async () => {
  const { create, calls } = fakeCreate(toolUse("tu1", "오늘 서울 날씨?", [{ type: "text", text: "잠시" }]), text("맑다고 하느니라."));
  const askHelper = vi.fn(async () => "맑음, 12도");
  expect(await answer({ room, persona, history, memories: [] }, { create, askHelper, env: runner, nicknames: ["철수"] })).toBe(
    "맑다고 하느니라.",
  );
  expect(askHelper).toHaveBeenCalledWith("오늘 서울 날씨?", expect.objectContaining({ env: runner }));
  expect(create).toHaveBeenCalledTimes(2);
  const msgs = calls[1].messages;
  expect(msgs.at(-2)).toEqual({
    role: "assistant",
    content: [
      { type: "text", text: "잠시" },
      { type: "tool_use", id: "tu1", name: "ask_helper", input: { question: "오늘 서울 날씨?" } },
    ],
  });
  expect(msgs.at(-1)).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "tu1", content: "맑음, 12도" }] });
});

test("닉네임이 들어간 질문은 러너를 부르지 않고 거절 문구를 넣는다", async () => {
  const { create, calls } = fakeCreate(toolUse("tu1", "철수 생일?"), text("모르느니라."));
  const askHelper = vi.fn();
  await answer({ room, persona, history, memories: [] }, { create, askHelper, env: runner, nicknames: ["철수"] });
  expect(askHelper).not.toHaveBeenCalled();
  expect(calls[1].messages.at(-1)).toEqual({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "tu1", content: "(친구 이름이 들어간 질문은 보낼 수 없다)" }],
  });
});

test("도우미가 실패하면 실패 문구를 넣고 계속 답한다", async () => {
  const { create, calls } = fakeCreate(toolUse("tu1", "환율?"), text("모르느니라."));
  const askHelper = vi.fn(async () => null);
  expect(await answer({ room, persona, history, memories: [] }, { create, askHelper, env: runner, nicknames: [] })).toBe(
    "모르느니라.",
  );
  expect(calls[1].messages.at(-1)).toEqual({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "tu1", content: "(도우미가 답하지 못했다)" }],
  });
});

test("모델은 최대 3번 부르고, 마지막 응답의 text 만 쓴다", async () => {
  const { create, calls } = fakeCreate(
    toolUse("a", "q1"),
    toolUse("b", "q2"),
    toolUse("c", "q3", [{ type: "text", text: "여기까지니라." }]),
  );
  const askHelper = vi.fn(async () => "답");
  expect(await answer({ room, persona, history, memories: [] }, { create, askHelper, env: runner, nicknames: [] })).toBe(
    "여기까지니라.",
  );
  expect(create).toHaveBeenCalledTimes(3);
  expect(askHelper).toHaveBeenCalledTimes(2);
  expect(calls[2].messages.at(-1)).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "b", content: "답" }] });
});

test("3번째도 tool_use 이고 text 가 없으면 empty 문구", async () => {
  const { create } = fakeCreate(toolUse("a", "q1"), toolUse("b", "q2"), toolUse("c", "q3"));
  expect(await answer({ room, persona, history, memories: [] }, { create, askHelper: async () => "답", env: runner, nicknames: [] })).toBe(
    persona.replyText.empty,
  );
});

test("한 답에 도우미는 두 번까지, 세 번째 요청은 거절 문구", async () => {
  const many: ModelResponse = {
    stop_reason: "tool_use",
    content: [
      { type: "tool_use", id: "a", name: "ask_helper", input: { question: "q1" } },
      { type: "tool_use", id: "b", name: "ask_helper", input: { question: "" } },
      { type: "tool_use", id: "c", name: "ask_helper", input: { question: "q2" } },
      { type: "tool_use", id: "d", name: "ask_helper", input: { question: "q3" } },
    ],
  };
  const { create, calls } = fakeCreate(many, text("끝."));
  const askHelper = vi.fn(async (q: string) => `답:${q}`);
  await answer({ room, persona, history, memories: [] }, { create, askHelper, env: runner, nicknames: [] });
  expect(askHelper).toHaveBeenCalledTimes(2);
  expect(calls[1].messages.at(-1)?.content).toEqual([
    { type: "tool_result", tool_use_id: "a", content: "답:q1" },
    { type: "tool_result", tool_use_id: "b", content: "(질문이 비어 있다)" },
    { type: "tool_result", tool_use_id: "c", content: "답:q2" },
    { type: "tool_result", tool_use_id: "d", content: "(도우미는 한 답에 두 번까지만 부를 수 있다)" },
  ]);
});

test("5문장 답은 3문장으로 자른다", async () => {
  const { create } = fakeCreate(text("하나. 둘. 셋. 넷. 다섯."));
  expect(await answer({ room, persona, history, memories: [] }, { create, env: noRunner, nicknames: [] })).toBe("하나. 둘. 셋.");
});

test("모델 오류는 그대로 throw", async () => {
  const create = vi.fn(async () => {
    throw new Error("boom");
  });
  await expect(answer({ room, persona, history, memories: [] }, { create, env: noRunner, nicknames: [] })).rejects.toThrow("boom");
});
