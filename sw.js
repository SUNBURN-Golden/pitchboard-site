/* build.py replaces the version with a hash of the worker and app assets. */
'use strict';
const PREFIX = 'pitchboard-';
const CACHE = PREFIX + '__CACHE_VERSION__';
// Reminder state survives asset cache updates. localStorage remains the user's source of truth.
const REMINDER_CACHE = PREFIX + 'reminders-v1';
const STATE_URL = new URL('/__pitchboard_reminders__', self.location.origin).href;
const SHELL = ['/app/', '/static/style.css', '/static/app.js', '/manifest.webmanifest',
  '/static/icon.svg', '/static/icon-192.png', '/static/icon-512.png', '/outlets.json', '/calls.json'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path =>
    new Request(path, {cache: 'reload'})
  ))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key =>
    key.startsWith(PREFIX) && key !== CACHE && key !== REMINDER_CACHE
  ).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
async function networkFirst(request, navigation) {
  const cache = await caches.open(CACHE);
  try {
    // A stalled connection must not prevent offline data or the app shell from loading.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response;
    try { response = await fetch(request, {signal: controller.signal, cache: 'no-cache'}); }
    finally { clearTimeout(timeout); }
    if (response.ok) {
      // Cache storage can fill up; a successful live response is still usable.
      try { await cache.put(request, response.clone()); } catch (_) { /* Best-effort offline copy. */ }
      return response;
    }
    if (response.status < 500) return response;
    throw new Error('Server unavailable');
  } catch (_) {
    const saved = await cache.match(request, {ignoreSearch: navigation});
    if (saved) return saved;
    if (navigation) return cache.match('/app/');
    return new Response(JSON.stringify({error: 'Offline and no saved data available'}), {
      status: 503, headers: {'Content-Type': 'application/json'}
    });
  }
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/outlets.json' || url.pathname === '/calls.json') {
    event.respondWith(networkFirst(event.request, false));
  } else if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, true));
  } else if (url.pathname.startsWith('/static/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const saved = await cache.match(event.request);
      if (saved) return saved;
      const response = await fetch(event.request);
      if (response.ok) {
        try { await cache.put(event.request, response.clone()); } catch (_) { /* Best-effort offline copy. */ }
      }
      return response;
    }));
  }
});
async function readState() {
  const cache = await caches.open(REMINDER_CACHE);
  const saved = await cache.match(STATE_URL);
  return saved ? saved.json() : {reminders: [], notified: {}};
}
async function writeState(state) {
  const cache = await caches.open(REMINDER_CACHE);
  await cache.put(STATE_URL, new Response(JSON.stringify(state), {headers: {'Content-Type': 'application/json'}}));
}
function validReminder(item) {
  return item && typeof item.id === 'string' && typeof item.title === 'string' &&
    typeof item.outlet === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.deadline);
}
async function checkReminders() {
  if (!('Notification' in self) || Notification.permission !== 'granted') return;
  const state = await readState();
  if (!state.reminders.length) return;
  // Consult current calls so changed or withdrawn deadlines do not send stale alerts.
  let calls;
  try {
    const response = await networkFirst(new Request(new URL('/calls.json', self.location.origin)), false);
    if (response.ok) calls = (await response.json()).calls;
  } catch (_) { /* Use the saved reminder snapshot if data is unavailable. */ }
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  for (const reminder of state.reminders) {
    const call = Array.isArray(calls) ? calls.find(item => item.id === reminder.id) : reminder;
    if (!call || !validReminder(call)) continue;
    const remaining = (Date.parse(call.deadline + 'T00:00:00Z') - today) / 86400000;
    // Older workers saved only the latest deadline. Preserve it when adding history.
    const previous = state.notified[call.id];
    const delivered = Array.isArray(previous) ? previous : typeof previous === 'string' ? [previous] : [];
    if (remaining < 0 || remaining > 3 || !Number.isFinite(remaining) || delivered.includes(call.deadline)) continue;
    try {
      await self.registration.showNotification(call.outlet + ': deadline reminder', {
        body: call.title + (remaining === 0 ? ' — closes today.' : ' — closes in ' + remaining + ' day' + (remaining === 1 ? '.' : 's.')),
        icon: '/static/icon-192.png', badge: '/static/icon-192.png',
        tag: 'pitchboard-' + call.id + '-' + call.deadline,
        data: {url: '/app/#call-' + encodeURIComponent(call.id)}
      });
      state.notified = {...state.notified, [call.id]: [...delivered, call.deadline]};
      await writeState(state);
    } catch (_) { /* Keep it eligible for a later check if the browser cannot show it. */ }
  }
}
// Serialize messages and periodic events to avoid duplicate alerts across tabs.
let reminderQueue = Promise.resolve();
function enqueue(work) {
  reminderQueue = reminderQueue.catch(() => {}).then(work);
  return reminderQueue;
}
self.addEventListener('message', event => {
  if (!event.source || !event.source.url || new URL(event.source.url).origin !== self.location.origin) return;
  if (!event.data || event.data.type !== 'SYNC_REMINDERS' || !Array.isArray(event.data.reminders)) return;
  event.waitUntil(enqueue(async () => {
    const state = await readState();
    state.reminders = event.data.reminders.filter(validReminder);
    // Keep sent markers for cancelled reminders so toggling a button never repeats an alert.
    await writeState(state);
    await checkReminders();
  }));
});
self.addEventListener('periodicsync', event => {
  if (event.tag === 'pitchboard-reminders') event.waitUntil(enqueue(checkReminders));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(event.notification.data?.url || '/app/', self.location.origin);
    if (url.origin !== self.location.origin || url.pathname !== '/app/') return;
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const existing = windows.find(client => new URL(client.url).pathname === '/app/');
    if (existing) { await existing.navigate(url.href); await existing.focus(); }
    else await self.clients.openWindow(url.href);
  })());
});
