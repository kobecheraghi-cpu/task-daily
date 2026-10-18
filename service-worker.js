/* Service worker for https://kobecheraghi-cpu.github.io/task-daily/
   It caches only the app shell (files). It cannot read or change localStorage,
   so updating it never touches the saved data under the key "study_app_v1".
   To publish a new app version: edit index.html, then bump CACHE_VERSION. */
const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'task-daily-shell-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so updates arrive), with a short timeout and offline fallback.
function networkFirst(request, fallbackUrl) {
  return new Promise(resolve => {
    let settled = false;
    const fromCache = () => caches.match(request, { ignoreSearch: true })
      .then(r => r || (fallbackUrl && caches.match(fallbackUrl)))
      .then(r => r || new Response('آفلاین هستید و این صفحه هنوز ذخیره نشده است.',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    const timer = setTimeout(() => { if (!settled) { settled = true; fromCache().then(resolve); } }, 4000);
    fetch(request).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, copy)).catch(() => {});
      }
      if (!settled) { settled = true; clearTimeout(timer); resolve(res); }
    }).catch(() => {
      if (!settled) { settled = true; clearTimeout(timer); fromCache().then(resolve); }
    });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL('./', self.location).pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }
  // Static files: serve cached copy fast, refresh it in the background.
  event.respondWith(
    caches.match(req).then(cached => {
      const refresh = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
