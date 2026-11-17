'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const express = require('express');
const cookieSession = require('cookie-session');
const { OAuth2Client } = require('google-auth-library');
const store = require('./lib/store');
const { createLimiter } = require('./lib/ratelimit');

// ───────────────────────── Config ─────────────────────────
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const DEV_LOGIN = !IS_PROD && process.env.DEV_LOGIN === '1';
let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[warn] SESSION_SECRET not set — using a random one (sessions reset on restart).');
}
if (!ADMIN_EMAILS.length) console.warn('[warn] ADMIN_EMAILS not set — nobody can open the admin panel.');
if (!GOOGLE_CLIENT_ID && !DEV_LOGIN) console.warn('[warn] GOOGLE_CLIENT_ID not set — Google login will not work.');
if (DEV_LOGIN) console.warn('[warn] DEV_LOGIN enabled — anyone can log in as any email. Never use in production.');

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const isAdmin = (email) => !!email && ADMIN_EMAILS.includes(email.toLowerCase());

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp);
}

const VIEWS = path.join(__dirname, 'views');

// ───────────────────────── 1. Security headers ─────────────────────────
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' https://accounts.google.com/gsi/client",
      "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
      "frame-src 'self' https://accounts.google.com/gsi/",
      "connect-src 'self' https://accounts.google.com/gsi/",
      "img-src 'self' data: https://*.googleusercontent.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    // GIS popup needs to talk back to the opener.
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (IS_PROD) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// ───────────────────────── 2. IP block (before anything else) ─────────────────────────
app.use((req, res, next) => {
  if (!store.isBlocked(req.ip)) return next();
  const isAsset = req.path.startsWith('/css/') || req.path === '/js/matrix.js';
  if (isAsset) return next();
  store.logEvent('blocked.request', { ip: req.ip, severity: 'warn', detail: `${req.method} ${req.originalUrl.slice(0, 200)}` });
  res.status(403);
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return res.json({ error: 'ACCESS DENIED: your IP is blocked' });
  return res.sendFile(path.join(VIEWS, 'blocked.html'));
});

// ───────────────────────── 3. Global rate limit ─────────────────────────
const globalLimiter = createLimiter({ windowMs: 60_000, max: 300 });
const authLimiter = createLimiter({ windowMs: 10 * 60_000, max: 20 });
app.use((req, res, next) => {
  const r = globalLimiter.hit(req.ip);
  if (r.allowed) return next();
  res.set('Retry-After', String(Math.ceil(r.retryAfterMs / 1000)));
  return res.status(429).json({ error: 'Too many requests' });
});

app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: IS_PROD ? '1h' : 0 }));
app.use(express.json({ limit: '20kb' }));

// ───────────────────────── 4. Session ─────────────────────────
const SESSION_MS = 8 * 60 * 60 * 1000;
app.use(cookieSession({
  name: 'sh_sess',
  keys: [SESSION_SECRET],
  httpOnly: true,
  sameSite: 'lax',
  secure: IS_PROD,
  maxAge: SESSION_MS,
}));
app.use((req, _res, next) => {
  const s = req.session;
  if (s && s.user && s.exp > Date.now()) req.user = s.user;
  else if (s && s.user) req.session = null;
  next();
});

// ───────────────────────── 5. Visitor tracking (pages + API, not static files) ─────────────────────────
app.use((req, _res, next) => {
  store.recordVisit({
    ip: req.ip,
    email: req.user && req.user.email,
    name: req.user && req.user.name,
    userAgent: req.get('user-agent'),
    path: req.path,
  });
  next();
});

// ───────────────────────── 6. CSRF: per-session token in a custom header ─────────────────────────
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.get('x-csrf-token') || '';
  const expected = (req.session && req.session.csrf) || '';
  const ok = expected && token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) {
    store.logEvent('csrf.rejected', { ip: req.ip, email: req.user && req.user.email, severity: 'warn', detail: `${req.method} ${req.originalUrl}` });
    return res.status(403).json({ error: 'CSRF token missing or invalid', blockedBy: 'csrf' });
  }
  next();
}

const requireAuthApi = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'login required' }));
const requireAdminApi = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'login required' });
  if (!isAdmin(req.user.email)) {
    store.logEvent('admin.denied', { ip: req.ip, email: req.user.email, severity: 'warn', detail: req.originalUrl });
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
};

// ───────────────────────── Auth ─────────────────────────
function startSession(req, user) {
  req.session = { user, csrf: crypto.randomBytes(24).toString('hex'), exp: Date.now() + SESSION_MS };
}

