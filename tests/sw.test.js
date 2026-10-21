/* Run with node --test tests/sw.test.js; no packages required. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');

function worker() {
  const origin = 'https://pitchboard.test';
  const stores = new Map(), listeners = {}, notifications = [];
  let online = true, responseStatus = 200, calls = [];
  const key = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request, options) {
          let url = key(request);
          if (options?.ignoreSearch) {
            url = [...store.keys()].find(item => item.split('?')[0] === url.split('?')[0]);
          }
          return store.get(url)?.clone();
        },
        async put(request, response) { store.set(key(request), response.clone()); },
        async addAll(paths) { for (const path of paths) store.set(key(path), new Response('shell')); }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  const fixed = new Date('2026-10-28T12:00:00Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
  }
  const context = vm.createContext({URL, Request, Response, AbortController, setTimeout, clearTimeout,
    Date: Clock, Notification: {permission: 'granted'}, caches,
    fetch: async request => {
      if (!online) throw new Error('Offline');
      return new Response(new URL(request.url || request, origin).pathname === '/calls.json' ?
        JSON.stringify({calls}) : 'fresh asset', {status: responseStatus});
    },
    self: {
      location: {origin},
      addEventListener(type, handler) { listeners[type] = handler; },
      registration: {async showNotification(title, options) { notifications.push({title, ...options}); }},
      clients: {async claim() {}}, async skipWaiting() {}
    }
  });
  context.self.Notification = context.Notification;
  vm.runInContext(readFileSync('sw.js', 'utf8').replace('__CACHE_VERSION__', 'test'), context);
  async function dispatch(type, values) {
    let pending;
    listeners[type]({...values, waitUntil(promise) { pending = promise; }, respondWith(promise) { pending = promise; }});
    return pending;
  }
  return {context, stores, caches, notifications,
    setCalls(value) { calls = value; },
    setOnline(value) { online = value; },
    setStatus(value) { responseStatus = value; },
    async sync(reminders) {
      await dispatch('message', {source: {url: origin + '/app/'}, data: {type: 'SYNC_REMINDERS', reminders}});
    },
    periodic() { return dispatch('periodicsync', {tag: 'pitchboard-reminders'}); },
    fetch(path, mode = 'cors') {
      return dispatch('fetch', {request: {url: origin + path, method: 'GET', mode}});
    },
    activate() { return dispatch('activate', {}); }
  };
}
function call(id, deadline) { return {id, deadline, title: id + ' submission call', outlet: 'Outlet'}; }

test('only the inclusive three-day window notifies, once per call deadline across events', async () => {
  const w = worker();
  const calls = [call('expired', '2026-10-27'), call('today', '2026-10-28'), call('three-days', '2026-10-31'),
    call('too-early', '2026-11-01'), call('rolling', null)];
  w.setCalls(calls);
  await Promise.all([w.sync(calls), w.sync(calls), w.periodic()]);
  assert.deepEqual(w.notifications.map(n => n.tag), ['pitchboard-today-2026-10-28', 'pitchboard-three-days-2026-10-31']);
  await w.sync([]);
  await w.sync(calls);
  assert.equal(w.notifications.length, 2);
});

test('cancelled, withdrawn, and changed deadlines use current call data', async () => {
  const w = worker(), original = call('changed', '2026-10-30');
  w.setCalls([original]);
  await w.sync([original]);
  assert.equal(w.notifications.length, 1);
  w.setCalls([call('changed', '2026-10-31')]);
  await w.periodic();
  assert.equal(w.notifications.length, 2);
  assert.match(w.notifications[1].tag, /2026-10-31$/);
  await w.sync([]);
  await w.periodic();
  assert.equal(w.notifications.length, 2);
  w.setCalls([]);
  await w.sync([call('withdrawn', '2026-10-29')]);
  assert.equal(w.notifications.length, 2);
});

test('denied permission does not mark reminders as delivered, and failures can retry', async () => {
  const w = worker(), reminder = call('retry', '2026-10-29');
  w.setCalls([reminder]);
  w.context.Notification.permission = 'denied';
  await w.sync([reminder]);
  assert.equal(w.notifications.length, 0);
  w.context.Notification.permission = 'granted';
  const show = w.context.self.registration.showNotification;
  w.context.self.registration.showNotification = async () => { throw new Error('Unavailable'); };
  await w.periodic();
  w.context.self.registration.showNotification = show;
  await w.periodic();
  assert.equal(w.notifications.length, 1);
});

test('static assets are cache-first, data is network-first with an offline fallback', async () => {
  const w = worker(), cache = await w.caches.open('pitchboard-test');
  await cache.put('/static/app.js', new Response('saved script'));
  await cache.put('/outlets.json', new Response('old data'));
  assert.equal(await (await w.fetch('/static/app.js')).text(), 'saved script');
  assert.equal(await (await w.fetch('/outlets.json')).text(), 'fresh asset');
  w.setOnline(false);
  assert.equal(await (await w.fetch('/outlets.json')).text(), 'fresh asset');
  await cache.put('/app/', new Response('offline app'));
  assert.equal(await (await w.fetch('/app/?q=review', 'navigate')).text(), 'offline app');
  assert.equal((await w.fetch('/calls.json')).status, 503);
});

test('server errors fall back to saved data and activation preserves reminders', async () => {
  const w = worker(), cache = await w.caches.open('pitchboard-test');
  await cache.put('/calls.json', new Response(JSON.stringify({calls: [call('offline', '2026-10-29')]})));
  await w.caches.open('pitchboard-old');
  await w.caches.open('other-app');
  w.setStatus(503);
  await w.sync([call('offline', '2026-10-29')]);
  assert.equal(w.notifications.length, 1);
  await w.activate();
  assert.deepEqual((await w.caches.keys()).sort(), ['other-app', 'pitchboard-reminders-v1', 'pitchboard-test']);
});
