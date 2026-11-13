import type { Metadata } from "next";
import { Roboto_Condensed } from "next/font/google";
import "./globals.css";

const condensed = Roboto_Condensed({ weight: "700", subsets: ["latin"], variable: "--font-roboto-condensed" });

export const metadata: Metadata = { title: "이터널리턴 챗봇" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={condensed.variable}>
      <body className="min-h-dvh bg-white text-zinc-900 antialiased">{children}</body>
    </html>
  );
}
