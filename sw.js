/**
 * Or BaGag — Service Worker
 * v3.24.4 — cache bump (מהפך-הניווט N1-N5 הושלם: סרגל-ניווט קבוע, מסך-בית "גגות", גיליון-יצירה,
 *   מסך-חיפוש, רכזת-הגג בפרויקט, שערי-יצירה בכספים — ראה CHANGELOG.md v3.24.0-3.24.4).
 * v3.23.6 — PERF-01: HTML network-first → stale-while-revalidate (instant open from cache,
 *   background refresh, postMessage to clients when a new version actually landed).
 *   PERF-04: api.iconify.design allowlisted (cache-first) so icons already seen work offline.
 * v3.22.44 — cache bump (מהירות-טעינה: changelog לקובץ-צד + פונטים לא-חוסמים).
 * v3.22.43 — cache bump ("סכום משוער" עקבי לפני-מע"מ).
 * v3.22.42 — cache bump (תוספת גישה/סיכון אופציונלית בהצעה).
 * v3.22.41 — cache bump (משפט "עבודות בלתי-צפויות" בהצעות).
 * v3.22.22 — cache bump (audit 7.5: CACHE_NAME was stuck on v3.21.86 → frozen CDN libs).
 * v3.21.86 — REAL offline caching so the app opens with no internet at all.
 *
 * Strategy:
 *   • Precache the app shell on install (index.html, catalog, icons, CDN scripts).
 *   • HTML  → stale-while-revalidate: serve the cached copy immediately, refresh in the
 *     background, and tell open tabs when the refreshed copy actually differs (new
 *     APP_VERSION). Falls back to network-first only on first install (no cached copy yet).
 *   • Static assets + whitelisted CDN/fonts → cache-first + runtime caching.
 *   • Supabase / Google / GitHub APIs → NOT intercepted (always network; never cache
 *     auth or data responses).
 *   • Bump CACHE_NAME each deploy → old caches are purged on activate.
 */

const CACHE_NAME = 'or-bagag-cache-v3.24.6';

// Same-origin shell + immutable CDN deps. Failures tolerated (allSettled) so a flaky
// CDN during install never blocks the SW from installing.
const SHELL = [
  './',
  './index.html',
  './or-bagag-catalog.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/dist/umd/supabase.js'
];

// Hosts whose GET responses we are allowed to cache (besides same-origin).
// v3.23.6 (PERF-04): api.iconify.design serves the actual icon SVG data (code.iconify.design
// is just the loader script) — without it, an icon whose screen was never opened online stays
// blank offline even though the loader itself is cached. Icon data is immutable per query
// (same icon set = same bytes), so it's safe to cache-first like the other CDN hosts.
const CDN_HOSTS = ['code.iconify.design', 'api.iconify.design', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(SHELL.map(u => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  try {
    const net = await fetch(req);
    if (net && net.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, net.clone()).catch(() => {});
    }
    return net;
  } catch (e) {
    const cached = (await caches.match(req)) || (await caches.match('./index.html')) || (await caches.match('./'));
    if (cached) return cached;
    throw e;
  }
}

// v3.23.6 (PERF-01) — stale-while-revalidate for the app HTML itself. The whole app lives in
// one inline <script> the HTML parser can't run past until the file is fully downloaded, so
// network-first genuinely gated interactivity on a full network round-trip (~648KB gzip) on
// EVERY online open, even though a usable copy already sat in Cache Storage. Now: respond from
// cache instantly, and refresh in the background (kept alive via event.waitUntil so the SW
// isn't terminated before the fetch completes). Only notify open tabs when the content actually
// changed (compared by APP_VERSION, falling back to a full-text diff) — not on every open.
async function staleWhileRevalidateHTML(event) {
  const req = event.request;
  const cache = await caches.open(CACHE_NAME);
  // ignoreSearch: PWA shortcuts (manifest "shortcuts", ?view=...) and other query strings on
  // the same document must share the ONE cached HTML entry, not each fork off their own
  // multi-MB duplicate.
  const cached = await cache.match(req, { ignoreSearch: true });

  if (!cached) {
    return networkFirst(req);            // first install / cache not populated yet
  }

  event.waitUntil((async () => {
    try {
      const net = await fetch(req);
      if (net && net.ok) {
        const [oldText, newText] = await Promise.all([cached.clone().text(), net.clone().text()]);
        const verRe = /const APP_VERSION = '([^']*)'/;
        const oldV = (oldText.match(verRe) || [])[1];
        const newV = (newText.match(verRe) || [])[1];
        const changed = (oldV && newV) ? (oldV !== newV) : (oldText !== newText);
        await cache.put('./index.html', net.clone());
        if (changed) {
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          for (const client of clients) client.postMessage({ type: 'app-update-ready' });
        }
      }
    } catch (e) { /* offline — nothing to revalidate with, keep serving the cached copy */ }
  })());

  return cached;                          // instant response, no network wait
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const net = await fetch(req);
    if (net && (net.ok || net.type === 'opaque')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, net.clone()).catch(() => {});
    }
    return net;
  } catch (e) {
    return cached || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // writes (Supabase POST etc.) → straight to network
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  const sameOrigin = url.origin === self.location.origin;
  const cacheable = sameOrigin || CDN_HOSTS.includes(url.hostname);
  if (!cacheable) return;                            // Supabase / Google / GitHub APIs → network, never cached

  const wantsHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (sameOrigin && wantsHTML) {
    event.respondWith(staleWhileRevalidateHTML(event)); // instant cache + background refresh + update notice
  } else {
    event.respondWith(cacheFirst(req));              // assets / CDN / fonts
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const action = event.notification.data && event.notification.data.action;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'notification-click', action });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
