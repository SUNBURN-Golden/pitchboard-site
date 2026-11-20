import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import worker, { sign, verify } from '../worker/_worker.js';

const SESSION = 'test-session';
const CRON = 'test-cron';
const ORIGIN = 'https://pitchboard.soulbound.co.kr';
const INTERNAL = { 'X-Pitchboard-Cron': CRON };
const DATE = new Date('2026-11-20T16:00:00Z'); // November 21 in Seoul.
const YEAR = 2026;
const PREFS = { genres: [], kinds: [], regions: [], min_pay_usd: 0, include_unstated_pay: true, enabled: true };
const migration = name => readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8');
const REPORT = { outlet_id: 1, amount: 100, currency: 'USD', unit: 'piece', piece_type: 'review', year: YEAR, website: '' };

function d1(context, migrated) {
  const sqlite = new DatabaseSync(':memory:');
  context.after(() => sqlite.close());
  sqlite.exec(migration('0001_members.sql'));
  if (migrated) sqlite.exec(migration('0002_alerts_and_pay_reports.sql'));
  return {
    prepare(sql) {
      function statement(params) {
        const stmt = () => sqlite.prepare(sql);
        return {
          bind: (...values) => statement(values),
          first: async () => stmt().get(...params) ?? null,
          all: async () => ({ results: stmt().all(...params) }),
          run: async () => ({ meta: { changes: stmt().run(...params).changes } }),
          execute() {
            const prepared = stmt();
            return prepared.columns().length ? { results: prepared.all(...params) } :
              { results: [], meta: { changes: prepared.run(...params).changes } };
          }
        };
      }
      return statement([]);
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(statement => statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

function setup(context, { migrated = true } = {}) {
  context.mock.timers.enable({ apis: ['Date'], now: DATE });
  const feed = {
    calls: [],
    genres: ['books', 'arts', 'poetry'],
    kinds: ['Reading window', 'Competition', 'Rolling call'],
    regions: ['worldwide', 'US', 'Canada', 'UK', 'other'],
    outlets: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, { pay_usd_max: i ? null : 200 }]))
  };
  const env = {
    DB: d1(context, migrated),
    GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-client-secret', SESSION_SECRET: SESSION,
    ALERTS_CRON_SECRET: CRON, RESEND_API_KEY: 'test-resend', ALERTS_SENDING: 'on', IP_HASH_SALT: 'test-salt',
    ASSETS: {
      async fetch(req) {
        if (new URL(req.url).pathname === '/alerts-feed.json') return Response.json(feed);
        return new Response('asset');
      }
    }
  };
  async function request(path, { method = 'GET', headers = {}, body } = {}) {
    if (body !== undefined) headers = { 'Content-Type': 'application/json', ...headers };
    return worker.fetch(new Request(ORIGIN + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    }), env);
  }
  async function member(sub) {
    await env.DB.prepare('INSERT INTO members (google_sub, email) VALUES (?, ?)').bind(sub, sub + '@example.com').run();
    return { Cookie: 'pb_session=' + await sign(SESSION, { sub, exp: Date.now() / 1000 + 86400 }) };
  }
  return {
    env, feed, request, member,
    prefs(headers, body = PREFS) {
      return request('/api/alerts/prefs', { method: 'POST', headers, body });
    },
    dispatch(query = '') {
      return request('/api/internal/alerts/dispatch' + query, { method: 'POST', headers: INTERNAL });
    },
    report(fields = {}, ip = '192.0.2.1') {
      return request('/api/pay-reports', {
        method: 'POST', headers: { 'CF-Connecting-IP': ip }, body: { ...REPORT, ...fields }
      });
    },
    async summary(outlet = 1) {
      const response = await request('/api/pay-reports/summary?outlet=' + outlet);
      assert.equal(response.status, 200);
      return response.json();
    }
  };
}

const call = (id, fields = {}) => ({
  id, title: id, outlet: 'Example Outlet', outlet_id: 1, outlet_url: '/outlets/example-outlet/',
  url: 'https://example.com/call', kind: 'Reading window', genres: ['books'], regions: ['US', 'worldwide'],
  worldwide: true, pay_usd: 200, pay: '$200', opens: '2026-11-21', deadline: '2026-11-27', ...fields
});

