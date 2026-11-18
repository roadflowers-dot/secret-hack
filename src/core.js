// Shared Firebase client logic for every page.
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
  connectAuthEmulator, signInWithCredential,
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc,
  serverTimestamp, increment, arrayUnion, onSnapshot,
} from 'firebase/firestore';

// ───────── Emulator mode (local testing only: http://localhost:5000/?emu) ─────────
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const params = new URLSearchParams(location.search);
try { if (LOCAL && params.has('emu')) sessionStorage.setItem('sh_emu', '1'); } catch { /* ignore */ }
let EMU = false;
try { EMU = LOCAL && sessionStorage.getItem('sh_emu') === '1'; } catch { /* ignore */ }

async function loadConfig() {
  try {
    const r = await fetch('/__/firebase/init.json', { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch { /* ignore */ }
  if (EMU) return { apiKey: 'demo-key', projectId: 'demo-secret-hack', authDomain: 'localhost' };
  throw new Error('Firebase 설정(/__/firebase/init.json)을 불러오지 못했습니다. Firebase Hosting에서 실행해야 합니다.');
}

const config = await loadConfig();
export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
if (EMU) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// ───────── helpers ─────────
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IP_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?!$)|$)){4}$|^[0-9a-f:]{2,39}$/i;
export const isIp = (s) => typeof s === 'string' && IP_RE.test(s) && (s.includes('.') || s.includes(':'));

// Public IP (+ rough location) as seen from the internet. Without a server the browser has to ask an outside
// service, so this is client-reported: good for monitoring, not a security boundary.
//   1) ipapi.co   → IP, country, city, ISP   (free, no key, ~1000 lookups/day per visitor IP)
//   2) ipify.org  → IP only (fallback)
const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
async function fetchJson(url, ms = 4000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
export async function getNet() {
  try { const c = JSON.parse(sessionStorage.getItem('sh_net') || 'null'); if (c && c.ip) return c; } catch { /* ignore */ }
  let net = { ip: 'unknown', geo: null };
  if (EMU) {
    net = { ip: params.get('ip') || '127.0.0.1', geo: { country: 'South Korea', cc: 'KR', city: params.get('city') || 'Seoul', region: 'Seoul', org: 'Emulator ISP' } };
  } else {
    const g = await fetchJson('https://ipapi.co/json/');
    if (g && isIp(g.ip)) {
      net = { ip: g.ip, geo: { country: clip(g.country_name, 60), cc: clip(g.country_code, 2), city: clip(g.city, 60), region: clip(g.region, 60), org: clip(g.org, 100) } };
    } else {
      const j = await fetchJson('https://api.ipify.org?format=json');
      if (j && isIp(j.ip)) net.ip = j.ip;
    }
  }
  try { if (net.ip !== 'unknown') sessionStorage.setItem('sh_net', JSON.stringify(net)); } catch { /* ignore */ }
  return net;
}
export async function getIp() { return (await getNet()).ip; }

// "Windows · Chrome", "iPhone · Safari", ...
export function parseUA(ua) {
  ua = String(ua || '');
  const os = /Windows NT/.test(ua) ? 'Windows' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '기타 OS';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /KAKAOTALK/i.test(ua) ? 'KakaoTalk' : /NAVER/.test(ua) ? 'Naver' : /Whale\//.test(ua) ? 'Whale'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '기타 브라우저';
  const kind = /iPad|Tablet/.test(ua) ? '태블릿' : /Mobi|iPhone|Android/.test(ua) ? '모바일' : 'PC';
  return `${os} · ${br} · ${kind}`;
}

export function authReady() {
  return new Promise((resolve) => { const un = onAuthStateChanged(auth, (u) => { un(); resolve(u); }); });
}

export async function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

// Emulator-only test login (the auth emulator accepts an unsigned fake Google token).
export async function emuLogin(email) {
  if (!EMU) throw new Error('emulator only');
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: 'sub-' + email, email, email_verified: true, name: email.split('@')[0] }));
  return signInWithCredential(auth, cred);
}
export const isEmu = () => EMU;
export const emulatorMode = EMU;

export async function logout() {
  await signOut(auth);
  location.href = '/login';
}

const hourKey = () => new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');

export async function logEvent(user, ip, type, detail, { severity = 'info', key } = {}) {
  const id = `${user.uid}_${key || type + '_' + Date.now()}`;
  try {
    await setDoc(doc(db, 'events', id), {
      at: serverTimestamp(), type, uid: user.uid, email: user.email, ip,
      detail: String(detail || '').slice(0, 300), severity,
    });
  } catch (e) { console.warn('event not logged:', e.code || e.message); }
}

async function trackVisit(user, net) {
  const { ip, geo } = net;
  const ref = doc(db, 'visitors', user.uid);
  const device = parseUA(navigator.userAgent);
  const base = {
    uid: user.uid, email: user.email,
    name: (user.displayName || '').slice(0, 100), photo: (user.photoURL || '').slice(0, 500),
    ip, ua: navigator.userAgent.slice(0, 300), path: location.pathname.slice(0, 100),
    device, lastSeen: serverTimestamp(),
    ...(geo ? { country: geo.country, cc: geo.cc, city: geo.city, region: geo.region, org: geo.org } : {}),
  };
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { ...base, ips: [ip], devices: [device], hits: 1, firstSeen: serverTimestamp() });
    } else {
      const d = snap.data();
      const last = d.lastSeen ? d.lastSeen.toMillis() : 0;
      if (Date.now() - last < 31_000) return;
      const ips = d.ips || [];
      const upd = { ...base, hits: increment(1) };
      if (!ips.includes(ip) && ips.length < 20) upd.ips = arrayUnion(ip);
      const devs = d.devices || [];
      if (!devs.includes(device) && devs.length < 10) upd.devices = arrayUnion(device);
      await updateDoc(ref, upd);
    }
  } catch (e) { console.warn('visit not tracked:', e.code || e.message); }
}

