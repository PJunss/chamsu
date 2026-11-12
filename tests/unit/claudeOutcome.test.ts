import { expect, test } from "vitest";
import { decideOutcome } from "@/lib/claude/outcome";

test("답을 쓴 봇이 하나라도 있으면 ok", () => {
  expect(decideOutcome(["ok"])).toBe("ok");
  expect(decideOutcome(["failed", "ok", "error"])).toBe("ok");
  expect(decideOutcome(["user", "ok"])).toBe("ok");
});

test("모두 사용량 제한이면 429", () => {
  expect(decideOutcome(["user", "user"])).toEqual({ error: "user_limited", status: 429 });
  expect(decideOutcome(["daily"])).toEqual({ error: "daily_limited", status: 429 });
  expect(decideOutcome(["user", "daily"])).toEqual({ error: "daily_limited", status: 429 });
});

test("실패 안내만 쓴 봇이 있으면 502", () => {
  expect(decideOutcome(["failed"])).toEqual({ error: "claude_failed", status: 502 });
  expect(decideOutcome(["failed", "error"])).toEqual({ error: "claude_failed", status: 502 });
  expect(decideOutcome(["failed", "user"])).toEqual({ error: "claude_failed", status: 502 });
});

test("아무것도 쓰지 못했으면 500", () => {
  expect(decideOutcome(["error"])).toEqual({ error: "server_error", status: 500 });
  expect(decideOutcome(["error", "user"])).toEqual({ error: "server_error", status: 500 });
});
