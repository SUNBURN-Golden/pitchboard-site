// The Pitchboard: Google sign-in on Cloudflare Pages (advanced mode) + D1.
// Env: DB (D1), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET.
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

export default {
  async fetch(req, env) {
    const p = new URL(req.url).pathname;
    try {
      if (p === '/api/auth/google' && req.method === 'GET') return await start(req, env);
      if (p === '/api/auth/callback' && req.method === 'GET') return await callback(req, env);
      if (p === '/api/auth/logout') return req.method === 'POST' ? json({ ok: true }, 200, { 'Set-Cookie': ck(SESSION, '', 0) }) : redirect('/', [ck(SESSION, '', 0)]);
      if (p === '/api/me' && (req.method === 'GET' || req.method === 'POST')) return await me(req, env);
      if (p.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    } catch (e) { return json({ error: 'server_error' }, 500); }
    return env.ASSETS.fetch(req);
  }
};
