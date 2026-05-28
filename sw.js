/**
 * Or BaGag — Service Worker
 * v3.21.36 — visit summary emoji → iconify swap + selector bug fix in
 * the closure 'add bullet' focus path (selectors hadn't been updated to
 * the v3.21.34 magazine bullets).
 * SW itself has no caching — IDB handles data, browser handles HTML.
 */

const CACHE_NAME = 'or-bagag-v3.21.39';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Network passthrough. Chrome requires *some* fetch handler for PWA installability.
// We don't cache anything here — the app's own IndexedDB handles data persistence,
// and we don't want the SW to serve stale HTML.
self.addEventListener('fetch', event => {
  // Just let the browser handle it normally. Existence of the handler is what matters.
  return;
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const action = event.notification.data && event.notification.data.action;
  event.waitUntil(
    self.clients.matchAll({type:'window', includeUncontrolled:true}).then(clients => {
      for(const client of clients){
        if('focus' in client){
          client.postMessage({type:'notification-click', action});
          return client.focus();
        }
      }
      if(self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
