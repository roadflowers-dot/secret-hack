'use strict';
// Hands-on labs. Every "vulnerable" target here is a sandbox:
//  - SQLi runs against a throwaway in-memory SQLite DB (query_only, fresh per request)
//  - Path traversal runs against a fake in-memory file system
//  - XSS output is served with `Content-Security-Policy: sandbox` (opaque origin, no cookies/DOM access)
const express = require('express');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createLimiter } = require('./ratelimit');
const store = require('./store');

const router = express.Router();

const str = (v, max = 200) => (typeof v === 'string' ? v : '').slice(0, max);

// ───────────────────────── SQL Injection ─────────────────────────
function makeSqliDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT, role TEXT);
    INSERT INTO users (username, password, role) VALUES
      ('neo',      'redpill',            'user'),
      ('trinity',  'whiterabbit',        'user'),
      ('morpheus', 'zion4ever',          'admin'),
      ('smith',    'FLAG{never_concat_sql}', 'agent');
    CREATE TABLE secrets (id INTEGER PRIMARY KEY, note TEXT);
    INSERT INTO secrets (note) VALUES ('zion mainframe access code: 0xDEADBEEF'), ('FLAG{union_select_master}');
    PRAGMA query_only = ON;
  `);
  return db;
}

router.post('/sqli', (req, res) => {
  const username = str(req.body.username);
  const password = str(req.body.password);
  const mode = req.body.mode === 'secure' ? 'secure' : 'vulnerable';
  const db = makeSqliDb();
  let sql;
  try {
    let rows;
    if (mode === 'vulnerable') {
      sql = `SELECT id, username, role FROM users WHERE username = '${username}' AND password = '${password}'`;
      rows = db.prepare(sql).all();
    } else {
      sql = 'SELECT id, username, role FROM users WHERE username = ? AND password = ?';
      rows = db.prepare(sql).all(username, password);
    }
    const suspicious = /['"]|--|\/\*|\bunion\b|\bor\b\s+\S+\s*=/i.test(username + ' ' + password);
    if (suspicious) {
      store.logEvent('lab.sqli', {
        ip: req.ip, email: req.user.email, severity: rows.length ? 'warn' : 'info',
        detail: `[${mode}] rows=${rows.length} input=${JSON.stringify({ username, password }).slice(0, 200)}`,
      });
    }
    res.json({ mode, sql, params: mode === 'secure' ? [username, password] : undefined, rows: rows.slice(0, 50), loggedIn: rows.length > 0 });
  } catch (e) {
    res.json({ mode, sql, error: e.message, rows: [], loggedIn: false });
  } finally {
    db.close();
  }
});

// ───────────────────────── XSS ─────────────────────────
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Rendered inside <iframe sandbox="allow-scripts allow-modals">. The response itself also carries
// a CSP `sandbox` directive, so even if opened top-level it runs in an opaque origin.
router.get('/xss/render', (req, res) => {
  const q = str(req.query.q, 1000);
  const mode = req.query.mode === 'secure' ? 'secure' : 'vulnerable';
  const comment = mode === 'secure' ? escapeHtml(q) : q;
  const csp = mode === 'secure'
    ? "sandbox; default-src 'none'; style-src 'unsafe-inline'"
    : "sandbox allow-scripts allow-modals; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: http: https:";
  res.set('Content-Security-Policy', csp);
  res.set('X-Content-Type-Options', 'nosniff');
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{background:#010a01;color:#3f3;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;margin:12px}
    .c{border:1px solid #0a4;padding:8px 10px;border-radius:4px;background:#021402;word-break:break-all}
    .meta{color:#6a6;font-size:12px;margin-bottom:6px}
  </style></head><body>
  <div class="meta">guestbook :: ${mode === 'secure' ? 'escaped output' : 'raw innerHTML output'}</div>
  <div class="c">${comment || '<i style="color:#575">(empty)</i>'}</div>
  </body></html>`);
});

router.post('/xss/log', (req, res) => {
  const q = str(req.body.q, 300);
  if (/<\s*script|on\w+\s*=|javascript:/i.test(q)) {
    store.logEvent('lab.xss', { ip: req.ip, email: req.user.email, detail: `[${req.body.mode === 'secure' ? 'secure' : 'vulnerable'}] ${q}` });
  }
  res.json({ ok: true });
});

// ───────────────────────── Brute force / rate limit ─────────────────────────
const BRUTE_USER = 'operator';
const BRUTE_PASS = 'matrix';
const bruteLimiter = createLimiter({ windowMs: 60_000, max: 5, lockMs: 60_000 });

