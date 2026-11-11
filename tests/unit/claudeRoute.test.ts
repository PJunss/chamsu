import { beforeEach, describe, expect, test, vi } from "vitest";

type Ts = { toMillis: () => number };
type Data = Record<string, unknown>;

const ts = (ms: number): Ts => ({ toMillis: () => ms });

let collections: Map<string, Map<string, Data>>;
let autoId = 0;

function col(name: string) {
  let c = collections.get(name);
  if (!c) {
    c = new Map();
    collections.set(name, c);
  }
  return c;
}

function docRef(name: string, id: string) {
  return {
    id,
    get: async () => {
      const data = col(name).get(id);
      return { id, exists: data !== undefined, data: () => data };
    },
    set: async (data: Data) => {
      col(name).set(id, { ...data });
    },
    update: async (patch: Data) => {
      const cur = col(name).get(id);
      if (!cur) throw new Error("not found");
      col(name).set(id, { ...cur, ...patch });
    },
  };
}

type Ref = ReturnType<typeof docRef>;

function query(name: string) {
  let field = "";
  let end: Ts | null = null;
  let last = Infinity;
  const q = {
    orderBy(f: string) {
      field = f;
      return q;
    },
    endAt(v: Ts) {
      end = v;
      return q;
    },
    limitToLast(n: number) {
      last = n;
      return q;
    },
    async get() {
      const ms = (d: Data) => (d[field] as Ts).toMillis();
      let docs = [...col(name).entries()].map(([id, data]) => ({ id, data: () => data }));
      docs.sort((a, b) => ms(a.data()) - ms(b.data()));
      if (end) docs = docs.filter((d) => ms(d.data()) <= end!.toMillis());
      return { docs: docs.slice(Math.max(0, docs.length - last)) };
    },
  };
  return q;
}

const fakeDb = {
  collection: (name: string) => ({
    doc: (id: string) => docRef(name, id),
    add: async (data: Data) => {
      const id = `auto${++autoId}`;
      col(name).set(id, { ...data });
      return docRef(name, id);
    },
    orderBy: (f: string) => query(name).orderBy(f),
  }),
  runTransaction: async <T>(fn: (tx: { get: (r: Ref) => ReturnType<Ref["get"]>; set: (r: Ref, d: Data) => void }) => Promise<T>) => {
    const writes: [Ref, Data][] = [];
    const result = await fn({ get: (r) => r.get(), set: (r, d) => void writes.push([r, d]) });
    for (const [r, d] of writes) await r.set(d);
    return result;
  },
};

vi.mock("@/lib/firebaseAdmin", () => ({ getAdminDb: () => fakeDb }));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => ts(Date.now()) },
}));

const askClaude = vi.fn<(m: { role: string; content: string }[]) => Promise<string>>();
const consumeClaudeQuota = vi.fn<(uid: string, now: number) => Promise<"ok" | "user" | "daily">>();
vi.mock("@/lib/claude/client", () => ({ askClaude: (m: { role: string; content: string }[]) => askClaude(m) }));
vi.mock("@/lib/claude/limits", () => ({
  consumeClaudeQuota: (uid: string, now: number) => consumeClaudeQuota(uid, now),
}));

import { POST } from "@/app/api/claude/route";
import { REPLY_TEXT } from "@/lib/claude/reply";

const NOW = Date.UTC(2026, 10, 11, 3, 0);

