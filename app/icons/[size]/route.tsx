import { ImageResponse } from "next/og";
import { parseIconSize } from "@/lib/pwa";

/** 앱 아이콘: 어두운 바탕에 흰 글자 "ER" 을 그린 정사각 PNG. 크기는 192·512 만 받는다. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = parseIconSize((await params).size);
  if (size === null) return new Response("not found", { status: 404 });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#27272a",
          color: "#ffffff",
          fontSize: size * 0.42,
          fontWeight: 700,
        }}
      >
        ER
      </div>
    ),
    { width: size, height: size },
  );
}
