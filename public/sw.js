// 설치형 웹앱 요건을 채우는 서비스 워커. 새 버전은 바로 켜지고, fetch 처리와 캐시는 두지 않는다.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