app.get('/api/config', (_req, res) => res.json({ googleClientId: GOOGLE_CLIENT_ID, devLogin: DEV_LOGIN }));

app.post('/auth/google', async (req, res) => {
  const lim = authLimiter.hit(req.ip);
  if (!lim.allowed) return res.status(429).json({ error: 'Too many login attempts' });
  // Forms can't send application/json cross-site without a CORS preflight → login-CSRF guard.
  if (!req.is('application/json')) return res.status(415).json({ error: 'JSON required' });
  const credential = typeof req.body.credential === 'string' ? req.body.credential : '';
  if (!credential || !GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'missing credential' });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p || !p.email || !p.email_verified) return res.status(401).json({ error: 'email not verified' });
    const user = { email: p.email.toLowerCase(), name: p.name || p.email, picture: p.picture || '', sub: p.sub };
    startSession(req, user);
    store.recordVisit({ ip: req.ip, email: user.email, name: user.name, userAgent: req.get('user-agent'), path: '/auth/google' });
    store.logEvent('auth.login', { ip: req.ip, email: user.email, detail: isAdmin(user.email) ? 'admin login' : 'login' });
    res.json({ ok: true, admin: isAdmin(user.email) });
  } catch (e) {
    store.logEvent('auth.failed', { ip: req.ip, severity: 'warn', detail: e.message });
    res.status(401).json({ error: 'invalid Google token' });
  }
});

if (DEV_LOGIN) {
  app.post('/auth/dev', (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON required' });
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid email' });
    startSession(req, { email, name: email.split('@')[0] + ' (dev)', picture: '', sub: 'dev' });
    store.logEvent('auth.login', { ip: req.ip, email, detail: 'DEV login' });
    res.json({ ok: true, admin: isAdmin(email) });
  });
}

app.post('/auth/logout', csrfProtect, (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', requireAuthApi, (req, res) => {
  res.json({ ...req.user, admin: isAdmin(req.user.email), csrf: req.session.csrf, ip: req.ip });
});

// ───────────────────────── Admin ─────────────────────────
const admin = express.Router();
admin.use(requireAdminApi, csrfProtect);
admin.get('/overview', (req, res) => {
  const visitors = store.listVisitors();
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  res.json({
    you: req.ip,
    totals: {
      visitors: visitors.length,
      active24h: visitors.filter((v) => Date.parse(v.lastSeen) > dayAgo).length,
      blocked: store.listBlocked().length,
      users: new Set(visitors.flatMap((v) => v.emails)).size,
    },
    visitors: visitors.slice(0, 1000),
    blocked: store.listBlocked(),
    events: store.listEvents(300),
  });
});
admin.post('/block', (req, res) => {
  const ip = String(req.body.ip || '').trim();
  if (!net.isIP(ip)) return res.status(400).json({ error: '올바른 IP 주소가 아닙니다.' });
  if (ip === req.ip) return res.status(400).json({ error: '자기 자신의 현재 IP는 차단할 수 없습니다.' });
  store.block(ip, { reason: req.body.reason, by: req.user.email });
  store.logEvent('admin.block', { ip: req.ip, email: req.user.email, severity: 'warn', detail: `blocked ${ip} (${String(req.body.reason || '').slice(0, 100)})` });
  res.json({ ok: true });
});
admin.post('/unblock', (req, res) => {
  const ip = String(req.body.ip || '').trim();
  const existed = store.unblock(ip);
  store.logEvent('admin.unblock', { ip: req.ip, email: req.user.email, detail: `unblocked ${ip}` });
  res.json({ ok: true, existed });
});
app.use('/api/admin', admin);

// ───────────────────────── Pages ─────────────────────────
app.get('/', (req, res) => res.redirect(req.user ? '/lab' : '/login'));
app.get('/login', (req, res) => (req.user ? res.redirect('/lab') : res.sendFile(path.join(VIEWS, 'login.html'))));
app.get('/lab', (req, res) => (req.user ? res.sendFile(path.join(VIEWS, 'lab.html')) : res.redirect('/login')));
app.get('/admin', (req, res) => {
  if (!req.user) return res.redirect('/login');
  if (!isAdmin(req.user.email)) {
    store.logEvent('admin.denied', { ip: req.ip, email: req.user.email, severity: 'warn', detail: '/admin page' });
    return res.status(403).sendFile(path.join(VIEWS, 'forbidden.html'));
  }
  res.sendFile(path.join(VIEWS, 'admin.html'));
});

app.use((req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, req, res, _next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal error' });
});

app.listen(PORT, () => console.log(`[secret-hack] listening on http://localhost:${PORT}  (admins configured: ${ADMIN_EMAILS.length})`));