router.post('/brute/login', (req, res) => {
  const mode = req.body.mode === 'secure' ? 'secure' : 'vulnerable';
  const username = str(req.body.username, 64);
  const password = str(req.body.password, 64);

  if (mode === 'secure') {
    const r = bruteLimiter.hit(`${req.ip}|${username.toLowerCase()}`);
    if (!r.allowed) {
      if (r.justLocked) {
        store.logEvent('lab.bruteforce.lockout', { ip: req.ip, email: req.user.email, severity: 'warn', detail: `account "${username}" locked for 60s` });
      }
      res.set('Retry-After', String(Math.ceil(r.retryAfterMs / 1000)));
      return res.status(429).json({ ok: false, locked: true, retryAfterSec: Math.ceil(r.retryAfterMs / 1000), message: '너무 많은 시도. 계정이 잠겼습니다.' });
    }
    const ok = username === BRUTE_USER && password === BRUTE_PASS;
    if (ok) bruteLimiter.reset(`${req.ip}|${username.toLowerCase()}`);
    // Same generic message whether the user exists or not (no user enumeration).
    return res.json({ ok, remaining: r.remaining, message: ok ? 'ACCESS GRANTED' : '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  // Vulnerable: no limit, and it leaks which part was wrong.
  if (username !== BRUTE_USER) return res.json({ ok: false, message: '존재하지 않는 사용자입니다.' });
  if (password !== BRUTE_PASS) return res.json({ ok: false, message: '비밀번호가 틀렸습니다.' });
  return res.json({ ok: true, message: 'ACCESS GRANTED' });
});

// ───────────────────────── CSRF ─────────────────────────
// The global CSRF middleware (server.js) protects everything under /api. This endpoint shows the result.
let balances = new Map();
router.post('/csrf/transfer', (req, res) => {
  const amount = Math.max(0, Math.min(1_000_000, parseInt(req.body.amount, 10) || 0));
  const to = str(req.body.to, 40) || 'unknown';
  const key = req.user.email;
  const bal = balances.has(key) ? balances.get(key) : 1000;
  const next = Math.max(0, bal - amount);
  balances.set(key, next);
  res.json({ ok: true, message: `${amount} 크레딧을 ${to} 에게 송금 완료`, balance: next });
});
router.post('/csrf/reset', (req, res) => {
  balances.set(req.user.email, 1000);
  res.json({ ok: true, balance: 1000 });
});

// ───────────────────────── Path traversal ─────────────────────────
const FAKE_FS = {
  '/srv/files/readme.txt': 'Welcome to the Nebuchadnezzar file server.\nOnly files in /srv/files are public.',
  '/srv/files/manual.txt': 'Operator manual v1.0 — jack in, jack out.',
  '/srv/files/images/logo.txt': '[ascii logo]  ▓▓ MATRIX ▓▓',
  '/etc/passwd': 'root:x:0:0:root:/root:/bin/bash\nneo:x:1000:1000:Thomas Anderson:/home/neo:/bin/bash\nsmith:x:1001:1001:Agent:/home/smith:/usr/sbin/nologin',
  '/srv/config/.env': 'DB_PASSWORD=FLAG{dot_dot_slash_pwned}\nAPI_KEY=sk-zion-0000000000',
  '/home/neo/.ssh/id_rsa': '-----BEGIN FAKE PRIVATE KEY-----\nFLAG{keys_to_the_matrix}\n-----END FAKE PRIVATE KEY-----',
};
const BASE = '/srv/files';

router.post('/traversal', (req, res) => {
  const name = str(req.body.file, 300);
  const mode = req.body.mode === 'secure' ? 'secure' : 'vulnerable';
  let decoded = name;
  try { decoded = decodeURIComponent(name); } catch { /* keep raw */ }

  if (mode === 'vulnerable') {
    const resolved = path.posix.join(BASE, decoded);
    const content = FAKE_FS[resolved];
    if (content !== undefined && !resolved.startsWith(BASE + '/')) {
      store.logEvent('lab.traversal', { ip: req.ip, email: req.user.email, severity: 'warn', detail: `[vulnerable] ${name} -> ${resolved}` });
    }
    return res.json({ mode, code: `path.join('${BASE}', input)`, resolved, found: content !== undefined, content: content ?? null });
  }

  // Secure: reject control chars, resolve, then verify it stays inside BASE. Also allow-list chars.
  if (/[\0\\]/.test(decoded) || !/^[\w.\/-]+$/.test(decoded)) {
    return res.json({ mode, resolved: null, found: false, blocked: true, reason: '허용되지 않은 문자 (allow-list: 영문/숫자/_ . / -)' });
  }
  const resolved = path.posix.resolve(BASE, '.' + path.posix.sep + decoded);
  if (!resolved.startsWith(BASE + '/')) {
    store.logEvent('lab.traversal', { ip: req.ip, email: req.user.email, detail: `[secure, blocked] ${name} -> ${resolved}` });
    return res.json({ mode, resolved, found: false, blocked: true, reason: `경로가 ${BASE}/ 밖으로 벗어남 → 차단` });
  }
  const content = FAKE_FS[resolved];
  return res.json({ mode, code: `resolve + startsWith('${BASE}/')`, resolved, found: content !== undefined, content: content ?? null });
});

router.get('/traversal/list', (_req, res) => {
  res.json({ base: BASE, files: Object.keys(FAKE_FS).filter((f) => f.startsWith(BASE + '/')).map((f) => f.slice(BASE.length + 1)) });
});

module.exports = router;
