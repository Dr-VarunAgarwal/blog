/* Brick Game service worker — makes it work offline once visited.
   Network-first and ALWAYS revalidating (cache: 'no-cache') so a new deploy is never masked by the
   browser's own HTTP cache; the Cache Storage copy is only the offline fallback.
   Bump VERSION (and ?v= in index.html, BUILD in engine.js, --build in brick.css) on every change. */
const VERSION = 'brick-v22';
const FILES = ['./', 'index.html', 'brick.css?v=22', 'games.js?v=22', 'mascots.js?v=22', 'engine.js?v=22', 'back.js?v=22', 'welcome.js?v=22', 'fonts/orbitron-800.woff2', 'pcb.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(f => fetch(f, { cache: 'reload' }).then(r => r.ok && c.put(f, r)).catch(() => { })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
