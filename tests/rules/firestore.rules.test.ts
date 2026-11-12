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

test("messages: 비앙카 이름·uid 로는 못 쓴다", async () => {
  await assertFails(addDoc(collection(member(), "messages"), msg({ nickname: "비앙카" })));
  await assertFails(addDoc(collection(member(), "messages"), msg({ uid: "bot_bianca" })));
});

describe("1:1 방", () => {
  const ME = "n_" + "0123456789abcdef".repeat(2);
  const YOU = "n_" + "fedcba9876543210".repeat(2);
  const MY_ROOM = `rooms/dm_bianca_${ME}`;
  const YOUR_ROOM = `rooms/dm_bianca_${YOU}`;
  const me = () => member(ME, "현석");
  const dmMsg = (over: Record<string, unknown> = {}) => msg({ nickname: "현석", uid: ME, ...over });

  async function seed(path: string, data: Record<string, unknown>) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), data);
    });
  }

  test("주인은 자기 방 메시지를 읽고 만든다", async () => {
    await seed(`${MY_ROOM}/messages/m1`, { text: "x", nickname: "비앙카", uid: "bot_bianca", createdAt: Timestamp.now() });
    await assertSucceeds(getDocs(collection(me(), `${MY_ROOM}/messages`)));
    await assertSucceeds(addDoc(collection(me(), `${MY_ROOM}/messages`), dmMsg()));
  });
  test("다른 페르소나 id 의 방도 주인이면 허용", async () =>
    assertSucceeds(addDoc(collection(me(), `rooms/dm_nobody_${ME}/messages`), dmMsg())));
  test("만들기 필드 검사는 단체방과 같다", async () => {
    const c = collection(me(), `${MY_ROOM}/messages`);
    await assertFails(addDoc(c, dmMsg({ nickname: "영희" })));
    await assertFails(addDoc(c, dmMsg({ uid: YOU })));
    await assertFails(addDoc(c, dmMsg({ text: "" })));
    await assertFails(addDoc(c, dmMsg({ text: "a".repeat(501) })));
    await assertFails(addDoc(c, dmMsg({ createdAt: Timestamp.fromMillis(0) })));
    await assertFails(addDoc(c, dmMsg({ extra: 1 })));
    await assertFails(addDoc(c, dmMsg({ replyTo: "x" })));
  });
  test("수정·삭제는 거부", async () => {
    await seed(`${MY_ROOM}/messages/mine`, { text: "x", nickname: "현석", uid: ME, createdAt: Timestamp.now() });
    await assertFails(updateDoc(doc(me(), `${MY_ROOM}/messages/mine`), { text: "y" }));
    await assertFails(deleteDoc(doc(me(), `${MY_ROOM}/messages/mine`)));
  });
  test("남의 방은 읽기·만들기 거부", async () => {
    await seed(`${YOUR_ROOM}/messages/m1`, { text: "x", nickname: "민수", uid: YOU, createdAt: Timestamp.now() });
    await assertFails(getDocs(collection(me(), `${YOUR_ROOM}/messages`)));
    await assertFails(getDoc(doc(me(), `${YOUR_ROOM}/messages/m1`)));
    await assertFails(addDoc(collection(me(), `${YOUR_ROOM}/messages`), dmMsg()));
    await assertFails(addDoc(collection(me(), `${YOUR_ROOM}/messages`), dmMsg({ uid: YOU })));
  });
  test("방 id 앞뒤에 다른 글자가 붙으면 거부", async () => {
    await assertFails(getDocs(collection(me(), `rooms/dm_bianca_${ME}x/messages`)));
    await assertFails(getDocs(collection(me(), `rooms/xdm_bianca_${ME}/messages`)));
    await assertFails(getDocs(collection(me(), `rooms/dm__${ME}/messages`)));
  });
  test("member 가 아니면 자기 uid 방이어도 거부", async () => {
    const out = env.authenticatedContext(ME).firestore();
    await assertFails(getDocs(collection(out, `${MY_ROOM}/messages`)));
    await assertFails(getDocs(collection(anon(), `${MY_ROOM}/messages`)));
  });
  test("claudeJobs 는 주인만 읽고 쓰기는 전부 거부", async () => {
    await seed(`${MY_ROOM}/claudeJobs/j1`, { status: "pending", createdAt: Timestamp.now(), askedBy: ME, personaId: "bianca" });
    await seed(`${YOUR_ROOM}/claudeJobs/j1`, { status: "pending", createdAt: Timestamp.now(), askedBy: YOU, personaId: "bianca" });
    await assertSucceeds(getDocs(query(collection(me(), `${MY_ROOM}/claudeJobs`), where("status", "==", "pending"))));
    await assertFails(getDocs(collection(me(), `${YOUR_ROOM}/claudeJobs`)));
    await assertFails(setDoc(doc(me(), `${MY_ROOM}/claudeJobs/x`), { status: "pending" }));
    await assertFails(updateDoc(doc(me(), `${MY_ROOM}/claudeJobs/j1`), { status: "done" }));
  });
  test("그 밖의 rooms 경로는 거부", async () => {
    await assertFails(getDoc(doc(me(), MY_ROOM)));
    await assertFails(setDoc(doc(me(), MY_ROOM), { x: 1 }));
    await assertFails(getDocs(collection(me(), `${MY_ROOM}/other`)));
    await assertFails(setDoc(doc(me(), `${MY_ROOM}/other/x`), { x: 1 }));
    await assertFails(getDocs(collection(me(), "rooms/x/other")));
  });
});

