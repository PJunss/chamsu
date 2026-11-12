/** 단위 테스트용 가짜 Firestore. 컬렉션 경로 문자열("rooms/x/messages" 포함)마다 문서 Map 을 둔다. */
export type Data = Record<string, unknown>;

type Op = "==" | ">" | ">=" | "<" | "<=";

const value = (v: unknown): unknown =>
  v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: unknown }).toMillis === "function"
    ? (v as { toMillis: () => number }).toMillis()
    : v instanceof Date
      ? v.getTime()
      : v;

type Stamp = { seconds: number; nanoseconds: number };
const isStamp = (v: unknown): v is Stamp =>
  !!v && typeof v === "object" && typeof (v as Stamp).seconds === "number" && typeof (v as Stamp).nanoseconds === "number";

function compare(a: unknown, b: unknown): number {
  if (isStamp(a) && isStamp(b)) {
    return a.seconds !== b.seconds ? a.seconds - b.seconds : a.nanoseconds - b.nanoseconds;
  }
  const x = value(a) as number | string;
  const y = value(b) as number | string;
  return x < y ? -1 : x > y ? 1 : 0;
}

export function createFakeFirestore(opts: { failUpdate?: (path: string, id: string) => boolean } = {}) {
  const collections = new Map<string, Map<string, Data>>();
  const reads: string[] = [];
  let autoId = 0;

  function col(path: string) {
    let c = collections.get(path);
    if (!c) {
      c = new Map();
      collections.set(path, c);
    }
    return c;
  }

  function docRef(path: string, id: string) {
    return {
      id,
      path: `${path}/${id}`,
      get: async () => {
        reads.push(path);
        const data = col(path).get(id);
        return { id, exists: data !== undefined, data: () => data };
      },
      set: async (data: Data) => {
        col(path).set(id, { ...data });
      },
      update: async (patch: Data) => {
        if (opts.failUpdate?.(path, id)) throw new Error("update failed");
        const cur = col(path).get(id);
        if (!cur) throw new Error("not found");
        col(path).set(id, { ...cur, ...patch });
      },
      delete: async () => {
        col(path).delete(id);
      },
    };
  }
  type Ref = ReturnType<typeof docRef>;

  function query(path: string) {
    const filters: [string, Op, unknown][] = [];
    let order: [string, "asc" | "desc"] | null = null;
    let lim = Infinity;
    let last = Infinity;
    let end: unknown = undefined;
    const q = {
      where(field: string, op: Op, v: unknown) {
        filters.push([field, op, v]);
        return q;
      },
      orderBy(field: string, dir: "asc" | "desc" = "asc") {
        order = [field, dir];
        return q;
      },
      limit(n: number) {
        lim = n;
        return q;
      },
      limitToLast(n: number) {
        last = n;
        return q;
      },
      endAt(v: unknown) {
        end = v;
        return q;
      },
      async get() {
        reads.push(path);
        let docs = [...col(path).entries()].map(([id, data]) => ({ id, data: () => data, exists: true, ref: docRef(path, id) }));
        for (const [f, op, v] of filters) {
          docs = docs.filter((d) => {
            const c = compare(d.data()[f], v);
            return op === "==" ? c === 0 : op === ">" ? c > 0 : op === ">=" ? c >= 0 : op === "<" ? c < 0 : c <= 0;
          });
        }
        if (order) {
          const [f, dir] = order;
          docs.sort((a, b) => compare(a.data()[f], b.data()[f]) * (dir === "desc" ? -1 : 1));
          if (end !== undefined) docs = docs.filter((d) => compare(d.data()[f], end) * (dir === "desc" ? -1 : 1) <= 0);
        }
        if (last !== Infinity) docs = docs.slice(Math.max(0, docs.length - last));
        docs = docs.slice(0, lim);
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
    return q;
  }

  const db = {
    collection: (path: string) => ({
      doc: (id: string) => docRef(path, id),
      add: async (data: Data) => {
        const id = `auto${++autoId}`;
        col(path).set(id, { ...data });
        return docRef(path, id);
      },
      where: (f: string, op: Op, v: unknown) => query(path).where(f, op, v),
      orderBy: (f: string, dir?: "asc" | "desc") => query(path).orderBy(f, dir),
      limit: (n: number) => query(path).limit(n),
      get: () => query(path).get(),
    }),
    batch: () => {
      const ops: (() => Promise<void>)[] = [];
      const b = {
        delete: (r: Ref) => {
          ops.push(() => r.delete());
          return b;
        },
        commit: async () => {
          for (const op of ops) await op();
        },
      };
      return b;
    },
    runTransaction: async <T>(
      fn: (tx: { get: (r: Ref) => ReturnType<Ref["get"]>; set: (r: Ref, d: Data) => void; update: (r: Ref, d: Data) => void }) => Promise<T>,
    ) => {
      const writes: (() => Promise<void>)[] = [];
      const result = await fn({
        get: (r) => r.get(),
        set: (r, d) => void writes.push(() => r.set(d)),
        update: (r, d) => void writes.push(() => r.update(d)),
      });
      for (const w of writes) await w();
      return result;
    },
  };

  return { db, col, reads };
}

export const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
