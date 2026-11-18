import { guard, fillWho, app, emulatorMode, esc, isIp, logEvent } from './core.js';
import {
  getFirestore, connectFirestoreEmulator,
  collection, query, orderBy, limit, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';

// The admin page needs live listeners, so it uses the full Firestore SDK (other pages use the lighter Lite SDK).
const db = getFirestore(app);
if (emulatorMode) connectFirestoreEmulator(db, '127.0.0.1', 8080);

const ctx = await guard({ requireAdmin: true });
if (ctx) {
  const { user, ip: myIp } = ctx;
  fillWho(user);
  const $ = (id) => document.getElementById(id);
  const msg = $('msg');
  const state = { visitors: [], blocked: [], blockedIps: [], events: [] };
  $('myip').textContent = myIp;

  const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);
  const fmt = (ts) => {
    const t = ms(ts);
    if (!t) return '<span class="muted">…</span>';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    const rel = s < 60 ? `${s}초 전` : s < 3600 ? `${Math.round(s / 60)}분 전` : s < 86400 ? `${Math.round(s / 3600)}시간 전` : `${Math.round(s / 86400)}일 전`;
    return `<span title="${esc(new Date(t).toLocaleString('ko-KR'))}">${rel}</span>`;
  };
  const say = (text, ok) => { msg.textContent = text; msg.style.color = ok ? 'var(--g)' : 'var(--red)'; };
  const matches = (...fields) => {
    const q = $('filter').value.trim().toLowerCase();
    return !q || fields.some((f) => String(f || '').toLowerCase().includes(q));
  };

  function render() {
    const blockedUids = new Set(state.blocked.map((b) => b.uid));
    const blockedIps = new Set(state.blockedIps.map((b) => b.ip));
    const dayAgo = Date.now() - 86400_000;
    $('s-visitors').textContent = state.visitors.length;
    $('s-active').textContent = state.visitors.filter((v) => ms(v.lastSeen) > dayAgo).length;
    $('s-users').textContent = blockedUids.size;
    $('s-blocked').textContent = blockedIps.size;
    $('updated').textContent = '실시간 · ' + new Date().toLocaleTimeString('ko-KR');

    $('tv').innerHTML = state.visitors.filter((v) => matches(v.ip, v.email, v.name, (v.ips || []).join(' '))).map((v) => {
      const self = v.uid === user.uid;
      const ab = blockedUids.has(v.uid), ib = blockedIps.has(v.ip);
      const acctBtn = self ? '<span class="muted">나</span>'
        : ab ? `<button class="small" data-unblock-uid="${esc(v.uid)}">계정 해제</button>`
          : `<button class="small danger" data-block-uid="${esc(v.uid)}">계정 차단</button>`;
      const ipBtn = self || v.ip === myIp || !isIp(v.ip) ? ''
        : ib ? `<button class="small" data-unblock-ip="${esc(v.ip)}">IP 해제</button>`
          : `<button class="small danger" data-block-ip="${esc(v.ip)}">IP 차단</button>`;
      const others = (v.ips || []).filter((x) => x !== v.ip);
      return `<tr>
        <td class="${ib ? 'red' : self ? 'cyan' : ''}">${esc(v.ip)}${ib ? ' <span class="tag">IP BLOCKED</span>' : ''}${others.length ? `<div class="muted" style="font-size:11px">이전: ${others.map(esc).join(', ')}</div>` : ''}</td>
        <td class="${ab ? 'red' : ''}">${esc(v.email)}${ab ? ' <span class="tag">BLOCKED</span>' : ''}<div class="muted" style="font-size:11px">${esc(v.name)}</div></td>
        <td>${v.hits || 0}</td><td>${fmt(v.lastSeen)}</td><td>${fmt(v.firstSeen)}</td>
        <td class="muted">${esc(v.path)}</td>
        <td class="muted" style="max-width:240px;font-size:11px">${esc(v.ua)}</td>
        <td style="white-space:nowrap">${acctBtn} ${ipBtn}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="muted">기록 없음</td></tr>';

    const rows = [
      ...state.blocked.map((b) => ({ kind: '계정', key: b.email || b.uid, sub: b.ip, reason: b.reason, by: b.by, at: b.at, btn: `<button class="small" data-unblock-uid="${esc(b.uid)}">해제</button>` })),
      ...state.blockedIps.map((b) => ({ kind: 'IP', key: b.ip, sub: '', reason: b.reason, by: b.by, at: b.at, btn: `<button class="small" data-unblock-ip="${esc(b.ip)}">해제</button>` })),
    ].filter((r) => matches(r.key, r.reason, r.by)).sort((a, b) => ms(b.at) - ms(a.at));
    $('tb').innerHTML = rows.map((r) => `<tr><td><span class="tag">${r.kind}</span></td>
      <td class="red">${esc(r.key)}${r.sub ? `<div class="muted" style="font-size:11px">${esc(r.sub)}</div>` : ''}</td>
      <td>${esc(r.reason) || '<span class="muted">-</span>'}</td><td class="muted">${esc(r.by)}</td><td>${fmt(r.at)}</td><td>${r.btn}</td></tr>`).join('') ||
      '<tr><td colspan="6" class="muted">차단 없음</td></tr>';

    $('te').innerHTML = state.events.filter((e) => matches(e.ip, e.email, e.type, e.detail)).map((e) => `<tr>
      <td>${fmt(e.at)}</td><td class="${e.severity === 'warn' ? 'amber' : ''}">${esc(e.type)}</td>
      <td>${esc(e.ip)}</td><td class="muted">${esc(e.email)}</td><td class="muted">${esc(e.detail)}</td></tr>`).join('') ||
      '<tr><td colspan="5" class="muted">로그 없음</td></tr>';
  }

  const listen = (name, q) => onSnapshot(q, (snap) => {
    state[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (e) => say(`${name} 불러오기 실패: ${e.code || e.message}`));
  listen('visitors', query(collection(db, 'visitors'), orderBy('lastSeen', 'desc'), limit(500)));
  listen('blocked', collection(db, 'blocked'));
  listen('blockedIps', collection(db, 'blockedIps'));
  listen('events', query(collection(db, 'events'), orderBy('at', 'desc'), limit(300)));
  setInterval(() => { if (!document.hidden) render(); }, 15000);

  const audit = (type, detail) => logEvent(user, myIp, type, detail, { severity: 'warn' });

  async function blockIp(ip, reason) {
    if (!isIp(ip)) return say('올바른 IP 주소가 아닙니다.');
    if (ip === myIp) return say('자기 자신의 현재 IP는 차단할 수 없습니다.');
    try {
      await setDoc(doc(db, 'blockedIps', ip), { ip, reason: reason.slice(0, 200), by: user.email, at: serverTimestamp() });
      await audit('admin.block', `IP ${ip} (${reason})`);
      say(`${ip} 차단 완료`, true);
    } catch (e) { say('차단 실패: ' + (e.code || e.message)); }
  }
  async function blockUid(uid, reason) {
    const v = state.visitors.find((x) => x.uid === uid) || {};
    try {
      await setDoc(doc(db, 'blocked', uid), { uid, email: v.email || '', ip: v.ip || '', reason: reason.slice(0, 200), by: user.email, at: serverTimestamp() });
      await audit('admin.block', `account ${v.email || uid} (${reason})`);
      say(`${v.email || uid} 계정 차단 완료`, true);
    } catch (e) { say('차단 실패: ' + (e.code || e.message)); }
  }
  async function unblock(kind, key) {
    try {
      await deleteDoc(doc(db, kind === 'ip' ? 'blockedIps' : 'blocked', key));
      const label = kind === 'ip' ? key : (state.blocked.find((b) => b.uid === key) || {}).email || key;
      await audit('admin.unblock', `${kind === 'ip' ? 'IP' : 'account'} ${label}`);
      say(`${label} 차단 해제`, true);
    } catch (e) { say('해제 실패: ' + (e.code || e.message)); }
  }

  $('blockform').addEventListener('submit', async (e) => {
    e.preventDefault();
    await blockIp($('bip').value.trim(), $('breason').value.trim());
    $('bip').value = ''; $('breason').value = '';
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.blockIp) { const r = prompt(`IP ${d.blockIp} 을(를) 차단합니다. 사유:`, ''); if (r !== null) blockIp(d.blockIp, r); }
    else if (d.blockUid) { const r = prompt('이 계정을 차단합니다. 사유:', ''); if (r !== null) blockUid(d.blockUid, r); }
    else if (d.unblockIp) { if (confirm(`IP ${d.unblockIp} 차단을 해제할까요?`)) unblock('ip', d.unblockIp); }
    else if (d.unblockUid) { if (confirm('이 계정 차단을 해제할까요?')) unblock('uid', d.unblockUid); }
  });
  document.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === tab)));
    document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
  }));
  $('filter').addEventListener('input', render);
}
