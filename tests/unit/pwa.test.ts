import { expect, test } from "vitest";
import { MANIFEST, parseIconSize } from "@/lib/pwa";

test("아이콘 크기는 192 와 512 만 받는다", () => {
  expect(parseIconSize("192")).toBe(192);
  expect(parseIconSize("512")).toBe(512);
  expect(parseIconSize("64")).toBeNull();
  expect(parseIconSize("192px")).toBeNull();
});
test("manifest 는 이름과 standalone, 두 아이콘을 가진다", () => {
  expect(MANIFEST).toMatchObject({ name: "이터널리턴 챗봇", display: "standalone", start_url: "/" });
  expect(MANIFEST.icons).toEqual([
    { src: "/icons/192", sizes: "192x192", type: "image/png" },
    { src: "/icons/512", sizes: "512x512", type: "image/png" },
  ]);
});
