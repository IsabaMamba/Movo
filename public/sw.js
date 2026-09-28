/**
 * Movo's service worker. It does two things and nothing else: show a push as
 * a notification, and open /avisos when the notification is tapped. No
 * caching, no offline mode — those are separate decisions with their own
 * failure modes, and a service worker that caches is one that can serve a
 * stale app to somebody for weeks.
 *
 * The push carries no details (ADR 0007): the text is fixed, and the only
 * destination is a path inside this origin.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  const title = typeof data.title === 'string' ? data.title : 'Movo';
  const body = typeof data.body === 'string' ? data.body : 'Tienes un aviso nuevo en Movo.';
  // Only a path on this origin: a push must not be able to open anywhere else.
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/avisos';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      // One notification standing for "you have notices", replaced rather than
      // stacked: the list of what happened is in /avisos, not here.
      tag: 'movo-avisos',
      renotify: true,
      lang: 'es',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? '/avisos', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.navigate(target).then((c) => (c ?? client).focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
