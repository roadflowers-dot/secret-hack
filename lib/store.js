'use strict';
// Tiny JSON-file store: visitors, blocked IPs, security events.
const fs = require('node:fs');
const path = require('node:path');

const FILE = process.env.STORE_FILE || path.join(__dirname, '..', 'data', 'store.json');
const MAX_EVENTS = 1000;
const MAX_VISITORS = 5000;

let state = { visitors: {}, blocked: {}, events: [] };

try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  state = { visitors: raw.visitors || {}, blocked: raw.blocked || {}, events: raw.events || [] };
} catch (e) {
  if (e.code !== 'ENOENT') console.error('[store] failed to read store, starting empty:', e.message);
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 1000);
}
function saveNow() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error('[store] save failed:', e.message);
  }
}
process.on('SIGINT', () => { saveNow(); process.exit(0); });
process.on('SIGTERM', () => { saveNow(); process.exit(0); });

function now() { return new Date().toISOString(); }

function recordVisit({ ip, email, name, userAgent, path: reqPath }) {
  let v = state.visitors[ip];
  if (!v) {
    v = state.visitors[ip] = { ip, firstSeen: now(), lastSeen: now(), hits: 0, emails: [], userAgent: '', lastPath: '' };
  }
  v.hits += 1;
  v.lastSeen = now();
  v.userAgent = String(userAgent || '').slice(0, 300);
  v.lastPath = String(reqPath || '').slice(0, 200);
  if (email && !v.emails.includes(email)) {
    v.emails.push(email);
    if (v.emails.length > 20) v.emails.shift();
  }
  if (name) v.lastName = String(name).slice(0, 100);

  const ips = Object.keys(state.visitors);
  if (ips.length > MAX_VISITORS) {
    ips.sort((a, b) => state.visitors[a].lastSeen.localeCompare(state.visitors[b].lastSeen));
    for (const old of ips.slice(0, ips.length - MAX_VISITORS)) delete state.visitors[old];
  }
  scheduleSave();
}

function isBlocked(ip) { return Object.prototype.hasOwnProperty.call(state.blocked, ip); }

function block(ip, { reason, by }) {
  state.blocked[ip] = { ip, reason: String(reason || '').slice(0, 200), by, at: now() };
  scheduleSave();
}
function unblock(ip) {
  const existed = isBlocked(ip);
  delete state.blocked[ip];
  scheduleSave();
  return existed;
}

function logEvent(type, { ip, email, detail, severity = 'info' }) {
  state.events.push({ at: now(), type, severity, ip, email: email || null, detail: String(detail || '').slice(0, 500) });
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  scheduleSave();
}

function listVisitors() {
  return Object.values(state.visitors)
    .map((v) => ({ ...v, blocked: isBlocked(v.ip) }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
function listBlocked() { return Object.values(state.blocked).sort((a, b) => b.at.localeCompare(a.at)); }
function listEvents(limit = 200) { return state.events.slice(-limit).reverse(); }

module.exports = { recordVisit, isBlocked, block, unblock, logEvent, listVisitors, listBlocked, listEvents, saveNow, FILE };
