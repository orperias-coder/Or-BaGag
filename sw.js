/**
 * Or BaGag — Service Worker
 * v3.48.1 — cache bump (תיקון: מיזוג ללקוח קיים לא נעצר באמצע בגלל תמונה כפולה).
 * v3.48.0 — cache bump (אנדרואיד: share_target, כפתור-התקנה, הרשאת-התראות בהקשה).
 * v3.47.0 — cache bump (תמונות-היום: קבוצת-יום מוצעת לשיוך ללקוח בהקשה אחת).
 * v3.46.0 — cache bump (הגשר: לידים ותמונות מוואטסאפ נוחתים בטלפון דרך הדרייב).
 * v3.45.0 — cache bump (שלב 0: ניקוי, כפילות-אנשים, ביטול-מיזוג, תאריך-צילום, עקביות-מסמכים).
 * v3.44.5 — cache bump (עקביות: כרטיס-לקוח, ארכיון במסך-האנשים, וחזרה מכל 'מסך ישן').
 * v3.44.4 — cache bump (גיבוי כולל waBlocklist+todayDone; ארכיון מסתיר גם ממסך-היום).
 * v3.44.3 — cache bump (תיקוני ביקורת-קוהרנטיות: הצעות סגורות, בחירת-הצעה, חוב שנבלע, ארכיון, והנחה שנעלמה).
 * v3.44.2 — cache bump (כסף של הצעה שהתקבלה לא נעלם עד תחילת-העבודה).
 * v3.44.1 — cache bump (תיקון-רגרסיה: סימוני "טופל" נשמרים ונטענים).
 * v3.44.0 — cache bump (סבב אור: "טופל" במסך-היום, הלשונית "לקוחות", "ההצעה התקבלה" → מסך הכסף).
 * v3.43.0 — cache bump (שיקום שלב 1-5: ניווט אחד, מסך "היום", זרימת-ההצעה, כרטיס-הלקוח ותיקון הדוחות).
 * v3.42.0 — cache bump (אפשרות GIS ממשלתי (govmap) בגיליון-הניווט של כתובת — ראה comment ליד APP_VERSION).
 * v3.37.0 — cache bump (תיקון-כפילויות בקליטת וואטסאפ-לידים: reason==='ai_client' (לקוח קיים,
 *   38 מתוך 53 בנתוני-אמת) יוצר רק משימות, לא ליד חדש — ראה comment ליד APP_VERSION).
 * v3.36.0 — cache bump (Task 12 מתוכנית "וואטסאפ-לידים": hook #waimport=<localhost-url>,
 *   שלושה צ'יפי-סיווג AI חדשים, item.raw.problem→description, item.raw.tasks→mt_create).
 * v3.25.2 — cache bump + RESTORE-03 fix: staleWhileRevalidateHTML() never actually refreshed the
 *   cache. It handed the cached Response's body to the browser to consume, THEN tried to
 *   `cached.clone()` it for the old/new diff — cloning after the body is already being read
 *   throws, and that throw was swallowed by a silent catch, so cache.put()/the update postMessage
 *   never ran. Every deploy since v3.23.6 that didn't also bump CACHE_NAME silently never reached
 *   installed users. Fixed: clone BEFORE handing the response off, and write both './' and
 *   './index.html' cache entries (a PWA opened from its home-screen icon requests the bare scope
 *   root, not .../index.html — only bumping the latter left the former stuck on the old version
 *   forever even after the clone-order fix).
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

const CACHE_NAME = 'or-bagag-cache-v3.58.0';

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

  // v3.25.2 (RESTORE-03) — clone the cached Response HERE, before it's handed off below to be
  // consumed by the browser. `cached.clone()` throws ("body is already used") once the original
  // Response's body has started being read — which is exactly what happens the instant `cached`
  // is returned from this function and the browser renders it. Cloning too late meant this whole
  // background-refresh block silently no-op'd (the throw was swallowed by the catch below) on
  // every real navigation — cache.put() never ran, so a new deploy never actually landed for an
  // installed user no matter how many times they refreshed.
  const cachedForDiff = cached.clone();

  event.waitUntil((async () => {
    try {
      const net = await fetch(req);
      if (net && net.ok) {
        const [oldText, newText] = await Promise.all([cachedForDiff.text(), net.clone().text()]);
        const verRe = /const APP_VERSION = '([^']*)'/;
        const oldV = (oldText.match(verRe) || [])[1];
        const newV = (newText.match(verRe) || [])[1];
        const changed = (oldV && newV) ? (oldV !== newV) : (oldText !== newText);
        // v3.25.2 (RESTORE-03) — write BOTH cache keys. A PWA opened from its home-screen icon
        // navigates to the bare scope root ('./', per manifest.json start_url), not '.../index.html'
        // — SHELL precaches them as two separate Cache Storage entries, so bumping only
        // './index.html' left './' permanently stuck on whatever version was first installed.
        await Promise.all(['./', './index.html'].map(k => cache.put(k, net.clone())));
        if (changed) {
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          for (const client of clients) client.postMessage({ type: 'app-update-ready' });
        }
      }
    } catch (e) { console.warn('[SW] revalidate failed', e); }   // v3.25.2 — was a silent no-op catch that hid the clone-order bug above
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

/* v3.48.0 (שלב 3) — קליטת share_target.
   כשאור משתף תמונה מוואטסאפ אל "אור בגג", אנדרואיד שולח POST אל ./?share=1 עם
   הקבצים. ה-POST הזה חייב להיקלט כאן: אין שרת, וניווט-POST רגיל היה מחזיר 405.
   הקבצים נשמרים ב-Cache Storage תחת מפתח ידוע, והדף נטען מיד עם ?share=1 —
   האפליקציה שולפת אותם משם בעלייה ומציעה לאור לשייך אותם.
   שום דבר לא נשלח לשום מקום; הכל נשאר על המכשיר. */
const SHARE_CACHE = 'or-bagag-share';
const SHARE_KEY   = '/__shared_payload__';

async function handleShareTarget(event){
  try{
    const form = await event.request.formData();
    const files = form.getAll('photos').filter(f => f && f.size);
    const meta  = { title: form.get('title') || '', text: form.get('text') || '',
                    url: form.get('url') || '', count: files.length, at: Date.now() };
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(SHARE_KEY, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
    for(let i = 0; i < files.length; i++){
      await cache.put(`${SHARE_KEY}/${i}`, new Response(files[i], {
        headers: { 'Content-Type': files[i].type || 'image/jpeg' } }));
    }
  }catch(e){ /* שיתוף שנכשל לא ישבור את הפתיחה — הדף ייטען בלי מטען */ }
  return Response.redirect('./?share=1', 303);
}

self.addEventListener('fetch', event => {
  // v3.48.0 — share_target: POST אל השורש עם ?share=1
  if (event.request.method === 'POST' && new URL(event.request.url).searchParams.has('share')) {
    event.respondWith(handleShareTarget(event));
    return;
  }
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
