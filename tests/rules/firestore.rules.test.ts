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
    projectId: "demo-er-chatbot",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8180 },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const user = (uid = "alice") => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const ROOM = "rooms/alice_bianca";
const MESSAGES = `${ROOM}/messages`;
const JOBS = `${ROOM}/claudeJobs`;

const msg = (over: Record<string, unknown> = {}) => ({
  text: "안녕",
  nickname: "철수",
  uid: "alice",
  createdAt: serverTimestamp(),
  ...over,
});

/** 규칙을 끄고 문서를 미리 넣는다. */
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

describe("rooms/{uid}_{personaId}/messages", () => {
  beforeEach(async () => {
    await seed(`${MESSAGES}/m1`, { text: "x", nickname: "비앙카", uid: "bot_bianca", createdAt: Timestamp.now() });
  });

  test("주인은 읽고 쓴다", async () => {
    await assertSucceeds(getDocs(collection(user(), MESSAGES)));
    await assertSucceeds(addDoc(collection(user(), MESSAGES), msg()));
  });
  test("남은 읽지도 쓰지도 못한다", async () => {
    await assertFails(getDocs(collection(user("bob"), MESSAGES)));
    await assertFails(addDoc(collection(user("bob"), MESSAGES), msg({ uid: "bob" })));
  });
  test("비로그인은 읽지도 쓰지도 못한다", async () => {
    await assertFails(getDocs(collection(anon(), MESSAGES)));
    await assertFails(addDoc(collection(anon(), MESSAGES), msg()));
  });
  test("남의 uid 로 쓰면 거부", async () =>
    assertFails(addDoc(collection(user(), MESSAGES), msg({ uid: "bob" }))));
  test("닉네임은 1~20자", async () => {
    await assertSucceeds(addDoc(collection(user(), MESSAGES), msg({ nickname: "가".repeat(20) })));
    await assertFails(addDoc(collection(user(), MESSAGES), msg({ nickname: "가".repeat(21) })));
    await assertFails(addDoc(collection(user(), MESSAGES), msg({ nickname: "" })));
    await assertFails(addDoc(collection(user(), MESSAGES), msg({ nickname: 3 })));
  });
  test("본문은 1~500자", async () => {
    await assertSucceeds(addDoc(collection(user(), MESSAGES), msg({ text: "a".repeat(500) })));
    await assertFails(addDoc(collection(user(), MESSAGES), msg({ text: "a".repeat(501) })));
    await assertFails(addDoc(collection(user(), MESSAGES), msg({ text: "" })));
  });
  test("createdAt 이 서버 시각이 아니면 거부", async () =>
    assertFails(addDoc(collection(user(), MESSAGES), msg({ createdAt: Timestamp.fromMillis(0) }))));
  test("모르는 필드, 빠진 필드는 거부", async () => {
    await assertFails(addDoc(collection(user(), MESSAGES), msg({ replyTo: "m1" })));
    await assertFails(addDoc(collection(user(), MESSAGES), { text: "안녕", uid: "alice", createdAt: serverTimestamp() }));
  });
  test("고치기와 지우기는 주인도 못 한다", async () => {
    await assertFails(updateDoc(doc(user(), `${MESSAGES}/m1`), { text: "y" }));
    await assertFails(deleteDoc(doc(user(), `${MESSAGES}/m1`)));
  });
});

