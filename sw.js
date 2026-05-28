/**
 * Or BaGag — Service Worker
 * v3.21.20 — bumped after hero fade-overlay z-index fix.
 * Added fetch passthrough so Chrome recognizes this as an installable PWA. Without a fetch
 * handler the "Install app" prompt is suppressed and the user only gets "Add to home screen".
 */

const CACHE_NAME = 'or-bagag-v3.21.20';

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
