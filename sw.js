/* Service worker của "Việc của tôi"
 * QUAN TRỌNG: mỗi lần sửa BẤT KỲ file nào (index.html, manifest.json, icon...),
 * hãy tăng CACHE_VERSION (v1 -> v2 -> v3...). Trình duyệt chỉ nhận bản mới
 * khi nội dung file sw.js thay đổi.
 */
const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'viec-cua-toi-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

// Các file cần lưu để chạy offline (đường dẫn tương đối, chạy được trong thư mục con)
const REQUIRED = ['./', './index.html'];
const OPTIONAL = ['./manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];

// Cài đặt: tải và lưu các file vào cache.
// File bắt buộc lỗi -> cài đặt thất bại. File tùy chọn lỗi (vd. chưa có PNG) -> bỏ qua.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // cache: 'reload' để bỏ qua bộ nhớ đệm HTTP, luôn lấy bản mới nhất từ máy chủ
    await Promise.all(REQUIRED.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await Promise.all(OPTIONAL.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
  })());
});

// Kích hoạt: xóa các cache phiên bản cũ
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Trang gửi lệnh khi người dùng bấm "Cập nhật"
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Hết thời gian chờ mạng thì dùng bản trong cache (tránh treo khi mạng chập chờn)
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then((res) => { clearTimeout(timer); resolve(res); },
                        (err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // không xử lý request ra ngoài

  // Trang HTML: ưu tiên mạng (luôn thấy bản mới khi online), offline thì lấy từ cache
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const res = await fetchWithTimeout(req, 5000);
        if (res && res.ok) cache.put('./index.html', res.clone());
        return res;
      } catch (e) {
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               new Response('Bạn đang offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // File tĩnh (icon, manifest...): ưu tiên cache, không có thì tải mạng và lưu lại
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  })());
});
