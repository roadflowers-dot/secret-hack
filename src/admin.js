import { guard, fillWho, db, esc, isIp, logEvent, parseUA } from './core.js';
import {
  collection, query, where, orderBy, limit, onSnapshot, doc, setDoc, deleteDoc, getDocs, serverTimestamp,
} from 'firebase/firestore';

const ctx = await guard({ requireAdmin: true });
if (ctx) {
  const { user, ip: myIp } = ctx;
  fillWho(user);
  const $ = (id) => document.getElementById(id);
  const msg = $('msg');
  const state = { visitors: [], blocked: [], blockedIps: [], events: [], presence: [], labDone: [] };
  const MODULES = (window.LAB && LAB.list()) || [];
  let selected = null;
  $('myip').textContent = myIp;

  // ───────── formatting ─────────
  const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);
  const ago = (t) => {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    return s < 60 ? `${s}초 전` : s < 3600 ? `${Math.round(s / 60)}분 전` : s < 86400 ? `${Math.round(s / 3600)}시간 전` : `${Math.round(s / 86400)}일 전`;
  };
  const fmt = (ts) => {
    const t = ms(ts);
    return t ? `<span title="${esc(new Date(t).toLocaleString('ko-KR'))}">${ago(t)}</span>` : '<span class="muted">…</span>';
  };
  const clock = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const flag = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐');
  const place = (v) => (v.city || v.country ? `${flag(v.cc)} ${esc([v.city, v.country].filter(Boolean).join(', '))}` : '<span class="muted">위치 정보 없음</span>');
  const say = (text, ok) => { msg.textContent = text; msg.style.color = ok ? 'var(--g)' : 'var(--red)'; };
  const matches = (...fields) => {
    const q = $('filter').value.trim().toLowerCase();
    return !q || fields.some((f) => String(f || '').toLowerCase().includes(q));
  };

  // online = active heartbeat in the last 2.5 min; away = tab hidden
  const ONLINE_MS = 150_000;
  const presenceOf = (uid) => {
    const p = state.presence.find((x) => x.uid === uid);
    if (!p || Date.now() - ms(p.at) > ONLINE_MS) return { st: 'off', p };
    return { st: p.state === 'away' ? 'away' : 'on', p };
  };
  const statusCell = (uid, lastSeen) => {
    const { st } = presenceOf(uid);
    if (st === 'on') return '<span class="dot on"></span><span class="cyan">접속 중</span>';
    if (st === 'away') return '<span class="dot away"></span><span class="amber">자리 비움</span>';
    return `<span class="dot"></span><span class="muted">${ms(lastSeen) ? ago(ms(lastSeen)) : '오프라인'}</span>`;
  };
  const labsOf = (uid) => state.labDone.filter((e) => e.uid === uid);
  const progressCell = (uid) => {
    const n = new Set(labsOf(uid).map((e) => e.id.split('_lab_')[1])).size;
    const total = MODULES.length || 10;
    return `${n}/${total}<div class="mini"><i style="width:${Math.round((n / total) * 100)}%"></i></div>`;
  };
  const deviceCell = (v) => {
    const d = v.device || parseUA(v.ua);
    const extra = (v.devices || []).filter((x) => x !== d).length;
    return `${esc(d)}${extra ? ` <span class="tag" title="${esc((v.devices || []).join('\n'))}">+${extra}</span>` : ''}`;
  };

  // ───────── render ─────────
  function render() {
    const blockedUids = new Set(state.blocked.map((b) => b.uid));
    const blockedIps = new Set(state.blockedIps.map((b) => b.ip));
    const dayAgo = Date.now() - 86400_000;
    const online = state.visitors.filter((v) => presenceOf(v.uid).st !== 'off');
    $('s-visitors').textContent = state.visitors.length;
    $('s-online').textContent = online.length;
    $('onlinecount').textContent = online.length ? `(${online.length})` : '';
    $('s-active').textContent = state.visitors.filter((v) => ms(v.lastSeen) > dayAgo).length;
    $('s-users').textContent = blockedUids.size;
    $('s-blocked').textContent = blockedIps.size;
    $('updated').textContent = '실시간 · ' + new Date().toLocaleTimeString('ko-KR');

    const sorted = [...state.visitors].sort((a, b) => {
      const pa = presenceOf(a.uid).st !== 'off', pb = presenceOf(b.uid).st !== 'off';
      return pa !== pb ? (pa ? -1 : 1) : ms(b.lastSeen) - ms(a.lastSeen);
    });
    $('tv').innerHTML = sorted.filter((v) => matches(v.ip, v.email, v.name, v.city, v.country, v.org, v.device, (v.ips || []).join(' '))).map((v) => {
      const self = v.uid === user.uid;
      const ab = blockedUids.has(v.uid), ib = blockedIps.has(v.ip);
      const acctBtn = self ? '<span class="muted">나</span>'
        : ab ? `<button class="small" data-unblock-uid="${esc(v.uid)}">계정 해제</button>`
          : `<button class="small danger" data-block-uid="${esc(v.uid)}">계정 차단</button>`;
      const ipBtn = self || v.ip === myIp || !isIp(v.ip) ? ''
        : ib ? `<button class="small" data-unblock-ip="${esc(v.ip)}">IP 해제</button>`
          : `<button class="small danger" data-block-ip="${esc(v.ip)}">IP 차단</button>`;
      return `<tr data-uid="${esc(v.uid)}" class="${selected === v.uid ? 'sel' : ''}">
        <td style="white-space:nowrap">${statusCell(v.uid, v.lastSeen)}</td>
        <td class="${ab ? 'red' : ''}">${esc(v.email)}${ab ? ' <span class="tag">BLOCKED</span>' : ''}<div class="muted" style="font-size:11px">${esc(v.name)}</div></td>
        <td><span class="${ib ? 'red' : self ? 'cyan' : ''}">${esc(v.ip)}</span>${ib ? ' <span class="tag">IP BLOCKED</span>' : ''}<div style="font-size:12px">${place(v)}</div><div class="muted" style="font-size:11px">${esc(v.org || '')}</div></td>
        <td style="font-size:12px">${deviceCell(v)}</td>
        <td>${v.hits || 0}</td>
        <td style="font-size:12px">${progressCell(v.uid)}</td>
        <td>${fmt(v.lastSeen)}</td>
        <td style="white-space:nowrap">${acctBtn} ${ipBtn}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="muted">기록 없음</td></tr>';

    $('to').innerHTML = online.map((v) => {
      const { st, p } = presenceOf(v.uid);
      return `<tr><td style="white-space:nowrap">${statusCell(v.uid)}</td><td>${esc(v.email)}</td>
        <td class="cyan">${esc(p.page)}</td><td>${fmt(p.at)}</td>
        <td>${esc(v.ip)}<div style="font-size:12px">${place(v)}</div></td><td style="font-size:12px">${esc(v.device || parseUA(v.ua))}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="muted">지금 접속 중인 사람이 없습니다</td></tr>';

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

    if (selected) renderDetailHeader();
  }

  // ───────── visitor detail: profile, lab progress, timeline ─────────
  function renderDetailHeader() {
    const v = state.visitors.find((x) => x.uid === selected);
    if (!v) return;
    const { st, p } = presenceOf(v.uid);
    $('d-title').innerHTML = `${v.photo ? `<img src="${esc(v.photo)}" alt="" referrerpolicy="no-referrer" style="width:28px;height:28px;border-radius:50%;vertical-align:-6px;margin-right:8px">` : ''}${esc(v.email)}`;
    $('d-profile').innerHTML = `<h4>👤 프로필 · 접속 정보</h4><dl class="kv">
      <dt>상태</dt><dd>${statusCell(v.uid, v.lastSeen)}${st !== 'off' && p ? ` · <span class="cyan">${esc(p.page)}</span>` : ''}</dd>
      <dt>이름</dt><dd>${esc(v.name) || '-'}</dd>
      <dt>현재 IP</dt><dd>${esc(v.ip)}</dd>
      <dt>위치</dt><dd>${place(v)}${v.region && v.region !== v.city ? ` (${esc(v.region)})` : ''}</dd>
      <dt>통신사</dt><dd>${esc(v.org) || '-'}</dd>
      <dt>IP 이력</dt><dd>${(v.ips || []).map(esc).join('<br>') || '-'}</dd>
      <dt>기기</dt><dd>${(v.devices && v.devices.length ? v.devices : [v.device || parseUA(v.ua)]).map(esc).join('<br>')}</dd>
      <dt>방문 수</dt><dd>${v.hits || 0}회</dd>
      <dt>처음 접속</dt><dd>${ms(v.firstSeen) ? clock(ms(v.firstSeen)) : '-'}</dd>
      <dt>최근 접속</dt><dd>${ms(v.lastSeen) ? clock(ms(v.lastSeen)) : '-'}</dd></dl>`;
    const done = new Map(labsOf(v.uid).map((e) => [e.id.split('_lab_')[1], e]));
    const total = MODULES.length || 10;
    $('d-progress').innerHTML = `<h4>🎯 실습 진행도 ${done.size}/${total}</h4>
      <div class="meter" style="margin:6px 0 10px"><i style="width:${Math.round((done.size / total) * 100)}%;background:var(--g)"></i></div>
      ${[1, 2, 3].map((lv) => `<div style="font-size:13px;margin:6px 0 2px"><span class="lv lv${lv}">${LAB.levelName(lv)}</span></div>
        ${MODULES.filter((m) => m.level === lv).map((m) => {
          const e = done.get(m.id);
          const score = e && /score=(\d+)/.exec(e.detail || '');
          return `<div style="font-size:13px">${e ? '<span class="cyan">✔</span>' : '<span class="muted">○</span>'} ${esc(m.title)}${e ? ` <span class="muted">${score ? '· ' + score[1] + '점 ' : ''}· ${ms(e.at) ? ago(ms(e.at)) : ''}</span>` : ''}</div>`;
        }).join('')}`).join('')}`;
  }

  const TL_LABEL = {
    page: (d) => ['', `페이지 방문 <span class="cyan">${esc(d)}</span>`],
    'lab.open': (d) => ['tl-lab', `실습 열기 · ${esc(d.split(' · ')[1] || d)}`],
    'lab.complete': (d) => ['tl-done', `<b class="cyan">실습 완료</b> · ${esc(d)}`],
    'auth.login': () => ['tl-login', '로그인'],
    'blocked.attempt': (d) => ['tl-warn', `<span class="red">차단된 상태로 접근</span> · ${esc(d)}`],
    'admin.block': (d) => ['tl-warn', `관리자 차단 조치 · ${esc(d)}`],
    'admin.unblock': (d) => ['', `관리자 해제 조치 · ${esc(d)}`],
  };
  async function openDetail(uid) {
    selected = uid;
    $('detail').hidden = false;
    $('d-timeline').innerHTML = '<div class="muted">불러오는 중…</div>';
    render();
    $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const [acts, evs] = await Promise.all([
        getDocs(query(collection(db, 'activity'), where('uid', '==', uid), orderBy('at', 'desc'), limit(150))),
        getDocs(query(collection(db, 'events'), where('uid', '==', uid), limit(100))),
      ]);
      if (selected !== uid) return;
      const items = [...acts.docs, ...evs.docs].map((d) => d.data()).filter((x) => ms(x.at)).sort((a, b) => ms(b.at) - ms(a.at));
      $('d-timeline').innerHTML = items.map((x) => {
        const f = TL_LABEL[x.type] || ((d) => ['', `${esc(x.type)} · ${esc(d)}`]);
        const [cls, text] = f(x.detail || '');
        return `<div class="tl ${cls}"><span class="t">${clock(ms(x.at))}</span>${text}${x.ip ? ` <span class="muted">· ${esc(x.ip)}</span>` : ''}</div>`;
      }).join('') || '<div class="muted">활동 기록 없음</div>';
    } catch (e) {
      $('d-timeline').innerHTML = `<div class="red">타임라인을 불러오지 못했습니다: ${esc(e.code || e.message)}</div>` +
        (e.code === 'failed-precondition' ? '<div class="muted">Firestore 색인을 만드는 중일 수 있습니다. 몇 분 뒤 다시 시도하세요.</div>' : '');
    }
  }
  $('d-close').addEventListener('click', () => { selected = null; $('detail').hidden = true; render(); });

  // ───────── realtime listeners ─────────
  const listen = (name, q) => onSnapshot(q, (snap) => {
    state[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (e) => say(`${name} 불러오기 실패: ${e.code || e.message}`));
  listen('visitors', query(collection(db, 'visitors'), orderBy('lastSeen', 'desc'), limit(500)));
  listen('blocked', collection(db, 'blocked'));
  listen('blockedIps', collection(db, 'blockedIps'));
  listen('events', query(collection(db, 'events'), orderBy('at', 'desc'), limit(300)));
  listen('presence', collection(db, 'presence'));
  listen('labDone', query(collection(db, 'events'), where('type', '==', 'lab.complete')));
  setInterval(() => { if (!document.hidden) render(); }, 10_000); // refresh "n초 전" and online status

  // ───────── block / unblock ─────────
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
    if (t) {
      const d = t.dataset;
      if (d.blockIp) { const r = prompt(`IP ${d.blockIp} 을(를) 차단합니다. 사유:`, ''); if (r !== null) blockIp(d.blockIp, r); }
      else if (d.blockUid) { const r = prompt('이 계정을 차단합니다. 사유:', ''); if (r !== null) blockUid(d.blockUid, r); }
      else if (d.unblockIp) { if (confirm(`IP ${d.unblockIp} 차단을 해제할까요?`)) unblock('ip', d.unblockIp); }
      else if (d.unblockUid) { if (confirm('이 계정 차단을 해제할까요?')) unblock('uid', d.unblockUid); }
      return;
    }
    const row = e.target.closest('#tv tr[data-uid]');
    if (row) openDetail(row.dataset.uid);
  });
  document.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === tab)));
    document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
  }));
  $('filter').addEventListener('input', render);
}
