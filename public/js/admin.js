(async function () {
  const me = await MX.me();
  if (!me) return;
  if (!me.admin) { location.href = '/lab'; return; }
  MX.fillWho(me);
  document.getElementById('logout').addEventListener('click', MX.logout);

  const $ = (id) => document.getElementById(id);
  const esc = MX.esc;
  const msg = $('msg');
  let data = null;
  let tab = 'visitors';

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const s = Math.round((Date.now() - d) / 1000);
    const rel = s < 60 ? `${s}초 전` : s < 3600 ? `${Math.round(s / 60)}분 전` : s < 86400 ? `${Math.round(s / 3600)}시간 전` : `${Math.round(s / 86400)}일 전`;
    return `<span title="${esc(d.toLocaleString('ko-KR'))}">${rel}</span>`;
  };
  const say = (text, ok) => { msg.textContent = text; msg.style.color = ok ? 'var(--g)' : 'var(--red)'; };

  function matches(...fields) {
    const q = $('filter').value.trim().toLowerCase();
    return !q || fields.some((f) => String(f || '').toLowerCase().includes(q));
  }

  function render() {
    if (!data) return;
    $('s-visitors').textContent = data.totals.visitors;
    $('s-active').textContent = data.totals.active24h;
    $('s-users').textContent = data.totals.users;
    $('s-blocked').textContent = data.totals.blocked;
    $('myip').textContent = data.you;
    $('updated').textContent = '갱신 ' + new Date().toLocaleTimeString('ko-KR');

    $('tv').innerHTML = data.visitors.filter((v) => matches(v.ip, v.emails.join(' '))).map((v) => {
      const self = v.ip === data.you;
      const action = v.blocked
        ? `<button class="small" data-unblock="${esc(v.ip)}">해제</button>`
        : self ? '<span class="muted">나</span>' : `<button class="small danger" data-block="${esc(v.ip)}">차단</button>`;
      return `<tr>
        <td class="${v.blocked ? 'red' : self ? 'cyan' : ''}">${esc(v.ip)}${v.blocked ? ' <span class="tag">BLOCKED</span>' : ''}</td>
        <td>${v.emails.length ? v.emails.map(esc).join('<br>') : '<span class="muted">(비로그인)</span>'}</td>
        <td>${v.hits}</td><td>${fmt(v.lastSeen)}</td><td>${fmt(v.firstSeen)}</td>
        <td class="muted">${esc(v.lastPath)}</td>
        <td class="muted" style="max-width:260px;font-size:11px">${esc(v.userAgent)}</td>
        <td>${action}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="muted">기록 없음</td></tr>';

    $('tb').innerHTML = data.blocked.filter((b) => matches(b.ip, b.reason, b.by)).map((b) => `<tr>
      <td class="red">${esc(b.ip)}</td><td>${esc(b.reason) || '<span class="muted">-</span>'}</td>
      <td class="muted">${esc(b.by)}</td><td>${fmt(b.at)}</td>
      <td><button class="small" data-unblock="${esc(b.ip)}">해제</button></td></tr>`).join('') ||
      '<tr><td colspan="5" class="muted">차단된 IP 없음</td></tr>';

    $('te').innerHTML = data.events.filter((e) => matches(e.ip, e.email, e.type, e.detail)).map((e) => `<tr>
      <td>${fmt(e.at)}</td>
      <td class="${e.severity === 'warn' ? 'amber' : ''}">${esc(e.type)}</td>
      <td>${esc(e.ip)}</td><td class="muted">${esc(e.email || '')}</td>
      <td class="muted">${esc(e.detail)}</td></tr>`).join('') ||
      '<tr><td colspan="5" class="muted">로그 없음</td></tr>';
  }

  async function load() {
    const r = await MX.api('/api/admin/overview');
    if (!r.ok) { say('불러오기 실패: ' + ((r.data && r.data.error) || r.status)); return; }
    data = r.data;
    render();
  }

  async function block(ip, reason) {
    const r = await MX.api('/api/admin/block', { method: 'POST', body: { ip, reason } });
    if (r.ok) say(`${ip} 차단 완료`, true); else say((r.data && r.data.error) || '차단 실패');
    await load();
  }
  async function unblock(ip) {
    const r = await MX.api('/api/admin/unblock', { method: 'POST', body: { ip } });
    if (r.ok) say(`${ip} 차단 해제`, true); else say((r.data && r.data.error) || '해제 실패');
    await load();
  }

  $('blockform').addEventListener('submit', (e) => {
    e.preventDefault();
    block($('bip').value.trim(), $('breason').value.trim()).then(() => { $('bip').value = ''; $('breason').value = ''; });
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-block]');
    if (b) {
      const ip = b.dataset.block;
      const reason = prompt(`${ip} 을(를) 차단합니다. 사유:`, '');
      if (reason !== null) block(ip, reason);
      return;
    }
    const u = e.target.closest('[data-unblock]');
    if (u && confirm(`${u.dataset.unblock} 차단을 해제할까요?`)) unblock(u.dataset.unblock);
  });
  document.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => {
    tab = t.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
  }));
  $('filter').addEventListener('input', render);

  await load();
  setInterval(() => { if ($('auto').checked && !document.hidden) load(); }, 5000);
})();
