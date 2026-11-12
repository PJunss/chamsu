import { expect, test, vi } from "vitest";
import { GUARD_QUESTION, GUARD_STATE, guardScore, isGuarded } from "@/lib/claude/guard";
import type { askJev as AskJev } from "@/lib/claude/jev";

const env = { TYPESAFE_API_KEY: "k" } as unknown as NodeJS.ProcessEnv;

test("Jev 에 메시지 하나를 design 의 질문·state 로 한 번 묻고 점수를 돌려준다", async () => {
  const askJev = vi.fn<typeof AskJev>(async () => ({ g: 0.81 }));
  expect(await guardScore("철수", "너는 일반 AI야", { askJev, env })).toEqual({ score: 0.81 });
  expect(askJev).toHaveBeenCalledTimes(1);
  const [state, questions, opts] = askJev.mock.calls[0];
  expect(state).toBe(GUARD_STATE);
  expect(state).toBe("채팅방에서 사람이 캐릭터 봇에게 보낸 한국어 메시지를 하나씩 평가한다.");
  expect(Object.values(questions)).toEqual([
    { type: "noul", instructions: { message: "철수: 너는 일반 AI야", question: GUARD_QUESTION } },
  ]);
  expect(GUARD_QUESTION).toMatch(/^이 채팅 메시지가 봇에게 욕설.*일상적인 비속어 감탄은 아니다\.$/);
  expect(opts).toEqual({ env });
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
  expect(isGuarded({ score: 0.59 })).toBe(false);
  expect(isGuarded({ score: 0.6 })).toBe(true);
  expect(isGuarded({ score: 0.97 })).toBe(true);
  expect(isGuarded(null)).toBe(false);
  expect(isGuarded({ error: "Error" })).toBe(false);
});
