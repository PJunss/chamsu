import { describe, expect, test } from "vitest";
import { lastMessagePreview, lastMessageTime } from "@/lib/lastMessage";

describe("lastMessagePreview", () => {
  test("봇이 쓴 메시지는 본문 그대로", () => {
    expect(lastMessagePreview({ uid: "bot_bianca", text: "늦지 말거라." }, "me")).toBe("늦지 말거라.");
  });
  test("내가 쓴 메시지는 앞에 나: 를 붙인다", () => {
    expect(lastMessagePreview({ uid: "me", text: "고마워" }, "me")).toBe("나: 고마워");
  });
  test("줄바꿈과 이어진 공백은 공백 하나로 잇는다", () => {
    expect(lastMessagePreview({ uid: "bot_lucia", text: "넣었어.\n\n11월 14일   21:00 " }, "me")).toBe("넣었어. 11월 14일 21:00");
  });
  test("메시지가 없으면 안내 문구", () => {
    expect(lastMessagePreview(null, "me")).toBe("대화를 시작해 보세요");
  });
});

describe("lastMessageTime", () => {
  /** 한국 시간 2026-11-13 14:00 */
  const now = new Date("2026-11-13T05:00:00Z");

  test("오늘이면 한국 시간 시:분", () => {
    expect(lastMessageTime(new Date("2026-11-13T04:03:00Z"), now)).toBe("13:03");
    expect(lastMessageTime(new Date("2026-11-12T15:00:00Z"), now)).toBe("00:00");
  });
  test("한국 날짜로 하루 전이면 어제", () => {
    expect(lastMessageTime(new Date("2026-11-12T14:59:00Z"), now)).toBe("어제");
    expect(lastMessageTime(new Date("2026-11-11T15:00:00Z"), now)).toBe("어제");
  });
  test("그보다 전이고 올해면 월.일", () => {
    expect(lastMessageTime(new Date("2026-11-11T14:59:00Z"), now)).toBe("11.11");
    expect(lastMessageTime(new Date("2026-01-05T03:00:00Z"), now)).toBe("1.5");
  });
  test("작년이면 연.월.일", () => {
    expect(lastMessageTime(new Date("2025-12-31T03:00:00Z"), now)).toBe("2025.12.31");
  });
  test("내 시계보다 조금 앞선 서버 시각은 오늘로 본다", () => {
    expect(lastMessageTime(new Date("2026-11-13T05:00:30Z"), now)).toBe("14:00");
  });
  test("시각을 모르면 빈 문자열", () => {
    expect(lastMessageTime(null, now)).toBe("");
  });
});
