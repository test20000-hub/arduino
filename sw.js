// 서비스 워커 기본 설정
const CACHE_NAME = 'dday-app-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // 네트워크 요청 처리 (ddays.json 데이터는 항상 최신으로 가져옴)
  if (e.request.url.includes('ddays.json')) {
    e.respondWith(fetch(e.request));
  } else {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
});