function req(body: unknown) {
  return new Request("http://localhost/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function putMessage(id: string, uid: string, nickname: string, text: string, ms: number) {
  col("messages").set(id, { uid, nickname, text, createdAt: ts(ms) });
}

const botReplies = () => [...col("messages").values()].filter((m) => m.uid === "claude" && m.replyTo !== undefined);
const job = (id: string) => col("claudeJobs").get(id);

beforeEach(() => {
  collections = new Map();
  autoId = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  askClaude.mockReset().mockResolvedValue("반가워");
  consumeClaudeQuota.mockReset().mockResolvedValue("ok");
  vi.spyOn(console, "error").mockImplementation(() => {});
  putMessage("q", "u1", "철수", "@비앙카 안녕", NOW - 1000);
});

describe("POST /api/claude", () => {
  test("JSON 이 아니면 400", async () => expect((await POST(req("{"))).status).toBe(400));
  test("messageId 가 문자열이 아니면 400", async () => {
    expect((await POST(req({ messageId: 3 }))).status).toBe(400);
    expect((await POST(req(null))).status).toBe(400);
  });
  test("메시지가 없으면 404", async () => expect((await POST(req({ messageId: "none" }))).status).toBe(404));
  test("@비앙카 질문이 아니면 400 이고 Claude 를 부르지 않는다", async () => {
    putMessage("p", "u1", "철수", "그냥 말", NOW - 1000);
    expect((await POST(req({ messageId: "p" }))).status).toBe(400);
    expect(askClaude).not.toHaveBeenCalled();
  });
  test("질문자가 비앙카면 400", async () => {
    putMessage("b", "claude", "비앙카", "@비앙카 안녕", NOW - 1000);
    expect((await POST(req({ messageId: "b" }))).status).toBe(400);
    expect(askClaude).not.toHaveBeenCalled();
  });
  test("2분이 지난 질문은 410", async () => {
    putMessage("old", "u1", "철수", "@비앙카 안녕", NOW - 180_000);
    expect((await POST(req({ messageId: "old" }))).status).toBe(410);
    expect(askClaude).not.toHaveBeenCalled();
  });
  test("같은 질문으로 두 번 부르면 두 번째는 409 이고 Claude 는 한 번만", async () => {
    expect((await POST(req({ messageId: "q" }))).status).toBe(200);
    expect((await POST(req({ messageId: "q" }))).status).toBe(409);
    expect(askClaude).toHaveBeenCalledTimes(1);
    expect(botReplies()).toHaveLength(1);
  });
  test("사람당 한도를 넘으면 429 user_limited 와 안내 문구", async () => {
    consumeClaudeQuota.mockResolvedValue("user");
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "user_limited" });
    expect(consumeClaudeQuota).toHaveBeenCalledWith("u1", NOW);
    expect(askClaude).not.toHaveBeenCalled();
    expect(botReplies()).toEqual([
      expect.objectContaining({ text: REPLY_TEXT.userLimited, nickname: "비앙카", uid: "claude", replyTo: "q" }),
    ]);
    expect(job("q")?.status).toBe("done");
  });
  test("방 하루 한도를 넘으면 429 daily_limited 와 안내 문구", async () => {
    consumeClaudeQuota.mockResolvedValue("daily");
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_limited" });
    expect(askClaude).not.toHaveBeenCalled();
    expect(botReplies()).toEqual([expect.objectContaining({ text: REPLY_TEXT.dailyLimited, replyTo: "q" })]);
    expect(job("q")?.status).toBe("done");
  });
  test("정상이면 200, 맥락으로 Claude 를 부르고 답을 비앙카 이름으로 쓴다", async () => {
    putMessage("a", "u2", "영희", "점심 뭐 먹지", NOW - 5000);
    putMessage("c", "claude", "비앙카", "김밥", NOW - 4000);
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const sent = askClaude.mock.calls[0][0];
    expect(sent).toEqual([
      { role: "user", content: "영희: 점심 뭐 먹지" },
      { role: "assistant", content: "김밥" },
      { role: "user", content: "철수: @비앙카 안녕" },
    ]);
    expect(botReplies()).toEqual([
      expect.objectContaining({ text: "반가워", nickname: "비앙카", uid: "claude", replyTo: "q" }),
    ]);
    expect(job("q")).toEqual(expect.objectContaining({ status: "done", askedBy: "u1" }));
  });
  test("질문보다 나중 메시지는 맥락에 넣지 않는다", async () => {
    putMessage("later", "u2", "영희", "나중 말", NOW - 500);
    await POST(req({ messageId: "q" }));
    const sent = askClaude.mock.calls[0][0];
    expect(sent.at(-1)).toEqual({ role: "user", content: "철수: @비앙카 안녕" });
    expect(JSON.stringify(sent)).not.toContain("나중 말");
  });
  test("맥락은 최근 30개까지", async () => {
    for (let i = 0; i < 40; i++) putMessage(`m${i}`, "u2", "영희", `말${i}`, NOW - 100_000 + i);
    await POST(req({ messageId: "q" }));
    const content = askClaude.mock.calls[0][0][0].content;
    expect(content.split("\n")).toHaveLength(30);
    expect(content).not.toContain("말10\n");
    expect(content).toContain("말11");
  });
  test("Claude 호출이 실패하면 502, 실패 문구를 쓰고 job 은 failed", async () => {
    askClaude.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ messageId: "q" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "claude_failed" });
    expect(botReplies()).toEqual([expect.objectContaining({ text: REPLY_TEXT.failed, replyTo: "q" })]);
    expect(job("q")?.status).toBe("failed");
  });
});