test('signed sessions and existing Google sign-in routes', async context => {
  const { request, env } = setup(context);
  const token = await sign(SESSION, { sub: '1', exp: Date.now() / 1000 + 60 });
  assert.equal((await verify(SESSION, token)).sub, '1');
  assert.equal(await verify('other', token), null);
  assert.equal(await verify(SESSION, token.slice(0, -2) + 'xx'), null);
  assert.equal(await verify(SESSION, await sign(SESSION, { exp: 1 })), null);

  const google = await request('/api/auth/google');
  assert.equal(google.status, 302);
  const location = new URL(google.headers.get('Location'));
  assert.equal(location.host, 'accounts.google.com');
  assert.equal(location.searchParams.get('redirect_uri'), ORIGIN + '/api/auth/callback');
  const state = google.headers.get('Set-Cookie').split(';')[0].split('=')[1];
  assert.equal((await verify(SESSION, state)).nl, 1);
  const optOut = await request('/api/auth/google?newsletter=0');
  assert.equal((await verify(SESSION, optOut.headers.get('Set-Cookie').split(';')[0].split('=')[1])).nl, 0);
  const callback = await request('/api/auth/callback?code=c&state=bad', { headers: { Cookie: 'pb_oauth=' + state } });
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('Location'), /error=state/);
  assert.equal((await request('/api/me')).status, 401);
  assert.equal((await worker.fetch(new Request(ORIGIN + '/api/auth/google'), { ASSETS: env.ASSETS })).status, 503);
  assert.equal((await request('/api/nope')).status, 404);
  assert.equal(await (await request('/')).text(), 'asset');
  const logout = await request('/api/auth/logout', { method: 'POST' });
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
});

test('member can save and load preferences; invalid inputs and cross-origin requests fail', async context => {
  const app = setup(context);
  const headers = await app.member('critic');
  assert.equal((await app.request('/api/alerts/prefs')).status, 401);
  assert.equal((await app.prefs({})).status, 401);
  assert.deepEqual(await (await app.request('/api/alerts/prefs', { headers })).json(), { ...PREFS, enabled: false });
  const prefs = { ...PREFS, genres: ['books'], kinds: ['Reading window'], regions: ['worldwide'], min_pay_usd: 125, include_unstated_pay: false };
  assert.deepEqual(await (await app.prefs({ ...headers, Origin: ORIGIN }, prefs)).json(), prefs);
  assert.deepEqual(await (await app.request('/api/alerts/prefs', { headers })).json(), prefs);
  const invalid = [
    { genres: ['unknown'] }, { regions: ['XX'] }, { kinds: 'Reading window' }, { kinds: ['Fake'] },
    { min_pay_usd: -1 }, { min_pay_usd: '10' }, { enabled: 'true' }, { include_unstated_pay: 1 }
  ];
  for (const change of invalid) assert.equal((await app.prefs(headers, { ...prefs, ...change })).status, 400);
  assert.equal((await app.prefs(headers, null)).status, 400);
  assert.equal((await app.prefs({ ...headers, Origin: 'https://other.example' }, prefs)).status, 403);
  assert.equal((await app.prefs({ ...headers, 'Content-Type': 'text/plain' }, prefs)).status, 403);
  assert.equal((await app.prefs({ ...headers, Origin: ORIGIN, 'Content-Type': 'text/plain' }, prefs)).status, 200);
  assert.deepEqual(await (await app.request('/api/alerts/prefs', { headers })).json(), prefs);
});

test('internal routes require the secret; migrate is idempotent and backups include missing tables', async context => {
  const { env, member, request } = setup(context, { migrated: false });
  await member('backed-up');
  const endpoints = [
    ['POST', '/api/internal/migrate'], ['GET', '/api/internal/backup'], ['GET', '/api/internal/pay-reports'],
    ['POST', '/api/internal/pay-reports/1'], ['POST', '/api/internal/alerts/dispatch']
  ];
  for (const [method, route] of endpoints) {
    assert.equal((await request(route, { method })).status, 401);
    assert.equal((await request(route, { method, headers: { 'X-Pitchboard-Cron': 'wrong-key' } })).status, 401);
  }
  delete env.ALERTS_CRON_SECRET;
  assert.equal((await request('/api/internal/alerts/dispatch', { method: 'POST', headers: INTERNAL })).status, 503);
  env.ALERTS_CRON_SECRET = CRON;
  const before = await (await request('/api/internal/backup', { headers: INTERNAL })).json();
  assert.equal(before.members[0].email, 'backed-up@example.com');
  for (const table of ['alert_prefs', 'alert_sends', 'pay_reports', 'alert_call_seen']) assert.deepEqual(before[table], []);
  for (let i = 0; i < 2; i++) {
    assert.equal((await request('/api/internal/migrate', { method: 'POST', headers: INTERNAL })).status, 200);
  }
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results;
  assert.ok(Object.keys(before).every(name => tables.some(row => row.name === name)));
  assert.deepEqual(await (await request('/api/internal/backup', { headers: INTERNAL })).json(), before);
});

