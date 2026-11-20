// The Pitchboard on Cloudflare Pages (advanced mode). Bindings are documented in docs/.
const ORIGIN = 'https://pitchboard.soulbound.co.kr';
const REDIRECT = ORIGIN + '/api/auth/callback';
const SESSION = 'pb_session', STATE = 'pb_oauth', MAX_AGE = 60 * 60 * 24 * 30;
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
async function hmac(secret, data) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
export async function sign(secret, obj) { const p = b64u(enc.encode(JSON.stringify(obj))); return p + '.' + await hmac(secret, p); }
export async function verify(secret, tok) {
  if (!tok || !secret) return null; const [p, s] = tok.split('.'); if (!p || !s) return null;
  if (!safeEq(s, await hmac(secret, p))) return null;
  try { const o = JSON.parse(fromB64u(p)); if (o.exp && o.exp < Date.now() / 1000) return null; return o; } catch { return null; }
}
function cookies(req) { const o = {}; (req.headers.get('Cookie') || '').split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = c.slice(i + 1).trim(); }); return o; }
const ck = (n, v, age) => `${n}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const json = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...h } });
const redirect = (loc, setCookies = []) => { const h = new Headers({ Location: loc, 'Cache-Control': 'no-store' }); setCookies.forEach(c => h.append('Set-Cookie', c)); return new Response(null, { status: 302, headers: h }); };
const configured = (env) => env.DB && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET;
const hash = async (value) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(value)));
const DAY = 86400000;
const SEOUL_OFFSET = 9 * 60 * 60 * 1000;
const seoulDay = (date) => Math.floor((Date.parse(date) + SEOUL_OFFSET) / DAY);
const dateDay = (date) => date ? Date.parse(date + 'T00:00:00Z') / DAY : NaN;
const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const unavailable = () => json({ error: 'not_configured' }, 503);
const badInput = () => json({ error: 'bad_input' }, 400);
const acceptsPost = (req) => {
  const origin = req.headers.get('Origin');
  return origin !== null ? origin === new URL(req.url).origin :
    /^application\/json(?:\s*;|$)/i.test(req.headers.get('Content-Type') || '');
};

async function start(req, env) {
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  const url = new URL(req.url);
  const nl = url.searchParams.get('newsletter') === '0' ? 0 : 1; // pre-checked by default
  const nonce = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const st = await sign(env.SESSION_SECRET, { n: nonce, nl, exp: Math.floor(Date.now() / 1000) + 600 });
  const g = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  g.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', scope: 'openid email profile', state: nonce, prompt: 'select_account' });
  return redirect(g.toString(), [ck(STATE, st, 600)]);
}

async function callback(req, env) {
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  const url = new URL(req.url), code = url.searchParams.get('code'), state = url.searchParams.get('state');
  const st = await verify(env.SESSION_SECRET, cookies(req)[STATE]);
  if (!code || !state || !st || !safeEq(st.n, state)) return redirect('/signup/?error=state', [ck(STATE, '', 0)]);
  const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: 'authorization_code' }) });
  if (!tr.ok) return redirect('/signup/?error=token', [ck(STATE, '', 0)]);
  const tok = await tr.json();
  const ui = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } });
  if (!ui.ok) return redirect('/signup/?error=userinfo', [ck(STATE, '', 0)]);
  const u = await ui.json();
  if (!u.sub || !u.email || u.email_verified === false) return redirect('/signup/?error=email', [ck(STATE, '', 0)]);
  // New members get the choice they made on the sign-up page; returning members keep their saved choice.
  await env.DB.prepare(`INSERT INTO members (google_sub, email, name, newsletter_opt_in) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`)
    .bind(u.sub, u.email, u.name || null, st.nl).run();
  const sess = await sign(env.SESSION_SECRET, { sub: u.sub, exp: Math.floor(Date.now() / 1000) + MAX_AGE });
  return redirect('/account/', [ck(STATE, '', 0), ck(SESSION, sess, MAX_AGE)]);
}

async function me(req, env) {
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  const s = await verify(env.SESSION_SECRET, cookies(req)[SESSION]);
  if (!s) return json({ error: 'signed_out' }, 401);
  if (req.method === 'POST') {
    if (req.headers.get('Origin') !== ORIGIN) return json({ error: 'bad_origin' }, 403);
    let b; try { b = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
    if (typeof b.newsletter_opt_in !== 'boolean') return json({ error: 'bad_input' }, 400);
    await env.DB.prepare(`UPDATE members SET newsletter_opt_in = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE google_sub = ?2`).bind(b.newsletter_opt_in ? 1 : 0, s.sub).run();
  }
  const row = await env.DB.prepare('SELECT email, name, newsletter_opt_in FROM members WHERE google_sub = ?1').bind(s.sub).first();
  if (!row) return json({ error: 'signed_out' }, 401, { 'Set-Cookie': ck(SESSION, '', 0) });
  return json({ email: row.email, name: row.name, newsletter_opt_in: !!row.newsletter_opt_in });
}

// Keep in sync with migrations/0002_alerts_and_pay_reports.sql.
const SCHEMA_0002 = `
CREATE TABLE IF NOT EXISTS alert_prefs (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  genres TEXT NOT NULL DEFAULT '[]',
  kinds TEXT NOT NULL DEFAULT '[]',
  regions TEXT NOT NULL DEFAULT '[]',
  min_pay_usd REAL NOT NULL DEFAULT 0 CHECK (min_pay_usd >= 0),
  include_unstated_pay INTEGER NOT NULL DEFAULT 1 CHECK (include_unstated_pay IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  started_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS alert_sends (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('opened', 'deadline_7d', 'deadline_2d')),
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (member_id, call_id, kind)
);
CREATE TABLE IF NOT EXISTS alert_call_seen (
  call_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pay_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_id INTEGER NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'GBP', 'EUR', 'CAD', 'AUD', 'KRW', 'other')),
  unit TEXT NOT NULL CHECK (unit IN ('piece', 'word')),
  piece_type TEXT NOT NULL CHECK (piece_type IN ('review', 'essay', 'interview', 'other')),
  year INTEGER NOT NULL CHECK (year >= 2018),
  usd REAL CHECK (usd > 0),
  ip_hash TEXT NOT NULL,
  outlier INTEGER NOT NULL DEFAULT 0 CHECK (outlier IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS alert_sends_by_call ON alert_sends(call_id, kind);
CREATE INDEX IF NOT EXISTS pay_reports_by_ip ON pay_reports(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS pay_reports_by_outlet ON pay_reports(outlet_id, unit);
`;

async function readFeed(env) {
  const response = await env.ASSETS.fetch(new Request(ORIGIN + '/alerts-feed.json'));
  if (!response.ok) throw new Error('Alert feed unavailable');
  return response.json();
}

const DEFAULT_PREFS = {
  genres: [], kinds: [], regions: [], min_pay_usd: 0, include_unstated_pay: true, enabled: false
};

function prefsFrom(row) {
  if (!row) return DEFAULT_PREFS;
  return {
    genres: JSON.parse(row.genres), kinds: JSON.parse(row.kinds), regions: JSON.parse(row.regions),
    min_pay_usd: row.min_pay_usd, include_unstated_pay: !!row.include_unstated_pay, enabled: !!row.enabled
  };
}

async function preferences(req, env) {
  if (!env.DB || !env.SESSION_SECRET) return unavailable();
  const session = await verify(env.SESSION_SECRET, cookies(req)[SESSION]);
  if (!session) return json({ error: 'signed_out' }, 401);
  const member = await env.DB.prepare('SELECT id FROM members WHERE google_sub = ?').bind(session.sub).first();
  if (!member) return json({ error: 'signed_out' }, 401, { 'Set-Cookie': ck(SESSION, '', 0) });
  if (req.method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM alert_prefs WHERE member_id = ?').bind(member.id).first();
    return json(prefsFrom(row));
  }

  if (!acceptsPost(req)) return json({ error: 'bad_origin' }, 403);
  const body = await req.json().catch(() => null);
  if (!body || !Number.isFinite(body.min_pay_usd) || body.min_pay_usd < 0 || body.min_pay_usd > 20000 ||
      typeof body.enabled !== 'boolean' || typeof body.include_unstated_pay !== 'boolean') return badInput();

  const feed = await readFeed(env);
  const prefs = { min_pay_usd: body.min_pay_usd, include_unstated_pay: body.include_unstated_pay, enabled: body.enabled };
  for (const field of ['genres', 'kinds', 'regions']) {
    const values = body[field];
    if (!Array.isArray(values) || values.length > feed[field].length ||
        !values.every(value => feed[field].includes(value))) return badInput();
    prefs[field] = [...new Set(values)];
  }
  await env.DB.prepare(`
    INSERT INTO alert_prefs (member_id, genres, kinds, regions, min_pay_usd, include_unstated_pay, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(member_id) DO UPDATE SET
      genres = excluded.genres, kinds = excluded.kinds, regions = excluded.regions, min_pay_usd = excluded.min_pay_usd,
      include_unstated_pay = excluded.include_unstated_pay, enabled = excluded.enabled,
      started_at = CASE WHEN excluded.enabled AND alert_prefs.enabled THEN alert_prefs.started_at END,
      updated_at = ?`)
    .bind(member.id, JSON.stringify(prefs.genres), JSON.stringify(prefs.kinds), JSON.stringify(prefs.regions),
      prefs.min_pay_usd, +prefs.include_unstated_pay, +prefs.enabled, new Date().toISOString()).run();
  return json(prefs);
}

async function unsubscribe(url, env) {
  if (!env.DB || !env.SESSION_SECRET) return unavailable();
  const member = Number(url.searchParams.get('m'));
  const token = url.searchParams.get('t') || '';
  if (!positiveId(member) || !safeEq(token, await hmac(env.SESSION_SECRET, 'unsub:' + member))) {
    return json({ error: 'invalid_link' }, 400);
  }
  await env.DB.prepare('UPDATE alert_prefs SET enabled = 0, started_at = NULL, updated_at = ? WHERE member_id = ? AND enabled = 1')
    .bind(new Date().toISOString(), member).run();
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Alerts turned off · The Pitchboard</title>
    <link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
    <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png">
    </head>
    <body><main><h1>Custom email alerts are off</h1><p><a href="/alerts/">Manage email alerts</a></p></main></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  });
}

function callMatches(call, prefs) {
  return (!prefs.genres.length || call.genres.some(genre => prefs.genres.includes(genre))) &&
    (!prefs.kinds.length || prefs.kinds.includes(call.kind)) &&
    (!prefs.regions.length || call.worldwide || call.regions.some(region => prefs.regions.includes(region))) &&
    (call.pay_usd === null ? prefs.include_unstated_pay : call.pay_usd >= prefs.min_pay_usd);
}

const ALERT_LABELS = {
  opened: 'Opened',
  deadline_7d: 'Deadline in 3–7 days',
  deadline_2d: 'Deadline within 2 days'
};
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

async function sendDigest(env, member, alerts) {
  const token = await hmac(env.SESSION_SECRET, 'unsub:' + member.member_id);
  const unsub = ORIGIN + '/api/alerts/unsubscribe?m=' + member.member_id + '&t=' + token;
  const manage = ORIGIN + '/alerts/';
  const lines = alerts.map(({ call, kind }) => ({
    heading: call.outlet + ' · ' + call.title,
    details: [ALERT_LABELS[kind], call.kind, 'Deadline: ' + (call.deadline || 'Not stated'),
      'Pay: ' + (call.pay || 'Not stated')].join(' · '),
    link: ORIGIN + call.outlet_url
  }));
  const text = lines.map(row => [row.heading, row.details, row.link].join('\n')).join('\n\n') +
    '\n\nManage alerts: ' + manage + '\nUnsubscribe: ' + unsub;
  const html = '<ul>' + lines.map(row => `<li><a href="${escapeHtml(row.link)}">${escapeHtml(row.heading)}</a><br>
    ${escapeHtml(row.details)}</li>`).join('') + '</ul>' +
    `<p><a href="${manage}">Manage alerts</a> · <a href="${escapeHtml(unsub)}">Unsubscribe</a></p>`;
  const address = 'pitchboard@soulbound.co.kr';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', redirect: 'error',
    headers: {
      'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RESEND_API_KEY,
      'Idempotency-Key': 'pitchboard-alerts-' + await hash(JSON.stringify([member.email, text]))
    },
    body: JSON.stringify({
      from: 'The Pitchboard <' + address + '>', to: [member.email], reply_to: address,
      subject: 'Your Pitchboard call alerts', text, html,
      headers: { 'List-Unsubscribe': '<' + unsub + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    })
  });
  await response.body?.cancel().catch(() => {});
  return response.ok;
}

// One feed request, one initial D1 batch, and up to three subrequests per digest (47 total).
const DISPATCH_LIMIT = 15;

async function dispatch(url, env) {
  const dry_run = url.searchParams.get('dry_run') === '1';
  const sending_enabled = env.ALERTS_SENDING === 'on' && !!env.RESEND_API_KEY && !!env.SESSION_SECRET;
  const live = sending_enabled && !dry_run;
  const now = new Date().toISOString();
  const today = seoulDay(now);
  const feed = await readFeed(env);
  const active = feed.calls.map(call => ({
    call, left: dateDay(call.deadline) - today, elapsed: today - dateDay(call.opens)
  })).filter(item => !(item.left < 0));
  const undated = JSON.stringify(active.filter(({ call }) => !call.opens).map(({ call }) => call.id));

  // The starting baseline and first sightings belong to the same dispatch snapshot.
  const db = env.DB;
  const statements = [];
  if (live) {
    statements.push(
      db.prepare('UPDATE alert_prefs SET started_at = ? WHERE enabled = 1 AND started_at IS NULL').bind(now),
      db.prepare('INSERT OR IGNORE INTO alert_call_seen SELECT value, ? FROM json_each(?)').bind(now, undated)
    );
  }
  statements.push(
    db.prepare(`SELECT alert_prefs.*, members.email FROM alert_prefs JOIN members
      ON members.id = alert_prefs.member_id WHERE alert_prefs.enabled = 1 ORDER BY member_id`),
    db.prepare('SELECT * FROM alert_call_seen WHERE call_id IN (SELECT value FROM json_each(?))').bind(undated),
    db.prepare(`SELECT s.member_id, s.call_id, s.kind FROM alert_sends s JOIN alert_prefs p USING(member_id)
      WHERE p.enabled = 1 AND s.call_id IN (SELECT value FROM json_each(?))`)
      .bind(JSON.stringify(active.map(({ call }) => call.id)))
  );
  const [members, sightings, previous] = (await db.batch(statements)).slice(-3).map(row => row.results);
  const firstSeen = new Map(sightings.map(row => [row.call_id, row.first_seen_at]));
  const key = (member, call, kind) => JSON.stringify([member, call, kind]);
  const done = new Set(previous.map(row => key(row.member_id, row.call_id, row.kind)));
  const stats = { matched: 0, sent: 0, skipped: 0, remaining: 0, dry_run, sending_enabled };
  let attempts = 0;

  for (const member of members) {
    const prefs = prefsFrom(member);
    const first = !member.started_at || member.started_at === now;
    const alerts = [];
    for (const { call, left, elapsed } of active) {
      if ((first && !call.deadline) || !callMatches(call, prefs)) continue;
      const seen = firstSeen.get(call.id) || now;
      const recentOpen = call.opens ? elapsed >= 0 && elapsed <= 7 :
        today - seoulDay(seen) <= 7 && (call.deadline || seen > member.started_at);
      const afterBaseline = call.deadline || !call.opens || dateDay(call.opens) > seoulDay(member.started_at);
      const kinds = [];
      if (recentOpen && afterBaseline) kinds.push('opened');
      if (left >= 3 && left <= 7) kinds.push('deadline_7d');
      if (left >= 0 && left <= 2) kinds.push('deadline_2d');
      for (const kind of kinds) {
        if (!done.has(key(member.member_id, call.id, kind))) alerts.push({ call, kind });
      }
    }
    if (!alerts.length) continue;
    stats.matched++;
    if (!live) {
      stats.skipped++;
      continue;
    }
    if (attempts >= DISPATCH_LIMIT) {
      stats.remaining++;
      continue;
    }
    attempts++;
    const reserved = await db.batch(alerts.map(({ call, kind }) => db.prepare(`
      INSERT OR IGNORE INTO alert_sends (member_id, call_id, kind)
      SELECT ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM alert_prefs WHERE member_id = ? AND enabled = 1 AND started_at = ? AND updated_at = ?
      )`).bind(member.member_id, call.id, kind, member.member_id, member.started_at, member.updated_at)));
    const claimed = alerts.filter((_, i) => reserved[i].meta.changes > 0);
    if (!claimed.length) {
      stats.skipped++;
      continue;
    }
    const sent = await sendDigest(env, member, claimed).catch(() => false);
    if (sent) {
      stats.sent++;
    } else {
      await db.batch(claimed.map(({ call, kind }) => db.prepare(
        'DELETE FROM alert_sends WHERE member_id = ? AND call_id = ? AND kind = ?'
      ).bind(member.member_id, call.id, kind)));
      stats.remaining++;
    }
  }
  return json(stats);
}

// Fixed USD per currency unit. GBP, CAD and AUD match data/FX_NOTE.md (Oct 2026).
// EUR and KRW are rounded estimates for comparison, with no live rate lookup.
const USD_RATES = { USD: 1, GBP: 1.33, EUR: 1.15, CAD: 0.72, AUD: 0.66, KRW: 0.0007 };
const PAY_LIMITS = { piece: 20000, word: 5 };
const PIECE_TYPES = ['review', 'essay', 'interview', 'other'];

async function submitPayReport(req, env) {
  if (!acceptsPost(req)) return json({ error: 'bad_origin' }, 403);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return badInput();
  if (body.website) return json({ ok: true });

  const { outlet_id, amount, currency, unit, piece_type, year } = body;
  const now = new Date().toISOString();
  const today = seoulDay(now);
  const currentYear = new Date(today * DAY).getUTCFullYear();
  if (!positiveId(outlet_id) || !Number.isFinite(amount) || amount <= 0 ||
      typeof currency !== 'string' || (currency !== 'other' && !Object.hasOwn(USD_RATES, currency)) ||
      typeof unit !== 'string' || !Object.hasOwn(PAY_LIMITS, unit) || !PIECE_TYPES.includes(piece_type) ||
      !Number.isInteger(year) || year < 2018 || year > currentYear) return badInput();
  const usd = currency === 'other' ? null : amount * USD_RATES[currency];
  if (usd === null ? amount > 1e9 : usd <= 0 || usd > PAY_LIMITS[unit]) return badInput();

  const ip = req.headers.get('CF-Connecting-IP');
  if (!env.DB || !env.IP_HASH_SALT || !ip) return unavailable();
  const { outlets } = await readFeed(env);
  if (!Object.hasOwn(outlets, outlet_id)) return badInput();
  const published = unit === 'piece' && outlets[outlet_id].pay_usd_max > 0 ? outlets[outlet_id].pay_usd_max : null;
  const ipHash = await hash(JSON.stringify([env.IP_HASH_SALT, ip]));
  const monthStart = new Date(Date.parse(now) - 30 * DAY).toISOString();
  const dayStart = new Date(today * DAY - SEOUL_OFFSET).toISOString();

  // Rate checks, comparison to other reports, and insertion use one write statement.
  const result = await env.DB.prepare(`
    WITH comparable AS (
      SELECT usd, ROW_NUMBER() OVER (ORDER BY usd) AS pos, COUNT(*) OVER () AS n
      FROM pay_reports
      WHERE outlet_id = ?1 AND unit = ?4 AND usd IS NOT NULL AND status <> 'rejected'
        AND (outlier = 0 OR status = 'approved')
    ), reference AS (
      SELECT AVG(usd) AS median FROM comparable WHERE pos IN ((n+1)/2, (n+2)/2)
    )
    INSERT INTO pay_reports (outlet_id, amount, currency, unit, piece_type, year, usd, ip_hash, created_at, outlier)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
      CASE WHEN (?7 > ?10 * 3 OR ?7 < ?10 * 0.1 OR ?7 > median * 3 OR ?7 < median / 3)
        THEN 1 ELSE 0 END
    FROM reference
    WHERE (SELECT COUNT(*) FROM pay_reports WHERE ip_hash = ?8 AND created_at >= ?11 AND outlet_id = ?1) < 3
      AND (SELECT COUNT(*) FROM pay_reports WHERE ip_hash = ?8 AND created_at >= ?12) < 10`)
    .bind(outlet_id, amount, currency, unit, piece_type, year, usd, ipHash, now, published, monthStart, dayStart).run();
  return result.meta.changes ? json({ ok: true }) : json({ error: 'rate_limited' }, 429);
}

async function paySummary(url, env) {
  if (!env.DB) return unavailable();
  const outlet = Number(url.searchParams.get('outlet'));
  if (!positiveId(outlet)) return badInput();
  const minimumYear = new Date(Date.now() + SEOUL_OFFSET).getUTCFullYear() - 2;
  const { results } = await env.DB.prepare(`
    WITH eligible AS (
      SELECT unit, usd, year, status, ip_hash, year >= ?2 AS recent
      FROM pay_reports
      WHERE outlet_id = ?1 AND usd IS NOT NULL
        AND (status = 'approved' OR (status = 'pending' AND outlier = 0 AND year >= ?2))
    ), corroborated AS (
      SELECT unit FROM eligible WHERE recent GROUP BY unit HAVING COUNT(DISTINCT ip_hash) >= 2
    ), counting AS (
      SELECT unit, usd, year, ROW_NUMBER() OVER (PARTITION BY unit ORDER BY usd) AS pos,
        COUNT(*) OVER (PARTITION BY unit) AS n
      FROM eligible WHERE status = 'approved' OR unit IN (SELECT unit FROM corroborated)
    )
    SELECT unit, COUNT(*) AS count, MIN(usd) AS min, MAX(usd) AS max, MAX(year) AS latest_year,
      AVG(CASE WHEN pos IN ((n+1)/2, (n+2)/2) THEN usd END) AS median
    FROM counting GROUP BY unit ORDER BY unit`).bind(outlet, minimumYear).all();
  return json(results.length ? { shown: true, units: results } : { shown: false });
}

async function reviewPayReports(env) {
  const [reports, connections] = await env.DB.batch([
    env.DB.prepare(`SELECT id, outlet_id, amount, currency, unit, piece_type, year, usd, outlier, status,
      created_at, reviewed_at FROM pay_reports ORDER BY id DESC`),
    env.DB.prepare('SELECT outlet_id, COUNT(DISTINCT ip_hash) AS count FROM pay_reports GROUP BY outlet_id')
  ]);
  return json({
    reports: reports.results,
    distinct_connections: Object.fromEntries(connections.results.map(row => [row.outlet_id, row.count]))
  });
}

async function moderatePayReport(req, env, id) {
  const body = await req.json().catch(() => null);
  if (!positiveId(id) || !['approved', 'rejected'].includes(body?.status)) return badInput();
  const result = await env.DB.prepare('UPDATE pay_reports SET status = ?, reviewed_at = ? WHERE id = ?')
    .bind(body.status, new Date().toISOString(), id).run();
  return result.meta.changes ? json({ ok: true }) : json({ error: 'not_found' }, 404);
}

async function backup(db) {
  const tables = ['members', 'alert_prefs', 'alert_sends', 'pay_reports', 'alert_call_seen'];
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  const present = tables.filter(table => results.some(row => row.name === table));
  const rows = present.length ? await db.batch(present.map(table => db.prepare('SELECT * FROM ' + table))) : [];
  const dump = Object.fromEntries(tables.map(table => [table, []]));
  present.forEach((table, i) => { dump[table] = rows[i].results; });
  return json(dump);
}

async function internal(req, env, url) {
  if (!env.ALERTS_CRON_SECRET) return unavailable();
  const digests = await Promise.all(
    [req.headers.get('X-Pitchboard-Cron') || '', env.ALERTS_CRON_SECRET]
      .map(secret => crypto.subtle.digest('SHA-256', enc.encode(secret)))
  );
  const allowed = crypto.subtle.timingSafeEqual ?
    crypto.subtle.timingSafeEqual(...digests) : safeEq(...digests.map(b64u));
  if (!allowed) return json({ error: 'unauthorized' }, 401);
  const path = url.pathname;
  const migrate = req.method === 'POST' && path === '/api/internal/migrate';
  if (migrate && env.ALLOW_D1_MIGRATE !== 'on') return json({ error: 'not_found' }, 404);
  if (!env.DB) return unavailable();
  if (migrate) {
    await env.DB.batch(SCHEMA_0002.split(';').map(s => s.trim()).filter(Boolean).map(s => env.DB.prepare(s)));
    return json({ ok: true });
  }
  if (req.method === 'GET') {
    if (path === '/api/internal/backup') return backup(env.DB);
    if (path === '/api/internal/pay-reports') return reviewPayReports(env);
  }
  if (req.method === 'POST') {
    if (path === '/api/internal/alerts/dispatch') return dispatch(url, env);
    const report = /^\/api\/internal\/pay-reports\/(\d+)$/.exec(path);
    if (report) return moderatePayReport(req, env, Number(report[1]));
  }
  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/api/auth/google' && req.method === 'GET') return await start(req, env);
      if (p === '/api/auth/callback' && req.method === 'GET') return await callback(req, env);
      if (p === '/api/auth/logout') return req.method === 'POST' ? json({ ok: true }, 200, { 'Set-Cookie': ck(SESSION, '', 0) }) : redirect('/', [ck(SESSION, '', 0)]);
      if (p === '/api/me' && (req.method === 'GET' || req.method === 'POST')) return await me(req, env);
      if (p.startsWith('/api/internal/')) return await internal(req, env, url);
      if (p === '/api/alerts/prefs' && ['GET', 'POST'].includes(req.method)) return await preferences(req, env);
      if (p === '/api/alerts/unsubscribe' && ['GET', 'POST'].includes(req.method)) return await unsubscribe(url, env);
      if (p === '/api/pay-reports' && req.method === 'POST') return await submitPayReport(req, env);
      if (p === '/api/pay-reports/summary' && req.method === 'GET') return await paySummary(url, env);
      if (p.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    } catch (e) { return json({ error: 'server_error' }, 500); }
    return env.ASSETS.fetch(req);
  }
};
