/**
 * Or BaGag — Service Worker
 * v3.21.86 — REAL offline caching so the app opens with no internet at all.
 *
 * Strategy:
 *   • Precache the app shell on install (index.html, catalog, icons, CDN scripts).
 *   • HTML  → network-first (fresh when online, cached copy when offline).
 *   • Static assets + whitelisted CDN/fonts → cache-first + runtime caching.
 *   • Supabase / Google / GitHub APIs → NOT intercepted (always network; never cache
 *     auth or data responses).
 *   • Bump CACHE_NAME each deploy → old caches are purged on activate.
 */

const CACHE_NAME = 'or-bagag-cache-v3.21.86';

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
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'
];

// Hosts whose GET responses we are allowed to cache (besides same-origin).
const CDN_HOSTS = ['code.iconify.design', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

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
    event.respondWith(networkFirst(req));            // fresh HTML online, cached HTML offline
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
