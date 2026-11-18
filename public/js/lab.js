// Lab framework: modules register themselves with LAB.add({...}).
window.LAB = (function () {
  const modules = [];
  const LEVELS = {
    1: { name: '초급', desc: '보안의 기본기. 누구나 바로 써먹을 수 있는 개인 보안 습관과 개념.' },
    2: { name: '중급', desc: '웹 서비스 운영자 관점. 서버·브라우저 설정으로 공격을 막는 법.' },
    3: { name: '상급', desc: '보안 담당자 관점. 정책 설계, 로그 분석, 사고 대응, 코드 리뷰.' },
  };
  const KEY = 'sh_progress_v1';
  let done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { done = {}; }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => MX.esc(s);

  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // Animated terminal log
  function term(el) {
    return {
      clear() { el.innerHTML = ''; },
      async line(text, cls = '', delay = 180) {
        const d = document.createElement('div');
        if (cls) d.className = cls;
        d.textContent = text;
        el.appendChild(d);
        el.scrollTop = el.scrollHeight;
        if (delay) await sleep(delay);
      },
    };
  }

  async function complete(mod, score) {
    const first = !done[mod.id];
    done[mod.id] = { at: Date.now(), score };
    try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* ignore */ }
    if (typeof api.onComplete === 'function') api.onComplete(mod, score);
    const banner = document.getElementById('modbanner');
    if (banner) {
      banner.hidden = false;
      banner.innerHTML = `<b>✔ MISSION COMPLETE</b> — ${esc(mod.title)}${score != null ? ` · 점수 ${score}` : ''}${first ? '' : ' (재완료)'}`;
    }
  }

  function renderList(level) {
    document.querySelectorAll('[data-level]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.level === String(level))));
    document.getElementById('leveldesc').textContent = LEVELS[level].desc;
    const list = document.getElementById('modlist');
    list.innerHTML = '';
    modules.filter((m) => m.level === level).forEach((m, i) => {
      const card = h(`<button class="modcard ${done[m.id] ? 'done' : ''}">
        <div class="mc-top"><span class="lv lv${m.level}">${LEVELS[m.level].name} ${String(i + 1).padStart(2, '0')}</span>${done[m.id] ? '<span class="ok">✔ 완료</span>' : ''}</div>
        <div class="mc-title">${esc(m.title)}</div>
        <div class="mc-sum">${esc(m.summary)}</div>
      </button>`);
      card.addEventListener('click', () => open(m.id));
      list.appendChild(card);
    });
    const total = modules.length, n = modules.filter((m) => done[m.id]).length;
    document.getElementById('progress').textContent = `전체 진행도 ${n}/${total}`;
    try { localStorage.setItem('sh_level', String(level)); } catch { /* ignore */ }
  }

  function open(id) {
    const m = modules.find((x) => x.id === id);
    if (!m) return;
    document.getElementById('home').hidden = true;
    document.getElementById('module').hidden = false;
    document.getElementById('modhead').innerHTML = `
      <span class="lv lv${m.level}">${LEVELS[m.level].name}</span>
      <h1 class="glow" style="margin-top:8px">${esc(m.title)}</h1>
      <div class="two" style="margin:12px 0">
        <div class="card atk"><h4>위협</h4><p>${m.threat}</p></div>
        <div class="card def"><h4>방어</h4><ul>${m.defense.map((d) => `<li>${d}</li>`).join('')}</ul></div>
      </div>
      <div class="banner" id="modbanner" hidden></div>
      <h3>시뮬레이션</h3>`;
    const body = document.getElementById('modbody');
    body.innerHTML = '';
    m.render(body, { complete: (score) => complete(m, score), term, sleep, h, esc });
    if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
    window.scrollTo(0, 0);
  }

  function home() {
    document.getElementById('home').hidden = false;
    document.getElementById('module').hidden = true;
    let lv = 1;
    try { lv = Number(localStorage.getItem('sh_level')) || 1; } catch { /* ignore */ }
    renderList(lv);
  }

  function route() {
    const id = location.hash.slice(1);
    if (id && modules.some((m) => m.id === id)) open(id); else home();
  }

  const api = {
    add(m) { modules.push(m); },
    start() {
      document.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => renderList(Number(b.dataset.level))));
      document.getElementById('back').addEventListener('click', () => { history.pushState(null, '', location.pathname); home(); });
      window.addEventListener('popstate', route);
      route();
    },
  };
  return api;
})();
