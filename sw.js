// or_bagag Service Worker — v3.9.21
// Required for PWA installation. Handles notifications and basic offline support.

const CACHE_VERSION = 'or-bagag-v3.9.21';

// Install: skip waiting so the new SW takes over immediately
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate: claim clients so the new SW controls existing pages
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
    ])
  );
});

// Fetch: network-first strategy. App is a single HTML file; offline support
// will come in a future version. For now, this just lets Chrome see we
// have a fetch handler (required for "installable" status).
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  // Pass through to network
  event.respondWith(
    fetch(event.request).catch(() => {
      // If offline, try cache
      return caches.match(event.request);
    })
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const action = event.notification.data && event.notification.data.action;
  event.waitUntil(
    self.clients.matchAll({type:'window', includeUncontrolled:true}).then(clients => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({type:'notification-click', action});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
