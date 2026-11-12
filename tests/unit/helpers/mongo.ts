import { MongoClient, type Db } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { setMongoDbForTest } from "@/lib/mongo";

/** 노드 1개짜리 메모리 복제 세트(트랜잭션용). 시험 파일마다 dbName 을 달리한다. */
export async function startMongo(dbName: string): Promise<{ db: Db; stop: () => Promise<void> }> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  const client = new MongoClient(replSet.getUri());
  await client.connect();
  const db = client.db(dbName);
  setMongoDbForTest(db);
  return {
    db,
    stop: async () => {
      setMongoDbForTest(null);
      await client.close();
      await replSet.stop();
    },
  };
}

/** 시험 env: MONGODB_URI 는 설정 확인에만 쓰고 실제로 붙지 않는다(setMongoDbForTest 가 먼저다). */
export const MONGO_TEST_ENV = { MONGODB_URI: "mongodb://memory.test/chamsu" } as unknown as NodeJS.ProcessEnv;
