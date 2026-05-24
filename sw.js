/**
 * Or BaGag — Service Worker (minimal, notifications only)
 * v3.9.91 — Web Share Target removed (caused issues, not needed)
 */

const CACHE_NAME = 'or-bagag-v3.9.91';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

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
