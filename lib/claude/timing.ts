/** 봇 요청 한 건의 단계별 소요 시간(ms)을 모아 로그 한 줄로 만든다. 본문·키는 담지 않는다. */
export type Timing = {
  /** 앞 단계가 끝난 때부터 지금까지 걸린 시간을 name 으로 남긴다. */
  lap: (name: string) => void;
  /** 시간 측정과 무관한 값(개수, 하위 단계 시간)을 그대로 남긴다. */
  note: (name: string, value: string | number) => void;
  line: () => string;
};

export function createTiming(now: () => number = Date.now): Timing {
  const start = now();
  let last = start;
  const parts: string[] = [];
  return {
    lap(name) {
      const t = now();
      parts.push(`${name}=${t - last}`);
      last = t;
    },
    note(name, value) {
      parts.push(`${name}=${value}`);
    },
    line() {
      return [`total=${now() - start}`, ...parts].join(" ");
    },
  };
}
