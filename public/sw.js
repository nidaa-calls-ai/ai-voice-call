/* nidaa service worker: Web Push -> fullscreen incoming-call notification */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'مكالمة جديدة', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'مكالمة من المساعد';
  const options = {
    body: payload.body || 'المهمة خلصت وتحتاج مراجعة',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.callId || 'nidaa-call',
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 250, 500, 250, 1000],
    data: { url: payload.url || '/phone', callId: payload.callId },
    actions: [{ action: 'open', title: 'فتح المكالمة' }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/phone';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an open app window and navigate it to the call screen
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then(() => {
            if ('navigate' in client) return client.navigate(targetUrl);
          });
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
