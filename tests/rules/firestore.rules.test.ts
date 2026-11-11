import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-chamsu",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8180 },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const member = (uid = "alice", nickname = "철수") =>
  env.authenticatedContext(uid, { member: true, nickname }).firestore();
const outsider = () => env.authenticatedContext("eve").firestore();
const anon = () => env.unauthenticatedContext().firestore();

const msg = (over: Record<string, unknown> = {}) => ({
  text: "안녕",
  nickname: "철수",
  uid: "alice",
  createdAt: serverTimestamp(),
  ...over,
});

async function seedMessage() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "messages/m1"), {
      text: "x", nickname: "영희", uid: "bob", createdAt: Timestamp.now(),
    });
  });
}

describe("messages", () => {
  test("member 는 읽는다", async () => {
    await seedMessage();
    await assertSucceeds(getDocs(collection(member(), "messages")));
  });
  test("member claim 없는 로그인 사용자는 못 읽는다", async () => {
    await seedMessage();
    await assertFails(getDocs(collection(outsider(), "messages")));
  });
  test("비로그인은 못 읽는다", async () => {
    await seedMessage();
    await assertFails(getDocs(collection(anon(), "messages")));
  });
  test("member 는 자기 닉네임으로 쓴다", async () =>
    assertSucceeds(addDoc(collection(member(), "messages"), msg())));
  test("닉네임 위조는 거부", async () =>
    assertFails(addDoc(collection(member(), "messages"), msg({ nickname: "영희" }))));
  test("남의 uid 는 거부", async () =>
    assertFails(addDoc(collection(member(), "messages"), msg({ uid: "bob" }))));
  test("500자 초과는 거부", async () =>
    assertFails(addDoc(collection(member(), "messages"), msg({ text: "a".repeat(501) }))));
  test("500자는 허용", async () =>
    assertSucceeds(addDoc(collection(member(), "messages"), msg({ text: "a".repeat(500) }))));
  test("빈 본문은 거부", async () =>
    assertFails(addDoc(collection(member(), "messages"), msg({ text: "" }))));
  test("서버 시각이 아니면 거부", async () =>
    assertFails(addDoc(collection(member(), "messages"), msg({ createdAt: Timestamp.fromMillis(0) }))));
  test("추가 필드는 거부", async () =>
    assertFails(addDoc(collection(member(), "messages"), msg({ extra: 1 }))));
  test("outsider 는 못 쓴다", async () =>
    assertFails(addDoc(collection(outsider(), "messages"), msg())));
  test("수정·삭제는 거부", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "messages/mine"), {
        text: "x", nickname: "철수", uid: "alice", createdAt: Timestamp.now(),
      });
    });
    await assertFails(updateDoc(doc(member(), "messages/mine"), { text: "y" }));
    await assertFails(deleteDoc(doc(member(), "messages/mine")));
  });
});

describe("presence", () => {
  const p = (over: Record<string, unknown> = {}) => ({ nickname: "철수", lastSeen: serverTimestamp(), ...over });
  test("본인 문서를 쓰고 갱신·삭제한다", async () => {
    const db = member();
    await assertSucceeds(setDoc(doc(db, "presence/alice"), p()));
    await assertSucceeds(setDoc(doc(db, "presence/alice"), p()));
    await assertSucceeds(deleteDoc(doc(db, "presence/alice")));
  });
  test("남의 문서는 거부", async () => assertFails(setDoc(doc(member(), "presence/bob"), p())));
  test("남의 문서 삭제는 거부", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "presence/bob"), { nickname: "영희", lastSeen: Timestamp.now() });
    });
    await assertFails(deleteDoc(doc(member(), "presence/bob")));
  });
  test("닉네임 위조는 거부", async () =>
    assertFails(setDoc(doc(member(), "presence/alice"), p({ nickname: "영희" }))));
  test("서버 시각이 아니면 거부", async () =>
    assertFails(setDoc(doc(member(), "presence/alice"), p({ lastSeen: Timestamp.fromMillis(0) }))));
  test("member 는 읽고 outsider 는 못 읽는다", async () => {
    await assertSucceeds(getDocs(collection(member(), "presence")));
    await assertFails(getDocs(collection(outsider(), "presence")));
  });
});

describe("rateLimits", () => {
  test("member 도 접근 불가", async () => {
    await assertFails(getDoc(doc(member(), "rateLimits/1.2.3.4")));
    await assertFails(setDoc(doc(member(), "rateLimits/1.2.3.4"), { count: 0, windowStart: 0 }));
  });
});

describe("claudeJobs", () => {
  test("member 는 읽고 outsider 는 못 읽는다", async () => {
    await assertSucceeds(getDocs(collection(member(), "claudeJobs")));
    await assertFails(getDocs(collection(outsider(), "claudeJobs")));
  });
  test("member 는 pending 작업을 구독할 수 있다", async () =>
    assertSucceeds(getDocs(query(collection(member(), "claudeJobs"), where("status", "==", "pending")))));
  test("member 도 쓰지 못한다", async () =>
    assertFails(setDoc(doc(member(), "claudeJobs/x"), { status: "pending" })));
});

describe("claudeLimits", () => {
  test("접근 불가", async () => {
    await assertFails(getDoc(doc(member(), "claudeLimits/day_20261111")));
    await assertFails(setDoc(doc(member(), "claudeLimits/day_20261111"), { count: 0 }));
  });
});

test("messages: 클로드 이름·uid 로는 못 쓴다", async () => {
  await assertFails(addDoc(collection(member(), "messages"), msg({ nickname: "클로드" })));
  await assertFails(addDoc(collection(member(), "messages"), msg({ uid: "claude" })));
});