export function showBlocked(reason) {
  document.querySelector('.wrap')?.remove();
  const w = document.createElement('div');
  w.className = 'wrap center';
  w.innerHTML = `<div class="panel login" style="border-color:#7a1d1d">
    <h1 class="red" style="text-shadow:0 0 10px rgba(255,59,59,.7)">ACCESS DENIED</h1>
    <p>${esc(reason)}</p>
    <p class="muted">이 접근 시도는 기록되었습니다.</p></div>`;
  document.body.appendChild(w);
}

// Runs on every protected page. Returns { user, ip, admin } or null if the page must stop.
export async function guard({ requireAdmin = false } = {}) {
  const [net, user] = await Promise.all([getNet(), authReady()]);
  const { ip } = net;
  let ipBlocked = false;
  if (ip !== 'unknown') {
    try { ipBlocked = (await getDoc(doc(db, 'blockedIps', ip))).exists(); } catch { /* ignore */ }
  }
  if (!user) {
    if (ipBlocked) { showBlocked('당신의 IP 주소는 관리자에 의해 차단되었습니다.'); return null; }
    location.replace('/login');
    return null;
  }
  let acctBlocked = false;
  try { acctBlocked = (await getDoc(doc(db, 'blocked', user.uid))).exists(); } catch { /* ignore */ }
  if (ipBlocked || acctBlocked) {
    await logEvent(user, ip, 'blocked.attempt', `${acctBlocked ? 'account' : 'ip'} blocked · ${location.pathname}`, { severity: 'warn', key: 'blocked_' + hourKey() });
    showBlocked(acctBlocked ? '이 Google 계정은 관리자에 의해 차단되었습니다.' : '당신의 IP 주소는 관리자에 의해 차단되었습니다.');
    return null;
  }
  let admin = false;
  try { admin = (await getDoc(doc(db, 'admins', user.email))).exists(); } catch { /* ignore */ }
  if (requireAdmin && !admin) {
    showBlocked('관리자 권한이 없습니다.');
    return null;
  }
  await trackVisit(user, net);
  logActivity(user, 'page', location.pathname);
  startPresence(user);
  watchBlocks(user, ip);
  return { user, ip, admin, geo: net.geo };
}

// ───────── Activity timeline (one small doc per page view / lab opened) ─────────
export async function logActivity(user, type, detail) {
  const id = `${user.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await setDoc(doc(db, 'activity', id), { uid: user.uid, email: user.email, type, detail: String(detail || '').slice(0, 200), at: serverTimestamp() });
  } catch (e) { console.warn('activity not logged:', e.code || e.message); }
}

// ───────── Presence: heartbeat every 60s while the tab is visible ─────────
function startPresence(user) {
  const ref = doc(db, 'presence', user.uid);
  let last = 0;
  const beat = async (state = 'active', force = false) => {
    if (!force && Date.now() - last < 6_000) return;
    last = Date.now();
    try {
      await setDoc(ref, { uid: user.uid, email: user.email, page: (location.pathname + location.hash).slice(0, 100), state, at: serverTimestamp() });
    } catch { /* throttled by rules or offline — next beat retries */ }
  };
  beat('active', true);
  setInterval(() => { if (!document.hidden) beat('active', true); }, 60_000);
  document.addEventListener('visibilitychange', () => beat(document.hidden ? 'away' : 'active'));
  window.addEventListener('hashchange', () => beat('active'));
}

// Realtime: block the page the moment an admin blocks this account or IP, restore it when unblocked.
// Listeners only cost a read when the watched doc changes.
function watchBlocks(user, ip) {
  const state = { acct: false, ip: false };
  let shown = false;
  const apply = async () => {
    const blocked = state.acct || state.ip;
    if (blocked && !shown) {
      shown = true;
      showBlocked(state.acct ? '이 Google 계정은 관리자에 의해 차단되었습니다.' : '당신의 IP 주소는 관리자에 의해 차단되었습니다.');
      await logEvent(user, ip, 'blocked.attempt', `${state.acct ? 'account' : 'ip'} blocked (live) · ${location.pathname}`, { severity: 'warn', key: 'blocked_' + hourKey() });
    } else if (!blocked && shown) {
      location.reload();
    }
  };
  const refs = [[doc(db, 'blocked', user.uid), 'acct']];
  if (ip !== 'unknown') refs.push([doc(db, 'blockedIps', ip), 'ip']);
  // Fallback: re-check on focus and every 30s, in case a realtime listener can't connect.
  let polling = false;
  const recheck = async () => {
    for (const [ref, key] of refs) {
      try { state[key] = (await getDoc(ref)).exists(); } catch { /* ignore */ }
    }
    apply();
  };
  const startPolling = () => {
    if (polling) return;
    polling = true;
    setInterval(() => { if (!document.hidden) recheck(); }, 30_000);
  };
  for (const [ref, key] of refs) {
    onSnapshot(ref, (snap) => { state[key] = snap.exists(); apply(); }, (e) => { console.warn('block watch failed:', e.code || e.message); startPolling(); });
  }
  window.addEventListener('focus', recheck);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) recheck(); });
}

export function fillWho(user) {
  const el = document.getElementById('who');
  if (!el) return;
  el.innerHTML = (user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : '') + `<span>${esc(user.email)}</span>`;
  document.getElementById('logout')?.addEventListener('click', logout);
}

export { hourKey };
