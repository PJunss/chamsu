import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  /** 리디렉션 로그인 처리 경로를 앱 도메인에서 받아 Firebase 호스팅으로 넘긴다. */
  async rewrites() {
    return [{ source: "/__/auth/:path*", destination: "https://chamsu.firebaseapp.com/__/auth/:path*" }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
