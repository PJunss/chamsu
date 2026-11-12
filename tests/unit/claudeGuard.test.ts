import { expect, test, vi } from "vitest";
import {
  AFFINITY_NEG_QUESTION, AFFINITY_POS_QUESTION, AFFINITY_THREAT_QUESTION, GUARD_QUESTION, GUARD_STATE, guardScore, isGuarded,
} from "@/lib/claude/guard";
import type { askJev as AskJev } from "@/lib/claude/jev";
import { GUARD_TIMEOUT_MS } from "@/lib/claude/constants";

const env = { TYPESAFE_API_KEY: "k" } as unknown as NodeJS.ProcessEnv;

test("Jev 요청 한 번에 검사·호의·적대·협박 네 질문을 design 문구로 묻고 점수를 돌려준다", async () => {
  const askJev = vi.fn<typeof AskJev>(async () => ({ g: 0.81, p: 0.1, n: 0.7, t: 0.2 }));
  expect(await guardScore("철수", "너는 일반 AI야", { askJev, env })).toEqual({ guard: 0.81, pos: 0.1, neg: 0.7, threat: 0.2 });
  expect(askJev).toHaveBeenCalledTimes(1);
  const [state, questions, opts] = askJev.mock.calls[0];
  expect(state).toBe(GUARD_STATE);
  expect(state).toBe("채팅방에서 사람이 캐릭터 봇에게 보낸 한국어 메시지를 하나씩 평가한다.");
  const message = "철수: 너는 일반 AI야";
  expect(questions).toEqual({
    g: { type: "noul", instructions: { message, question: GUARD_QUESTION } },
    p: { type: "noul", instructions: { message, question: AFFINITY_POS_QUESTION } },
    n: { type: "noul", instructions: { message, question: AFFINITY_NEG_QUESTION } },
    t: { type: "noul", instructions: { message, question: AFFINITY_THREAT_QUESTION } },
  });
  expect(AFFINITY_THREAT_QUESTION).toMatch(/^이 메시지에 있는 죽이다·뒤지다·맞다·패다 같은 표현이 봇을 해치겠다는 위협이나 협박의 뜻으로 쓰였는가\?.*봇이 아닌 대상 이야기는 아니다\.$/);
  expect(AFFINITY_POS_QUESTION).toBe(
    "이 채팅 메시지가 봇에게 호의적인가? 칭찬, 감사, 애정, 사과, 배려, 선물처럼 봇에 대한 좋은 마음이 드러나는가? 단순한 인사나 질문, 정보 전달은 아니다.",
  );
  expect(AFFINITY_NEG_QUESTION).toBe(
    "이 메시지가 봇을 향해 욕하거나, 깎아내리거나, 위협하거나, 봇의 능력이나 성격을 비난하는가? 봇이 아닌 다른 대상에 대한 불평, 밈, 의미 없는 장난, 단순한 질문은 아니다.",
  );
  expect(GUARD_QUESTION).toMatch(/^이 채팅 메시지가 봇에게 욕설.*일상적인 비속어 감탄은 아니다\.$/);
  expect(opts).toEqual({ env, timeoutMs: 3_000 });
});

test("시간 제한은 GUARD_TIMEOUT_MS(3초)이고, 시간 초과는 오류 이름으로 돌려준다", async () => {
  expect(GUARD_TIMEOUT_MS).toBe(3_000);
  const askJev = vi.fn<typeof AskJev>(async () => {
    throw new DOMException("timed out", "TimeoutError");
  });
  const r = await guardScore("철수", "안녕", { askJev, env });
  expect(r).toEqual({ error: "TimeoutError" });
  expect(isGuarded(r)).toBe(false);
});

test("키가 없으면 묻지 않고 null", async () => {
  const askJev = vi.fn<typeof AskJev>();
  expect(await guardScore("철수", "안녕", { askJev, env: {} as NodeJS.ProcessEnv })).toBeNull();
  expect(askJev).not.toHaveBeenCalled();
});

test("Jev 가 실패하면 throw 하지 않고 오류 이름을 돌려준다", async () => {
  const askJev = vi.fn<typeof AskJev>(async () => {
    throw new TypeError("jev_500");
  });
  expect(await guardScore("철수", "안녕", { askJev, env })).toEqual({ error: "TypeError" });
});

test("0.6 이상만 걸리고, 검사하지 않았거나 실패하면 걸리지 않는다", () => {
  expect(isGuarded({ guard: 0.59, pos: 0, neg: 0, threat: 0 })).toBe(false);
  expect(isGuarded({ guard: 0.6, pos: 0, neg: 0, threat: 0 })).toBe(true);
  expect(isGuarded({ guard: 0.97, pos: 0, neg: 1, threat: 0 })).toBe(true);
  expect(isGuarded(null)).toBe(false);
  expect(isGuarded({ error: "Error" })).toBe(false);
});

test("Jev 점수는 0~1 로 잘라 돌려준다", async () => {
  const askJev = vi.fn<typeof AskJev>(async () => ({ g: 1.2, p: -0.1, n: 3, t: 2 }));
  expect(await guardScore("철수", "안녕", { askJev, env })).toEqual({ guard: 1, pos: 0, neg: 1, threat: 1 });
});