describe("rooms/{uid}_{personaId}", () => {
  beforeEach(async () => {
    await seed(ROOM, { clearedAt: Timestamp.now() });
    await seed("rooms/alicex_bianca", { clearedAt: Timestamp.now() });
  });

  test("주인은 읽는다", async () => assertSucceeds(getDoc(doc(user(), ROOM))));
  test("남과 비로그인은 읽지 못한다", async () => {
    await assertFails(getDoc(doc(user("bob"), ROOM)));
    await assertFails(getDoc(doc(anon(), ROOM)));
  });
  test("주인도 쓰지 못한다", async () => {
    await assertFails(setDoc(doc(user(), ROOM), { clearedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(user(), ROOM)));
  });
  test("uid 뒤에 글자가 붙은 방 id 는 내 방이 아니다", async () => {
    await assertFails(getDoc(doc(user(), "rooms/alicex_bianca")));
    await assertFails(getDocs(collection(user(), "rooms/alicex_bianca/messages")));
    await assertSucceeds(getDoc(doc(user("alicex"), "rooms/alicex_bianca")));
  });
});

describe("rooms/{uid}_{personaId}/claudeJobs", () => {
  beforeEach(async () => {
    await seed(`${JOBS}/m1_bianca`, { status: "pending", personaId: "bianca", createdAt: Timestamp.now() });
  });

  test("주인은 읽는다", async () =>
    assertSucceeds(getDocs(query(collection(user(), JOBS), where("status", "==", "pending")))));
  test("남은 읽지 못한다", async () =>
    assertFails(getDocs(query(collection(user("bob"), JOBS), where("status", "==", "pending")))));
  test("주인도 쓰지 못한다", async () =>
    assertFails(setDoc(doc(user(), `${JOBS}/m2_bianca`), { status: "pending" })));
});

describe("users", () => {
  const profile = (over: Record<string, unknown> = {}) => ({ displayName: "철수", createdAt: serverTimestamp(), ...over });
  const seedUser = (uid = "alice") => seed(`users/${uid}`, { displayName: "철수", createdAt: Timestamp.fromMillis(1_000) });

  test("본인은 만들고 읽는다", async () => {
    await assertSucceeds(setDoc(doc(user(), "users/alice"), profile()));
    await assertSucceeds(getDoc(doc(user(), "users/alice")));
  });
  test("본인은 이름을 바꾼다", async () => {
    await seedUser();
    await assertSucceeds(updateDoc(doc(user(), "users/alice"), { displayName: "영희" }));
  });
  test("남은 읽지도 쓰지도 못한다", async () => {
    await seedUser();
    await assertFails(getDoc(doc(user("bob"), "users/alice")));
    await assertFails(updateDoc(doc(user("bob"), "users/alice"), { displayName: "영희" }));
    await assertFails(setDoc(doc(user("bob"), "users/carol"), profile()));
    await assertFails(getDoc(doc(anon(), "users/alice")));
  });
  test("displayName 은 1~20자 문자열", async () => {
    await assertSucceeds(setDoc(doc(user(), "users/alice"), profile({ displayName: "가".repeat(20) })));
    await assertFails(setDoc(doc(user("bob"), "users/bob"), profile({ displayName: "가".repeat(21) })));
    await assertFails(setDoc(doc(user("bob"), "users/bob"), profile({ displayName: "" })));
    await assertFails(setDoc(doc(user("bob"), "users/bob"), profile({ displayName: 3 })));
    await assertFails(updateDoc(doc(user(), "users/alice"), { displayName: "가".repeat(21) }));
    await assertFails(updateDoc(doc(user(), "users/alice"), { displayName: "" }));
  });
  test("모르는 필드는 거부", async () => {
    await assertFails(setDoc(doc(user(), "users/alice"), profile({ admin: true })));
    await seedUser();
    await assertFails(updateDoc(doc(user(), "users/alice"), { admin: true }));
  });
  test("만들 때 createdAt 은 서버 시각이어야 한다", async () =>
    assertFails(setDoc(doc(user(), "users/alice"), profile({ createdAt: Timestamp.fromMillis(0) }))));
  test("createdAt 은 바꾸지 못한다", async () => {
    await seedUser();
    await assertFails(updateDoc(doc(user(), "users/alice"), { createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(user(), "users/alice"), { displayName: "영희", createdAt: Timestamp.fromMillis(2_000) }));
  });
  test("지우지 못한다", async () => {
    await seedUser();
    await assertFails(deleteDoc(doc(user(), "users/alice")));
  });
});

describe("events", () => {
  beforeEach(async () => {
    await seed("events/e1", { title: "패치", kind: "patch", startAt: Timestamp.now() });
  });

  test("비로그인도 읽는다", async () => {
    await assertSucceeds(getDoc(doc(anon(), "events/e1")));
    await assertSucceeds(getDocs(collection(anon(), "events")));
  });
  test("로그인 사용자도 쓰지 못한다", async () => {
    await assertFails(setDoc(doc(user(), "events/e2"), { title: "x" }));
    await assertFails(updateDoc(doc(user(), "events/e1"), { title: "y" }));
    await assertFails(deleteDoc(doc(user(), "events/e1")));
  });
});

describe("affinity", () => {
  beforeEach(async () => {
    await seed("affinity/alice_bianca_bianca_alice", { roomId: "alice_bianca", personaId: "bianca", uid: "alice", score: 60 });
    await seed("affinity/bob_bianca_bianca_bob", { roomId: "bob_bianca", personaId: "bianca", uid: "bob", score: 40 });
  });

  test("자기 uid 문서는 읽는다", async () => {
    await assertSucceeds(getDoc(doc(user(), "affinity/alice_bianca_bianca_alice")));
    await assertSucceeds(
      getDocs(query(collection(user(), "affinity"), where("uid", "==", "alice"), where("roomId", "==", "alice_bianca"))),
    );
  });
  test("남의 문서는 읽지 못한다", async () => {
    await assertFails(getDoc(doc(user(), "affinity/bob_bianca_bianca_bob")));
    await assertFails(getDocs(query(collection(user(), "affinity"), where("uid", "==", "bob"))));
    await assertFails(getDocs(collection(anon(), "affinity")));
  });
  test("쓰지 못한다", async () =>
    assertFails(setDoc(doc(user(), "affinity/alice_bianca_bianca_alice"), { uid: "alice", score: 100 })));
});

describe("그 밖의 경로", () => {
  test("최상위 messages·presence 는 읽지도 쓰지도 못한다", async () => {
    await assertFails(getDocs(collection(user(), "messages")));
    await assertFails(addDoc(collection(user(), "messages"), msg()));
    await assertFails(getDocs(collection(user(), "presence")));
  });
});
