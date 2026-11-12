import { describe, expect, test } from "vitest";
import { createTiming } from "@/lib/claude/timing";

describe("createTiming", () => {
  test("각 단계는 앞 단계가 끝난 뒤부터 잰 시간이고 total 은 처음부터 잰 시간이다", () => {
    let t = 1000;
    const timing = createTiming(() => t);
    t = 1100;
    timing.lap("accept");
    timing.note("recalled", 2);
    t = 1350;
    timing.lap("answer");
    t = 1400;
    expect(timing.line()).toBe("total=400 accept=100 recalled=2 answer=250");
  });
});
