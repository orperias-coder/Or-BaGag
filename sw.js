/**
 * Or BaGag — Service Worker
 * v3.9.86 — Web Share Target support + notifications
 *
 * Cache strategy: network-first (we want fresh app on every load — SW just enables PWA + share target)
 */

const CACHE_NAME = 'or-bagag-v3.9.87';
const SHARE_DB = 'orBagagVisits';
const SHARE_STORE = 'media';
const INCOMING_STORE = 'incoming-share';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// ─── Notification click (existing v3.9.5 behavior) ───
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

// ─── Web Share Target — intercept POST to /share ───
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isShare = event.request.method === 'POST' &&
                  (url.pathname.endsWith('/share') || url.pathname.endsWith('/Or-BaGag/share'));
  if(!isShare) return; // pass-through for all other requests

  event.respondWith((async () => {
    try {
      const formData = await event.request.formData();
      const files = formData.getAll('media') || [];
      const incoming = [];
      for(const file of files){
        if(!file || typeof file === 'string') continue;
        if(!file.type || !file.type.startsWith('image/')) continue;
        incoming.push({
          id: 'in-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
          blob: file,
          name: file.name || 'photo.jpg',
          type: file.type,
          ts: Date.now()
        });
      }
      if(incoming.length){
        await saveIncomingMedia(incoming);
      }
      // Redirect to app with incoming flag
      return Response.redirect('./?incoming=' + incoming.length, 303);
    } catch(err){
      console.error('[SW] share intake failed:', err);
      return Response.redirect('./?incoming=0&err=1', 303);
    }
  })());
});

// ─── IndexedDB helper to stash incoming media ───
function openShareDB(){
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(SHARE_DB, 2);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if(!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', {keyPath:'k'});
      if(!d.objectStoreNames.contains('media')) d.createObjectStore('media', {keyPath:'key'});
    };
    r.onsuccess = e => resolve(e.target.result);
    r.onerror = () => reject(r.error);
  });
}

async function saveIncomingMedia(items){
  const db = await openShareDB();
  // Each item gets a key prefix "incoming-" so the app can find them
  return new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    const store = tx.objectStore('media');
    items.forEach(it => {
      store.put({
        key: 'incoming-' + it.id,
        blob: it.blob,
        meta: { source: 'share', name: it.name, type: it.type, incomingId: it.id },
        ts: it.ts
      });
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
