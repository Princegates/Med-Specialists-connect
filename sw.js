// Makes the website work like an app: it opens fast, keeps working when the signal drops, and can be installed.
// It never touches the staff console or any /api call, and pages always come from the network first so people
// never see an out-of-date price list or form.
const VERSION = 'v12';
const STATIC = 'static-' + VERSION, PAGES = 'pages-' + VERSION;
const SHELL = ['/offline.html', '/assets/logo-icon.png', '/assets/icon-192.png', '/assets/fonts/newsreader-latin.woff2', '/assets/fonts/atkinson-next-latin.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// A page the server redirected (for example /offline.html to /offline) cannot be handed back to the browser as it is.
const plain = (res) => (res && res.redirected ? res.blob().then((b) => new Response(b, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })) : res);

const skip = (url) => url.origin !== location.origin || /^\/(api|admin|functions|migrations|docs|tests)\b/.test(url.pathname) || url.pathname === '/sw.js';

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (skip(url)) return;

  // Pages: network first, then the last copy we saw, then the offline page.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(PAGES).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/offline.html')).then(plain)));
    return;
  }
  // Pictures and fonts: from the phone if we have them, otherwise fetch and keep.
  if (/\.(webp|png|jpg|jpeg|svg|woff2)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(STATIC).then((c) => c.put(req, copy)); } return res; })));
    return;
  }
  // Styles and scripts: network first so updates arrive at once, cached copy when offline.
  if (/\.(css|js|webmanifest)$/.test(url.pathname)) {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(STATIC).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match(req)));
  }
});
