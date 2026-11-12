import { beforeEach, expect, test, vi } from "vitest";

type Data = Record<string, unknown>;
let store: Map<string, Data>;
let dbAllowed = true;

const ref = (path: string) => ({ path });
const fakeDb = {
  collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
  runTransaction: async <T>(fn: (tx: object) => Promise<T>) => {
    const writes: [string, Data][] = [];
    const tx = {
      get: async (r: { path: string }) => ({ exists: store.has(r.path), data: () => store.get(r.path) }),
      set: (r: { path: string }, d: Data) => void writes.push([r.path, d]),
    };
    const out = await fn(tx);
    for (const [p, d] of writes) store.set(p, d);
    return out;
  },
};

vi.mock("@/lib/firebaseAdmin", () => ({
  getAdminDb: () => {
    if (!dbAllowed) throw new Error("db should not be touched");
    return fakeDb;
  },
}));

import { consumeClaudeQuota } from "@/lib/claude/limits";
import { CLAUDE_LIMITS } from "@/lib/claude/constants";

const NOW = Date.UTC(2026, 10, 11, 3, 0);

beforeEach(() => {
  store = new Map();
  dbAllowed = true;
});

test("기본 설정은 무제한이고 Firestore 에 접근하지 않는다", async () => {
  dbAllowed = false;
  expect(CLAUDE_LIMITS).toEqual({ user: null, dailyMax: null });
  expect(await consumeClaudeQuota("u1", NOW)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW, { user: null, dailyMax: null })).toBe("ok");
});

test("사람당 제한만 켜면 user 문서만 쓰고 넘으면 user", async () => {
  const limits = { user: { windowMs: 60_000, max: 1 }, dailyMax: null };
  expect(await consumeClaudeQuota("u1", NOW, limits)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW + 1000, limits)).toBe("user");
  expect(await consumeClaudeQuota("u2", NOW + 1000, limits)).toBe("ok");
  expect(await consumeClaudeQuota("u1", NOW + 60_000, limits)).toBe("ok");
  expect([...store.keys()].every((k) => k.startsWith("claudeLimits/user_"))).toBe(true);
});

test("하루 제한만 켜면 day 문서만 쓰고 넘으면 daily", async () => {
  const limits = { user: null, dailyMax: 1 };
  expect(await consumeClaudeQuota("u1", NOW, limits)).toBe("ok");
  expect(await consumeClaudeQuota("u2", NOW, limits)).toBe("daily");
  expect([...store.keys()]).toEqual(["claudeLimits/day_20261111"]);
});

test("둘 다 켜면 사람당 제한을 먼저 본다", async () => {
  const limits = { user: { windowMs: 60_000, max: 5 }, dailyMax: 2 };
  expect(await consumeClaudeQuota("u1", NOW, limits)).toBe("ok");
  expect(await consumeClaudeQuota("u2", NOW, limits)).toBe("ok");
  expect(await consumeClaudeQuota("u3", NOW, limits)).toBe("daily");
  expect(store.has("claudeLimits/user_u3")).toBe(false);
});