test('migration endpoint embeds the checked-in SQL', () => {
  const source = readFileSync(new URL('../worker/_worker.js', import.meta.url), 'utf8');
  assert.equal(source.split('const SCHEMA_0002 = `\n')[1].split('`;')[0], migration('0002_alerts_and_pay_reports.sql'));
});

test('dispatch matches filters and Seoul date windows, groups email, deduplicates, and unsubscribes', async context => {
  const app = setup(context);
  const session = await app.member('writer');
  assert.equal((await app.prefs(session, {
    ...PREFS, genres: ['books'], kinds: ['Reading window'], regions: ['worldwide'], min_pay_usd: 150,
    include_unstated_pay: false
  })).status, 200);
  app.feed.calls = [
    call('Matches <books>'), call('Closes today', { opens: null, deadline: '2026-11-21' }),
    call('Seven days old', { opens: '2026-11-14', deadline: '2026-12-21' }),
    call('Eight days old', { opens: '2026-11-13', deadline: '2026-12-21' }),
    call('Closed yesterday', { deadline: '2026-11-20' }),
    call('First dispatch skips this', { opens: null, deadline: null }),
    call('Future open', { opens: '2026-11-28', deadline: '2026-12-21' }),
    call('Below minimum', { pay_usd: 100 }), call('Unstated', { pay_usd: null }),
    call('Wrong genre', { genres: ['arts'] }), call('Wrong kind', { kind: 'Competition' }),
    call('US only', { regions: ['US'], worldwide: false })
  ];
  const messages = [];
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    messages.push({ url, options, data: JSON.parse(options.body) });
    return Response.json({ id: 'sent' });
  });

  const first = await app.dispatch();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { matched: 1, sent: 1, skipped: 0, remaining: 0, dry_run: false, sending_enabled: true });
  assert.equal(messages.length, 1);
  const { url, options, data } = messages[0];
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer test-resend');
  assert.equal(data.from, 'The Pitchboard <pitchboard@soulbound.co.kr>');
  assert.equal(data.reply_to, 'pitchboard@soulbound.co.kr');
  assert.deepEqual(data.to, ['writer@example.com']);
  assert.match(data.text, /Matches <books>[\s\S]*Deadline in 3–7 days/);
  assert.match(data.text, /Closes today[\s\S]*Deadline within 2 days/);
  assert.match(data.text, /Seven days old[\s\S]*Opened/);
  assert.doesNotMatch(data.text, /Eight days old|First dispatch skips this|Closed yesterday|Future open|Wrong|Below minimum|Unstated|US only/);
  assert.match(data.text, /https:\/\/pitchboard.soulbound.co.kr\/outlets\/example-outlet\//);
  assert.match(data.html, /Matches &lt;books&gt;/);
  assert.equal(data.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  const unsub = new URL(data.headers['List-Unsubscribe'].slice(1, -1));
  assert.ok(data.text.includes(unsub.href));

  assert.equal((await (await app.dispatch()).json()).sent, 0);
  assert.equal(messages.length, 1);
  const backup = await (await app.request('/api/internal/backup', { headers: INTERNAL })).json();
  assert.equal(backup.alert_sends.length, 5);

  const link = unsub.pathname + unsub.search;
  assert.equal((await app.request(link + 'bad')).status, 400);
  const confirmation = await app.request(link);
  assert.equal(confirmation.status, 200);
  const html = await confirmation.text();
  assert.match(html, /Custom email alerts are off/);
  const head = html.split('</head>')[0];
  for (const icon of [
    '<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png">'
  ]) {
    assert.ok(head.includes(icon), icon);
  }
  assert.equal((await (await app.request('/api/alerts/prefs', { headers: session })).json()).enabled, false);
  await app.prefs(session);
  assert.equal((await app.request(link, { method: 'POST', body: { 'List-Unsubscribe': 'One-Click' } })).status, 200);
  assert.equal((await (await app.request('/api/alerts/prefs', { headers: session })).json()).enabled, false);
});

