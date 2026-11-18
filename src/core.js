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

// Public IP as seen from the internet (via api.ipify.org). Without a server this is the only way to learn it,
// so it is client-reported: good for monitoring, not a security boundary.
export async function getIp() {
  try { const c = sessionStorage.getItem('sh_ip'); if (c) return c; } catch { /* ignore */ }
  let ip = 'unknown';
  if (EMU) ip = params.get('ip') || '127.0.0.1';
  else {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch('https://api.ipify.org?format=json', { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      const j = await r.json();
      if (isIp(j.ip)) ip = j.ip;
    } catch { /* ignore */ }
  }
  try { if (ip !== 'unknown') sessionStorage.setItem('sh_ip', ip); } catch { /* ignore */ }
  return ip;
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

async function trackVisit(user, ip) {
  const ref = doc(db, 'visitors', user.uid);
  const base = {
    uid: user.uid, email: user.email,
    name: (user.displayName || '').slice(0, 100), photo: (user.photoURL || '').slice(0, 500),
    ip, ua: navigator.userAgent.slice(0, 300), path: location.pathname.slice(0, 100),
    lastSeen: serverTimestamp(),
  };
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { ...base, ips: [ip], hits: 1, firstSeen: serverTimestamp() });
    } else {
      const d = snap.data();
      const last = d.lastSeen ? d.lastSeen.toMillis() : 0;
      if (Date.now() - last < 31_000) return;
      const ips = d.ips || [];
      const upd = { ...base, hits: increment(1) };
      if (!ips.includes(ip) && ips.length < 20) upd.ips = arrayUnion(ip);
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
  const [ip, user] = await Promise.all([getIp(), authReady()]);
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
  await trackVisit(user, ip);
  watchBlocks(user, ip);
  return { user, ip, admin };
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
  const watch = (ref, key) => onSnapshot(ref, (snap) => { state[key] = snap.exists(); apply(); }, () => { /* ignore */ });
  watch(doc(db, 'blocked', user.uid), 'acct');
  if (ip !== 'unknown') watch(doc(db, 'blockedIps', ip), 'ip');
}

export function fillWho(user) {
  const el = document.getElementById('who');
  if (!el) return;
  el.innerHTML = (user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : '') + `<span>${esc(user.email)}</span>`;
  document.getElementById('logout')?.addEventListener('click', logout);
}

export { hourKey };
