/* ═══════════════════════════════════════════════
   CSE 2027 — Service Worker v4.0
   Offline-first, push notifications, background sync
═══════════════════════════════════════════════ */
const CACHE_NAME = 'cse2027-v4';
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './splash.png'
];

/* ── INSTALL: pre-cache all static assets ── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('SW: Some assets failed to cache', err);
      });
    })
  );
});

/* ── ACTIVATE: clean old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
      self.clients.claim()
    ])
  );
});

/* ── FETCH: cache-first for assets, network-first for navigation ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

/* ── PUSH NOTIFICATIONS ── */
self.addEventListener('push', event => {
  let data = { title: 'CSE 2027', body: 'Time to study! 📚', icon: './icon-192.png' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch(e) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './icon-192.png',
      badge: './icon-192.png',
      tag: 'cse2027-study',
      renotify: true,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: { url: './index.html', timestamp: Date.now() },
      actions: [
        { action: 'open', title: '📖 Open App' },
        { action: 'dismiss', title: '✕ Dismiss' }
      ]
    })
  );
});

/* ── NOTIFICATION CLICK ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('./index.html');
    })
  );
});

/* ── MESSAGE HANDLER (from app) ── */
self.addEventListener('message', event => {
  const { type, payload } = event.data || {};
  switch(type) {
    case 'SCHEDULE_REMINDER':
      scheduleLocalReminder(payload);
      break;
    case 'SHOW_NOTIFICATION':
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: payload.tag || 'cse2027',
        vibrate: [100, 50, 100],
        data: { url: './index.html' }
      });
      break;
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
  }
});

/* ── LOCAL REMINDER SCHEDULING ── */
const scheduledReminders = new Map();

function scheduleLocalReminder({ id, title, body, triggerTime }) {
  if (scheduledReminders.has(id)) {
    clearTimeout(scheduledReminders.get(id));
  }
  const delay = triggerTime - Date.now();
  if (delay <= 0) return;
  const timer = setTimeout(() => {
    self.registration.showNotification(title, {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: `reminder-${id}`,
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
      actions: [
        { action: 'open', title: '📖 Start Studying' },
        { action: 'snooze', title: '⏰ Snooze 10m' }
      ]
    });
    scheduledReminders.delete(id);
  }, delay);
  scheduledReminders.set(id, timer);
}

/* ── BACKGROUND SYNC ── */
self.addEventListener('sync', event => {
  if (event.tag === 'study-sync') {
    event.waitUntil(handleBackgroundSync());
  }
});

async function handleBackgroundSync() {
  // Notify all clients that sync happened
  const allClients = await clients.matchAll({ type: 'window' });
  allClients.forEach(client => client.postMessage({ type: 'SYNC_COMPLETE' }));
}

/* ── PERIODIC BACKGROUND SYNC ── */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'daily-reminder') {
    event.waitUntil(sendDailyReminder());
  }
});

async function sendDailyReminder() {
  await self.registration.showNotification('CSE 2027 — Study Reminder 🔔', {
    body: 'Your daily study session awaits! Keep the streak alive! 🔥',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'daily-reminder',
    vibrate: [300, 100, 300],
    requireInteraction: true,
    actions: [
      { action: 'open', title: '📚 Study Now' },
      { action: 'dismiss', title: '✕ Later' }
    ]
  });
}
