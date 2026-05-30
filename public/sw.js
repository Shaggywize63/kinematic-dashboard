/* Kinematic web-push service worker.
 *
 * Receives push events dispatched by the backend (web-push lib with VAPID),
 * surfaces them as system notifications, and routes the click into the
 * dashboard tab — focusing an existing tab when possible, opening a new
 * one otherwise.
 *
 * Payload shape (matches webPush.service.ts):
 *   { title: string, body: string, url?: string, tag?: string }
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Kinematic', body: '', url: '/dashboard' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) {
    payload.body = event.data ? event.data.text() : '';
  }
  const options = {
    body: payload.body || '',
    icon: '/logo-mark.png',
    badge: '/logo-mark.png',
    data: { url: payload.url || '/dashboard' },
    tag: payload.tag || undefined,
    renotify: !!payload.tag,
  };
  event.waitUntil(self.registration.showNotification(payload.title || 'Kinematic', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      // Prefer focusing an existing dashboard tab and routing it client-side.
      for (const c of clientsArr) {
        if ('focus' in c && c.url.includes('/dashboard')) {
          c.focus();
          if ('navigate' in c) c.navigate(targetUrl);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