test('dry runs and disabled sending leave baselines and dedup rows untouched', async context => {
  const app = setup(context);
  await app.prefs(await app.member('writer'));
  app.feed.calls = [call('candidate', { opens: null })];
  const resend = context.mock.method(globalThis, 'fetch', async () => assert.fail('must not call Resend'));
  assert.deepEqual(await (await app.dispatch('?dry_run=1')).json(),
    { matched: 1, sent: 0, skipped: 1, remaining: 0, dry_run: true, sending_enabled: true });
  app.env.ALERTS_SENDING = 'off';
  assert.equal((await (await app.dispatch()).json()).sending_enabled, false);
  app.env.ALERTS_SENDING = 'on';
  delete app.env.RESEND_API_KEY;
  assert.deepEqual(await (await app.dispatch()).json(),
    { matched: 1, sent: 0, skipped: 1, remaining: 0, dry_run: false, sending_enabled: false });
  assert.equal(resend.mock.callCount(), 0);
  const backup = await (await app.request('/api/internal/backup', { headers: INTERNAL })).json();
  assert.equal(backup.alert_prefs[0].started_at, null);
  assert.deepEqual(backup.alert_call_seen, []);
  assert.deepEqual(backup.alert_sends, []);
});

test('a reminder can send once in each deadline band', async context => {
  const app = setup(context);
  await app.prefs(await app.member('writer'));
  app.feed.calls = [call('Eight days away', { opens: '2026-10-01', deadline: '2026-11-29' })];
  const resend = context.mock.method(globalThis, 'fetch', async () => new Response(null));
  for (const [daysLater, sends] of [[0, 0], [1, 1], [5, 0], [6, 1], [8, 0], [9, 0]]) {
    context.mock.timers.setTime(DATE.getTime() + daysLater * 86400000);
    assert.equal((await (await app.dispatch()).json()).sent, sends);
  }
  assert.equal(resend.mock.callCount(), 2);
});

test('new rolling calls send once, country filters include worldwide, and failed sends can retry', async context => {
  const app = setup(context);
  await app.prefs(await app.member('writer'), { ...PREFS, regions: ['Canada'] });
  app.feed.calls = [call('Existing rolling', { opens: null, deadline: null })];
  const emails = [];
  const resend = context.mock.method(globalThis, 'fetch', async (url, options) => {
    emails.push(JSON.parse(options.body).text);
    return new Response(null, { status: emails.length === 1 ? 503 : 200 });
  });
  assert.equal((await (await app.dispatch()).json()).sent, 0);
  context.mock.timers.setTime(DATE.getTime() + 1000); // A new listing can appear on the same Seoul day.
  app.feed.calls.push(
    call('New worldwide', { opens: null, deadline: null, pay_usd: null }),
    call('New Canadian', { opens: null, deadline: null, worldwide: false, regions: ['Canada'] }),
    call('New US only', { opens: null, deadline: null, worldwide: false, regions: ['US'] })
  );
  assert.equal((await (await app.dispatch()).json()).remaining, 1);
  assert.deepEqual((await app.env.DB.prepare('SELECT * FROM alert_sends').all()).results, []);
  context.mock.timers.setTime(DATE.getTime() + 86400000);
  const concurrent = await Promise.all([app.dispatch(), app.dispatch()]);
  const results = await Promise.all(concurrent.map(response => response.json()));
  assert.equal(results.reduce((total, result) => total + result.sent, 0), 1);
  assert.equal(resend.mock.callCount(), 2);
  assert.match(emails[1], /New worldwide[\s\S]*New Canadian/);
  assert.doesNotMatch(emails[1], /Existing rolling|New US only/);
  assert.equal((await (await app.dispatch()).json()).matched, 0);
});

test('dispatch limits outgoing requests and can pick up deferred members on the next invocation', async context => {
  const app = setup(context);
  for (let i = 0; i < 16; i++) await app.prefs(await app.member('writer' + i));
  app.feed.calls = [call('Matching call')];
  const resend = context.mock.method(globalThis, 'fetch', async () => new Response(null));
  assert.deepEqual(await (await app.dispatch()).json(),
    { matched: 16, sent: 15, skipped: 0, remaining: 1, dry_run: false, sending_enabled: true });
  assert.equal((await (await app.dispatch()).json()).sent, 1);
  assert.equal(resend.mock.callCount(), 16);
});

