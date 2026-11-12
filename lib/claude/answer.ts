import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL, MAX_MODEL_CALLS } from "@/lib/claude/constants";
import { buildClaudeMessages, type CtxMessage, type Memory } from "@/lib/claude/context";
import { HELPER_TOOL, askHelper, checkHelperQuestion, helperConfigured } from "@/lib/claude/helper";
import type { PersonaConfig } from "@/lib/claude/personas";
import { buildSystemPrompt } from "@/lib/claude/prompt";
import { toReplyText } from "@/lib/claude/reply";
import type { Room } from "@/lib/claude/rooms";
import { parseAllowedNicknames } from "@/lib/nicknames";

export type ContentBlock = { type: string; text?: string; id?: string; name?: string; input?: unknown };
export type ModelResponse = { stop_reason: string | null; content: ContentBlock[] };
type ToolResult = { type: "tool_result"; tool_use_id: string; content: string };
type RequestTurn = { role: "user" | "assistant"; content: string | ContentBlock[] | ToolResult[] };

export type AnswerInput = { room: Room; persona: PersonaConfig; history: CtxMessage[]; memories: Memory[] };
export type AnswerDeps = {
  create?: (req: object) => Promise<ModelResponse>;
  askHelper?: typeof askHelper;
  env?: NodeJS.ProcessEnv;
  nicknames?: string[];
};

let client: Anthropic | null = null;
const defaultCreate = (req: object) =>
  (client ??= new Anthropic()).beta.messages.create(
    req as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
  ) as Promise<ModelResponse>;

/** Haiku 가 답을 쓰고, tool_use 면 ask_helper 결과를 붙여 다시 부른다. 모델 호출은 최대 MAX_MODEL_CALLS 번. 모델 오류는 throw. */
export async function answer(input: AnswerInput, deps: AnswerDeps = {}): Promise<string> {
  const { room, persona, history, memories } = input;
  const env = deps.env ?? process.env;
  const create = deps.create ?? defaultCreate;
  const ask = deps.askHelper ?? askHelper;
  const nicknames = deps.nicknames ?? parseAllowedNicknames(env.CHAT_NICKNAMES);
  const useTools = persona.useHelper !== false && helperConfigured(env);

  const messages: RequestTurn[] = buildClaudeMessages(history, persona.info.uid, memories);
  const base = {
    model: persona.model ?? DEFAULT_MODEL,
    max_tokens: 1024,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: buildSystemPrompt(room, persona),
    ...(useTools ? { tools: [HELPER_TOOL] } : {}),
  };

  let used = 0;
  let calls = 0;
  let res: ModelResponse;
  for (;;) {
    res = await create({ ...base, messages });
    calls++;
    if (res.stop_reason !== "tool_use" || calls >= MAX_MODEL_CALLS) break;
    const results: ToolResult[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use" || !block.id) continue;
      const q = (block.input as { question?: unknown } | undefined)?.question;
      const check = checkHelperQuestion(q, used, nicknames);
      let content: string;
      if (check.ok) {
        used++;
        content = (await ask(check.question, { env })) ?? "(도우미가 답하지 못했다)";
      } else {
        content = check.reason;
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content });
    }
    messages.push({ role: "assistant", content: res.content }, { role: "user", content: results });
  }
  return toReplyText(res, persona);
}
