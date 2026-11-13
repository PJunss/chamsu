import { expect, test } from "vitest";
import { NAV_ITEMS, activeNav } from "@/components/shell/nav";

test("메뉴는 홈, 캘린더, Chat, 설정 순서", () => {
  expect(NAV_ITEMS.map((n) => [n.label, n.href, n.needsLogin])).toEqual([
    ["홈", "/", false],
    ["캘린더", "/calendar", false],
    ["Chat", "/chat", true],
    ["설정", "/settings", true],
  ]);
});
test("경로로 현재 메뉴를 정한다", () => {
  expect(activeNav("/")).toBe("home");
  expect(activeNav("/calendar")).toBe("calendar");
  expect(activeNav("/chat")).toBe("chat");
  expect(activeNav("/chat/bianca")).toBe("chat");
  expect(activeNav("/settings")).toBe("settings");
  expect(activeNav("/chatter")).toBe("home");
});