test('pay report validation, anonymous honeypot, conversion, and per-outlet and daily limits', async context => {
  const app = setup(context);
  const invalid = [
    { outlet_id: 900 }, { amount: 0 }, { amount: '100' }, { currency: 'ZZZ' }, { amount: 20001 },
    { amount: 4, unit: 'word', currency: 'GBP' }, { unit: 'hour' }, { piece_type: 'poem' },
    { year: 2017 }, { year: YEAR + 1 }
  ];
  for (const fields of invalid) assert.equal((await app.report(fields)).status, 400, JSON.stringify(fields));
  const bait = await app.report({ website: 'spam', amount: 0 });
  assert.equal(bait.status, 200);
  assert.deepEqual(await bait.json(), { ok: true });
  const db = app.env.DB;
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM pay_reports').first()).count, 0);
  assert.equal((await app.report({ currency: 'GBP' })).status, 200);
  const row = await db.prepare('SELECT * FROM pay_reports').first();
  assert.equal(row.usd, 133);
  assert.equal(row.amount, 100);
  assert.equal(row.ip_hash.length, 43);
  assert.notEqual(row.ip_hash, '192.0.2.1');
  const attempts = await Promise.all(Array.from({ length: 3 }, () => app.report()));
  assert.deepEqual(attempts.map(response => response.status).sort(), [200, 200, 429]);
  for (let i = 2; i <= 8; i++) assert.equal((await app.report({ outlet_id: i })).status, 200);
  assert.equal((await app.report({ outlet_id: 9 })).status, 429);
  context.mock.timers.setTime(DATE.getTime() + 86400000);
  assert.equal((await app.report({ outlet_id: 9 })).status, 200);
  assert.equal((await app.report()).status, 429);
  context.mock.timers.setTime(DATE.getTime() + 31 * 86400000);
  assert.equal((await app.report()).status, 200);
  const review = await (await app.request('/api/internal/pay-reports', { headers: INTERNAL })).json();
  assert.equal(review.distinct_connections['1'], 1);
  assert.equal(review.reports.some(report => Object.hasOwn(report, 'ip_hash')), false);
  assert.equal(JSON.stringify(review).includes(row.ip_hash), false);
});

test('public pay aggregates require corroboration per unit; reviewers can approve outliers and reject reports', async context => {
  const app = setup(context);
  const moderate = (id, status) => app.request('/api/internal/pay-reports/' + id, {
    method: 'POST', headers: INTERNAL, body: { status }
  });
  const submit = async (fields, ip) => assert.equal((await app.report(fields, '192.0.2.' + ip)).status, 200);
  await submit({}, 1);
  await submit({ amount: 120 }, 1);
  assert.deepEqual(await app.summary(), { shown: false });
  await submit({ amount: 130, year: YEAR - 1 }, 2);
  await submit({ amount: 900 }, 3); // Erratic against both reference rates.
  await submit({ amount: 0.5, unit: 'word' }, 4); // A different unit cannot use the piece reports.
  await submit({ amount: 110, year: YEAR - 3 }, 5); // Older than the automatic window.
  await submit({ amount: 100, currency: 'other' }, 6);
  const wordOutlier = { amount: 0.1, unit: 'word', outlet_id: 2 };
  await submit(wordOutlier, 7);
  await submit({ ...wordOutlier, amount: 0.5 }, 8); // No published figure, but exceeds the word median.
  assert.deepEqual(await app.summary(2), { shown: false });

  const review = await (await app.request('/api/internal/pay-reports', { headers: INTERNAL })).json();
  assert.equal(review.reports.find(report => report.id === 4).outlier, 1);
  assert.equal(review.reports.find(report => report.id === 7).usd, null);
  assert.equal(review.reports.find(report => report.id === 9).outlier, 1);
  assert.deepEqual(await app.summary(), {
    shown: true, units: [{ unit: 'piece', count: 3, median: 120, min: 100, max: 130, latest_year: YEAR }]
  });
  assert.equal((await moderate(4, 'pending')).status, 400);
  assert.equal((await moderate(90, 'approved')).status, 404);
  assert.equal((await moderate(4, 'approved')).status, 200);
  assert.equal((await moderate(3, 'rejected')).status, 200);
  assert.equal((await moderate(5, 'approved')).status, 200);
  assert.equal((await moderate(6, 'approved')).status, 200);
  assert.deepEqual(await app.summary(), {
    shown: true, units: [
      { unit: 'piece', count: 4, median: 115, min: 100, max: 900, latest_year: YEAR },
      { unit: 'word', count: 1, median: 0.5, min: 0.5, max: 0.5, latest_year: YEAR }
    ]
  });
  assert.equal((await moderate(4, 'rejected')).status, 200);
  assert.deepEqual((await app.summary()).units[0],
    { unit: 'piece', count: 1, median: 110, min: 110, max: 110, latest_year: YEAR - 3 });
});
