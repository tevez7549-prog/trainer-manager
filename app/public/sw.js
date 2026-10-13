/* Trainer Manager service worker
 *
 * - App shell (index.html) : network-first, falls back to the cached copy when offline.
 * - /_expo/static/*         : cache-first (file names carry a content hash, so a new deploy = new names).
 * - icons, exercise images, vendor scripts, Google Fonts : stale-while-revalidate.
 * - Supabase / any other API : NOT touched by this worker → always straight from the network,
 *   so the app never shows old data without knowing.
 *
 * Bump VERSION when this file's caching rules change. Every deploy is picked up anyway, because the
 * shell is network-first and old bundle files are pruned whenever a newer index.html is seen.
 */
const VERSION = 'tm-v2';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const RUNTIME = `${VERSION}-runtime`;
const RUNTIME_MAX = 150;
const SHELL_URL = '/';
const PRECACHE = ['/manifest.webmanifest', '/icon-192.png?v=2', '/icon-512.png?v=2', '/apple-touch-icon.png?v=2'];

/** script/link files that index.html points at (the app bundle and its css) */
function assetsIn(html) {
  const out = new Set();
  const re = /(?:src|href)="(\/_expo\/static\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.add(m[1]);
  return [...out];
}

/** Store a fresh index.html, its bundle files, and drop bundle files that are no longer used */
async function storeShell(res) {
  const html = await res.clone().text();
  const shell = await caches.open(SHELL);
  await shell.put(SHELL_URL, res.clone());
  const wanted = assetsIn(html);
  const stat = await caches.open(STATIC);
  await Promise.all(wanted.map(async u => {
    if (!(await stat.match(u))) {
      try { const r = await fetch(u); if (r.ok) await stat.put(u, r); } catch { /* next time */ }
    }
  }));
  // prune old bundles only when we know which ones are current (entry files)
  if (wanted.length) {
    const keep = new Set(wanted.map(u => new URL(u, self.location.origin).href));
    for (const req of await stat.keys()) {
      const p = new URL(req.url).pathname;
      if (p.startsWith('/_expo/static/js/web/entry-') && !keep.has(req.url)) await stat.delete(req);
    }
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const stat = await caches.open(STATIC);
    await Promise.all(PRECACHE.map(u => stat.add(u).catch(() => {})));
    try {
      const res = await fetch(SHELL_URL, { cache: 'no-store' });
      if (res.ok) await storeShell(res);
    } catch { /* installed while offline: the shell is cached on the next visit */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, STATIC, RUNTIME]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch { /* ok */ } }
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirstShell(event) {
  try {
    const res = (await event.preloadResponse) || (await fetch(event.request, { cache: 'no-store' }));
    // only a real app page is kept (not a 404/500 or a redirect to somewhere else)
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) event.waitUntil(storeShell(res.clone()));
    return res;
  } catch {
    const cached = await caches.match(SHELL_URL, { cacheName: SHELL });
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="background:#0E0F10;color:#EDEDED;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">' +
      '<div>ยังไม่ได้เชื่อมต่ออินเทอร์เน็ต<br><small style="opacity:.6">You are offline</small></div>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) { const c = await caches.open(STATIC); c.put(req, res.clone()); }
  return res;
}

async function staleWhileRevalidate(event) {
  const req = event.request;
  const c = await caches.open(RUNTIME);
  const cached = await c.match(req);
  const fresh = fetch(req).then(async res => {
    if (res.ok || res.type === 'opaque') { await c.put(req, res.clone()); await trim(RUNTIME, RUNTIME_MAX); }
    return res;
  }).catch(() => cached);
  if (cached) { event.waitUntil(fresh); return cached; }
  return fresh;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fonts: the css and the font files rarely change
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  // Anything else on another origin (Supabase API, auth, storage, LINE, Google …) → plain network
  if (url.origin !== self.location.origin) return;
  // the worker and the manifest must always come fresh from the server
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest') return;

  if (req.mode === 'navigate') {
    // OAuth callbacks carry tokens in the URL: let them hit the network untouched
    if (url.search.includes('code=') || url.hash.includes('access_token')) return;
    event.respondWith(networkFirstShell(event));
    return;
  }
  if (url.pathname.startsWith('/_expo/static/')) { event.respondWith(cacheFirst(req)); return; }
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?|ttf|js|css)$/.test(url.pathname)) { event.respondWith(staleWhileRevalidate(event)); return; }
  // other same-origin GETs: network
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