describe("memories·memoryState", () => {
  test("읽기·쓰기 전부 거부", async () => {
    await assertFails(getDocs(collection(member(), "memories")));
    await assertFails(getDoc(doc(member(), "memories/main_m1")));
    await assertFails(setDoc(doc(member(), "memories/main_m1"), { text: "x" }));
    await assertFails(getDoc(doc(member(), "memoryState/main")));
    await assertFails(setDoc(doc(member(), "memoryState/main"), { lastJudgedAt: Timestamp.now() }));
  });
});

describe("affinity", () => {
  const ME = "n_" + "0123456789abcdef".repeat(2);
  const YOU = "n_" + "fedcba9876543210".repeat(2);
  const MINE = `main_bianca_${ME}`;
  const YOURS = `main_bianca_${YOU}`;
  const me = () => member(ME, "현석");

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `affinity/${MINE}`), { roomId: "main", personaId: "bianca", uid: ME, score: 60, updatedAt: Timestamp.now() });
      await setDoc(doc(db, `affinity/${YOURS}`), { roomId: "main", personaId: "bianca", uid: YOU, score: 40, updatedAt: Timestamp.now() });
    });
  });

  test("내 문서는 읽는다", async () => assertSucceeds(getDoc(doc(me(), `affinity/${MINE}`))));
  test("남의 문서는 못 읽는다", async () => assertFails(getDoc(doc(me(), `affinity/${YOURS}`))));
  test("비회원은 내 uid 문서도 못 읽는다", async () => assertFails(getDoc(doc(outsider(), `affinity/${MINE}`))));
  test("내 uid 로 거른 쿼리는 허용, 거르지 않은 쿼리는 거부", async () => {
    await assertSucceeds(getDocs(query(collection(me(), "affinity"), where("uid", "==", ME), where("roomId", "==", "main"))));
    await assertFails(getDocs(collection(me(), "affinity")));
  });
  test("쓰기는 전부 거부", async () => {
    await assertFails(setDoc(doc(me(), `affinity/${MINE}`), { roomId: "main", personaId: "bianca", uid: ME, score: 100 }));
    await assertFails(updateDoc(doc(me(), `affinity/${MINE}`), { score: 100 }));
    await assertFails(deleteDoc(doc(me(), `affinity/${MINE}`)));
    await assertFails(setDoc(doc(me(), `affinity/main_lucia_${ME}`), { roomId: "main", personaId: "lucia", uid: ME, score: 100 }));
  });
});
