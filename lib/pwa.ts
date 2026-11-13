export const ICON_SIZES = [192, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];

/** "192"·"512" 만 숫자로 바꾼다. 그 밖은 null. */
export function parseIconSize(raw: string): IconSize | null {
  return ICON_SIZES.find((s) => String(s) === raw) ?? null;
}

/** 설치형 웹앱 정보. 아이콘은 /icons/{크기} 가 그려 주는 글자 아이콘이다. */
export const MANIFEST: {
  name: string;
  short_name: string;
  start_url: string;
  display: "standalone";
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: "image/png" }[];
} = {
  name: "이터널리턴 챗봇",
  short_name: "ER 챗봇",
  start_url: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#27272a",
  icons: ICON_SIZES.map((s) => ({ src: `/icons/${s}`, sizes: `${s}x${s}`, type: "image/png" })),
};
