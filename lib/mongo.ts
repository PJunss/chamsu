import { MongoClient, type ClientSession, type Db, type Document } from "mongodb";

/** 서버 전용. 봇 기억·PIN 시도·봇 사용량처럼 화면이 구독하지 않는 기록을 두는 MongoDB 연결. */

export type MongoCollectionName = "memories" | "memoryState" | "rateLimits" | "claudeLimits";

export function mongoConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.MONGODB_URI);
}

/** 운영 배포만 er_, 미리보기 배포와 로컬 개발은 er_dev_ 를 쓴다. */
export function collectionPrefix(env: NodeJS.ProcessEnv = process.env): "er_" | "er_dev_" {
  return env.VERCEL_ENV === "production" ? "er_" : "er_dev_";
}

export function mongoCollections(prefix: string): Record<MongoCollectionName, string> {
  return {
    memories: `${prefix}memories`,
    memoryState: `${prefix}memoryState`,
    rateLimits: `${prefix}rateLimits`,
    claudeLimits: `${prefix}claudeLimits`,
  };
}

/** 같은 색인이면 createIndex 는 아무 일도 하지 않는다. */
async function createIndexes(db: Db, prefix: string): Promise<void> {
  const names = mongoCollections(prefix);
  await Promise.all([
    db.collection(names.memories).createIndex({ roomId: 1, createdAt: -1 }),
    db.collection(names.rateLimits).createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection(names.claudeLimits).createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

type Holder = { db?: Promise<Db>; indexed: Map<string, Promise<void>> };

const g = globalThis as typeof globalThis & { __chamsuMongo?: Holder };
/** 개발 모드는 모듈을 다시 읽어도 연결을 다시 쓰도록 globalThis 에 둔다. */
const holder: Holder =
  process.env.NODE_ENV === "development" ? (g.__chamsuMongo ??= { indexed: new Map() }) : { indexed: new Map() };

let testDb: Db | null = null;
const testIndexed = new WeakMap<Db, Map<string, Promise<void>>>();

/** 시험에서 메모리 MongoDB 의 Db 를 넣는다. null 이면 MONGODB_URI 로 붙는다. */
export function setMongoDbForTest(db: Db | null): void {
  testDb = db;
}

function ensureIndexes(db: Db, indexed: Map<string, Promise<void>>, prefix: string): Promise<void> {
  let p = indexed.get(prefix);
  if (!p) {
    p = createIndexes(db, prefix).catch((e: unknown) => {
      indexed.delete(prefix);
      throw e;
    });
    indexed.set(prefix, p);
  }
  return p;
}

/** 클라이언트 하나를 다시 쓴다(maxPoolSize 5). 접두어마다 처음 한 번 색인을 만든다. MONGODB_URI 가 없으면 throw. */
export async function getMongoDb(env: NodeJS.ProcessEnv = process.env): Promise<Db> {
  const prefix = collectionPrefix(env);
  if (testDb) {
    const db = testDb;
    let indexed = testIndexed.get(db);
    if (!indexed) testIndexed.set(db, (indexed = new Map()));
    await ensureIndexes(db, indexed, prefix);
    return db;
  }
  const uri = env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");
  holder.db ??= (async () => {
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5_000 });
    await client.connect();
    return client.db();
  })().catch((e: unknown) => {
    holder.db = undefined;
    throw e;
  });
  const db = await holder.db;
  await ensureIndexes(db, holder.indexed, prefix);
  return db;
}

/** 접두어를 붙인 서버 전용 컬렉션. */
export async function mongoCollection<T extends Document = Document>(
  name: MongoCollectionName,
  env: NodeJS.ProcessEnv = process.env,
) {
  const db = await getMongoDb(env);
  return db.collection<T>(mongoCollections(collectionPrefix(env))[name]);
}

/** 읽고-판단하고-쓰기를 한 트랜잭션으로 묶는다. 일시적 충돌은 드라이버가 다시 시도한다. */
export async function withMongoTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const db = await getMongoDb(env);
  const session = db.client.startSession();
  try {
    return await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
}
