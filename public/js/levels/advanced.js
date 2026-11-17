// ═══════════════════════ 상급 ═══════════════════════

// ── A1. 로그 분석 & 사고 대응 ──
LAB.add({
  id: 'a-incident', level: 3,
  title: '침해 사고 대응: 로그 분석',
  summary: '가상 서버의 접근 로그에서 공격 IP를 찾아 차단하고, 올바른 사후 조치를 고릅니다.',
  threat: '공격은 대부분 로그에 흔적을 남깁니다. 짧은 시간의 대량 로그인 실패, 존재하지 않는 민감 경로를 훑는 스캐닝, 평소와 다른 시간·장소의 관리자 접근 등입니다.',
  defense: ['중앙 로그 수집 + 이상 패턴 알림', '탐지 → <b>격리(차단)</b> → 원인 제거 → 복구 → 재발 방지 순서', '침해된 계정의 <b>세션 전부 무효화</b> + 비밀번호 재설정', '증거 보존: 로그는 지우지 말고 사본 확보'],
  render(el, { complete, h, esc }) {
    // Documentation IP ranges only (RFC 5737).
    const N = ['192.0.2.10', '192.0.2.31', '192.0.2.57', '198.51.100.8'];
    const STUFF = '198.51.100.23', SCAN = '203.0.113.77';
    const lines = [];
    let t = Date.UTC(2026, 10, 17, 2, 13, 0);
    const add = (ip, m, p, s, ua = 'Mozilla/5.0') => { t += 700 + Math.floor(Math.random() * 2500); lines.push({ ip, m, p, s, ua, at: new Date(t).toISOString().slice(11, 19) }); };
    const pages = ['/', '/products', '/products/42', '/cart', '/about'];
    for (let i = 0; i < 6; i++) add(N[i % 4], 'GET', pages[i % 5], 200);
    for (const p of ['/.env', '/.git/config', '/backup.zip', '/wp-admin', '/phpmyadmin', '/server-status']) add(SCAN, 'GET', p, 404, 'python-requests/2.31');
    add(N[1], 'POST', '/login', 200);
    for (let i = 0; i < 9; i++) { add(STUFF, 'POST', '/login', 401, 'curl/8.4'); t -= 600; }
    add(N[2], 'GET', '/products/7', 200);
    add(STUFF, 'POST', '/login', 200, 'curl/8.4');
    add(STUFF, 'GET', '/admin/users/export', 200, 'curl/8.4');
    add(N[3], 'POST', '/login', 401); add(N[3], 'POST', '/login', 200);
    add(N[0], 'GET', '/cart', 200);
    add(SCAN, 'GET', '/admin', 302, 'python-requests/2.31');

    const ACTIONS = [
      { id: 'sess', t: '탈취된 계정(manager01)의 모든 세션 무효화 + 비밀번호 재설정', good: true },
      { id: 'export', t: '/admin/users/export 로 유출된 데이터 범위 확인, 필요 시 신고·고지', good: true },
      { id: 'mfa', t: '관리자 계정 전체에 2단계 인증 의무화', good: true },
      { id: 'rl', t: '로그인 API에 계정별 시도 제한 적용', good: true },
      { id: 'dellog', t: '공격 흔적이 남은 로그 삭제', good: false, why: '증거 인멸 — 원인 분석·법적 대응이 불가능해집니다.' },
      { id: 'reboot', t: '서버 재부팅으로 마무리', good: false, why: '재부팅은 공격자의 접근 권한(유효한 세션·비밀번호)을 없애지 못합니다.' },
      { id: 'blockall', t: '로그에 나온 모든 IP 차단', good: false, why: '정상 고객까지 차단됩니다. 근거 있는 IP만 차단하세요.' },
    ];
    const ips = [...new Set(lines.map((l) => l.ip))];
    const box = h(`<div>
      <p class="muted" style="font-size:13px">shop.example 접근 로그 (UTC). 관리자 계정 <code>manager01</code> 담당자가 "새벽에 로그인한 적이 없다"고 신고했습니다.</p>
      <div class="tbl" style="max-height:300px"><table><thead><tr><th>시각</th><th>IP</th><th>요청</th><th>상태</th><th>User-Agent</th></tr></thead><tbody>
        ${lines.map((l) => `<tr><td>${l.at}</td><td>${esc(l.ip)}</td><td>${l.m} ${esc(l.p)}</td><td class="${l.s >= 400 ? 'amber' : ''}">${l.s}</td><td class="muted">${esc(l.ua)}</td></tr>`).join('')}
      </tbody></table></div>
      <h3>1단계 — 차단할 IP 선택</h3>
      <div class="chips">${ips.map((ip) => `<label class="pick"><input type="checkbox" name="ip" value="${ip}"> ${ip}</label>`).join('')}</div>
      <h3>2단계 — 사후 조치 선택</h3>
      <div>${ACTIONS.map((a) => `<label class="pick" style="display:flex"><input type="checkbox" name="act" value="${a.id}"> ${esc(a.t)}</label>`).join('')}</div>
      <button id="go" style="margin-top:12px">▶ 대응 실행</button>
      <div class="out" id="out"></div>
    </div>`);
    el.appendChild(box);
    box.querySelector('#go').addEventListener('click', () => {
      const selIps = [...box.querySelectorAll('[name=ip]:checked')].map((x) => x.value);
      const selAct = new Set([...box.querySelectorAll('[name=act]:checked')].map((x) => x.value));
      const r = [];
      let score = 0;
      const want = [STUFF, SCAN];
      want.forEach((ip) => {
        if (selIps.includes(ip)) { score += 15; r.push(`✔ ${ip} 차단 — ${ip === STUFF ? '대량 로그인 실패 후 성공 → 관리자 데이터 내보내기 (크리덴셜 스터핑 성공)' : '민감 파일 경로 연속 스캔 (자동화 도구 UA)'}`); }
        else r.push(`✗ ${ip} 놓침 — ${ip === STUFF ? '9번 연속 401 뒤 200, 곧바로 /admin/users/export' : '/.env, /.git/config 등 존재하지 않는 민감 경로 스캔'}`);
      });
      const wrongIps = selIps.filter((ip) => !want.includes(ip));
      wrongIps.forEach((ip) => { score -= 10; r.push(`✗ ${ip} 는 정상 고객 (비밀번호 한 번 틀린 것은 정상 범위)`); });
      ACTIONS.forEach((a) => {
        if (a.good && selAct.has(a.id)) { score += 15; r.push(`✔ ${a.t}`); }
        else if (a.good) r.push(`△ 빠짐: ${a.t}`);
        else if (selAct.has(a.id)) { score -= 15; r.push(`✗ ${a.t} — ${a.why}`); }
      });
      score = Math.max(0, Math.min(100, score + 10));
      const out = box.querySelector('#out');
      out.className = 'out ' + (score >= 90 ? 'ok' : 'bad');
      out.textContent = `대응 점수 ${score}/100\n\n` + r.join('\n') + (score >= 90 ? '\n\n✔ 사고 대응 성공' : '\n\n90점 이상이면 통과입니다.');
      if (score >= 90) complete(score);
    });
  },
});

// ── A2. CSP 작성 ──
LAB.add({
  id: 'a-csp', level: 3,
  title: 'CSP 정책 직접 작성하기',
  summary: '조건에 맞는 Content-Security-Policy를 작성하고 자동 검사기로 평가받습니다.',
  threat: 'XSS가 생겨도 CSP가 제대로 설정돼 있으면 주입된 스크립트가 실행되지 않습니다. 반대로 <code>\'unsafe-inline\'</code>, <code>*</code> 같은 느슨한 설정은 CSP를 무력화합니다.',
  defense: ['<code>default-src \'self\'</code> 로 시작해 필요한 것만 연다', '<code>script-src</code> 에 <code>\'unsafe-inline\'</code>·<code>\'unsafe-eval\'</code>·와일드카드 금지 (nonce/hash 사용)', '<code>object-src \'none\'</code>, <code>base-uri</code>, <code>frame-ancestors</code>, <code>form-action</code> 지정', '배포 전 <code>Content-Security-Policy-Report-Only</code> 로 시험'],
  render(el, { complete, h }) {
    const box = h(`<div>
      <div class="card"><h4>요구사항 — app.example</h4><ul>
        <li>스크립트: 자기 도메인 + <code>https://cdn.example.com</code></li>
        <li>이미지: 자기 도메인 + <code>data:</code> URI</li>
        <li>API 호출: 자기 도메인 + <code>https://api.example.com</code></li>
        <li>다른 사이트가 이 페이지를 iframe에 넣으면 안 됨, 플러그인(object) 불필요</li></ul></div>
      <label for="csp">Content-Security-Policy:</label>
      <textarea id="csp" spellcheck="false" style="min-height:110px">default-src *; script-src * 'unsafe-inline' 'unsafe-eval'; img-src *</textarea>
      <button id="chk" style="margin-top:8px">▶ 검사</button>
      <div class="out" id="out"></div>
    </div>`);
    el.appendChild(box);
    box.querySelector('#chk').addEventListener('click', () => {
      const raw = box.querySelector('#csp').value.trim().replace(/^content-security-policy:\s*/i, '');
      const d = {};
      raw.split(';').map((x) => x.trim()).filter(Boolean).forEach((part) => {
        const [name, ...vals] = part.split(/\s+/);
        d[name.toLowerCase()] = vals.map((v) => v.toLowerCase());
      });
      const eff = (k) => d[k] || d['default-src'] || null;
      const issues = [], good = [];
      let score = 100;
      const bad = (pts, m) => { score -= pts; issues.push(m); };
      if (!d['default-src']) bad(15, "default-src 가 없음 → 지정 안 한 리소스는 제한 없이 허용");
      else if (d['default-src'].some((v) => v === '*' || v === 'http:' || v === 'https:')) bad(15, 'default-src 에 와일드카드 → 사실상 모든 출처 허용');
      else good.push('default-src 제한적');
      const s = eff('script-src') || [];
      if (!s.length) bad(25, 'script-src 미지정');
      if (s.includes("'unsafe-inline'") && !s.some((v) => v.startsWith("'nonce-") || v.startsWith("'sha"))) bad(25, "script-src 'unsafe-inline' → 주입된 인라인 스크립트가 실행됨 (CSP 핵심 무력화)");
      if (s.includes("'unsafe-eval'")) bad(10, "script-src 'unsafe-eval' → 문자열을 코드로 실행 허용");
      if (s.some((v) => v === '*' || v === 'http:' || v === 'https:' || v === 'data:')) bad(20, 'script-src 에 와일드카드/스킴 전체/data: → 아무 곳의 스크립트나 로드 가능');
      if (s.length && !s.includes("'self'")) bad(5, "script-src 에 'self' 없음 → 요구사항(자기 도메인 스크립트) 불충족");
      if (s.length && !s.includes('https://cdn.example.com')) bad(5, 'script-src 에 https://cdn.example.com 없음 → 요구사항 불충족');
      const im = eff('img-src') || [];
      if (!im.includes('data:')) bad(5, 'img-src 에 data: 없음 → 요구사항 불충족');
      const c = eff('connect-src') || [];
      if (!c.includes('https://api.example.com')) bad(5, 'connect-src 에 https://api.example.com 없음 → API 호출 실패');
      if (!(d['object-src'] && d['object-src'].join(' ') === "'none'")) bad(10, "object-src 'none' 없음 → 플러그인 기반 우회 가능");
      else good.push("object-src 'none'");
      if (!d['base-uri']) bad(5, "base-uri 없음 → <base> 태그로 상대 경로 스크립트 하이재킹 가능");
      if (!d['frame-ancestors'] || d['frame-ancestors'].includes('*')) bad(10, "frame-ancestors 없음 → 클릭재킹 가능 ('none' 또는 'self')");
      else good.push('frame-ancestors 지정');
      if (!d['form-action']) bad(3, 'form-action 없음 → 주입된 폼이 외부로 데이터 전송 가능');
      score = Math.max(0, score);
      const out = box.querySelector('#out');
      out.className = 'out ' + (score >= 95 ? 'ok' : score < 60 ? 'bad' : '');
      out.textContent = `점수 ${score}/100\n` + (issues.length ? '\n문제점:\n' + issues.map((x) => ' ✗ ' + x).join('\n') : '\n✔ 문제 없음') + (good.length ? '\n\n잘한 점:\n' + good.map((x) => ' ✔ ' + x).join('\n') : '') + (score >= 95 ? '\n\n✔ 통과 — 운영 반영 전 Report-Only 로 먼저 시험해 보세요.' : '\n\n95점 이상이면 통과입니다.');
      if (score >= 95) complete(score);
    });
  },
});

// ── A3. 심층 방어 설계 ──
LAB.add({
  id: 'a-defense-depth', level: 3,
  title: '심층 방어(Defense in Depth) 설계',
  summary: '한정된 보안 예산으로 방어 계층을 쌓아, 5단계 공격 시나리오 1,000회 중 성공률을 2% 미만으로.',
  threat: '실제 공격은 한 번에 끝나지 않고 <b>단계(킬 체인)</b>를 밟습니다. 초기 침투 → 계정 장악 → 권한 상승 → 데이터 반출 → 랜섬웨어. 어떤 단일 방어도 100%가 아니므로 여러 단계에 겹겹이 막아야 합니다.',
  defense: ['각 단계마다 최소 하나의 통제', '효과 대비 비용이 좋은 통제 우선 (MFA, 패치, 백업)', '예방이 실패해도 <b>탐지·복구</b>로 피해 최소화', '최소 권한 원칙으로 침해 범위 제한'],
  render(el, { complete, h, esc }) {
    const STAGES = ['① 피싱 메일로 초기 침투', '② 직원 계정 장악', '③ 웹앱 취약점으로 권한 상승', '④ 고객 DB 대량 반출', '⑤ 랜섬웨어로 서버 암호화'];
    const CTRL = [
      { id: 'train', n: '임직원 보안 교육·모의훈련', st: 0, p: 0.5, c: 10 },
      { id: 'mail', n: '메일 필터링·첨부파일 샌드박스', st: 0, p: 0.6, c: 15 },
      { id: 'mfa', n: '전 직원 2단계 인증', st: 1, p: 0.9, c: 15 },
      { id: 'ueba', n: '로그인 이상 탐지', st: 1, p: 0.5, c: 15 },
      { id: 'patch', n: '정기 패치·시큐어 코딩 리뷰', st: 2, p: 0.7, c: 20 },
      { id: 'waf', n: '웹 방화벽(WAF)', st: 2, p: 0.5, c: 20 },
      { id: 'priv', n: '최소 권한·DB 접근 통제', st: 3, p: 0.7, c: 15 },
      { id: 'dlp', n: '대량 반출 탐지(DLP)', st: 3, p: 0.5, c: 20 },
      { id: 'edr', n: '엔드포인트 탐지·대응(EDR)', st: 4, p: 0.6, c: 25 },
      { id: 'backup', n: '오프라인 백업 + 복구 훈련', st: 4, p: 0.8, c: 10 },
    ];
    const BUDGET = 100;
    const box = h(`<div>
      <p>예산 <b>${BUDGET}</b> 안에서 방어 수단을 고르세요. 수치는 해당 단계에서 공격을 막을 확률(교육용 가정치)입니다.</p>
      <div id="ctrls"></div>
      <div class="muted" id="bud" style="margin:8px 0"></div>
      <button id="run">▶ 공격 1,000회 시뮬레이션</button>
      <div class="out" id="out"></div>
    </div>`);
    el.appendChild(box);
    const ctrls = box.querySelector('#ctrls');
    STAGES.forEach((s, i) => {
      ctrls.appendChild(h(`<div class="card" style="margin:6px 0;padding:8px 12px"><b style="font-weight:400" class="amber">${esc(s)}</b>
        ${CTRL.filter((c) => c.st === i).map((c) => `<label class="pick" style="display:flex"><input type="checkbox" value="${c.id}"> ${esc(c.n)} <span class="muted">· 차단 ${Math.round(c.p * 100)}% · 비용 ${c.c}</span></label>`).join('')}</div>`));
    });
    const sel = () => CTRL.filter((c) => ctrls.querySelector(`[value="${c.id}"]`).checked);
    const upd = () => {
      const cost = sel().reduce((a, c) => a + c.c, 0);
      const b = box.querySelector('#bud');
      b.textContent = `사용 예산 ${cost} / ${BUDGET}`;
      b.style.color = cost > BUDGET ? 'var(--red)' : '';
      box.querySelector('#run').disabled = cost > BUDGET;
    };
    ctrls.addEventListener('change', upd);
    upd();
    box.querySelector('#run').addEventListener('click', () => {
      const chosen = sel();
      const passP = STAGES.map((_, i) => chosen.filter((c) => c.st === i).reduce((a, c) => a * (1 - c.p), 1));
      const reach = [1000];
      for (let i = 0; i < STAGES.length; i++) {
        let n = 0;
        for (let k = 0; k < reach[i]; k++) if (Math.random() < passP[i]) n++;
        reach.push(n);
      }
      const bar = (n) => '█'.repeat(Math.round(n / 25)) || (n ? '▏' : '');
      const rate = reach[5] / 10;
      const lines = STAGES.map((s, i) => `${s.padEnd(18)} 통과 ${String(reach[i + 1]).padStart(4)}회  ${bar(reach[i + 1])}`);
      const pass = rate < 2;
      const out = box.querySelector('#out');
      out.className = 'out ' + (pass ? 'ok' : 'bad');
      out.textContent = `공격 1,000회 → 최종 성공 ${reach[5]}회 (${rate.toFixed(1)}%)\n\n` + lines.join('\n') +
        (pass ? '\n\n✔ 목표 달성 — 여러 단계에 방어를 나눠 배치하는 것이 핵심입니다.' : '\n\n목표: 최종 성공률 2% 미만. 한 단계에 몰지 말고 단계마다 하나씩 배치해 보세요.');
      if (pass) complete(Math.round(100 - rate * 10));
    });
  },
});

// ── A4. 시큐어 코드 리뷰 ──
LAB.add({
  id: 'a-code-review', level: 3,
  title: '시큐어 코드 리뷰',
  summary: '같은 기능을 하는 두 코드 중 안전한 쪽을 고르고 이유를 확인합니다.',
  threat: '대부분의 웹 취약점은 개발 단계의 작은 실수에서 시작합니다. 입력을 코드처럼 다루거나, 출력할 때 인코딩을 빼먹거나, 비밀값을 코드에 넣는 실수들입니다.',
  defense: ['입력은 항상 <b>데이터로만</b> 취급 (파라미터 바인딩)', '출력 위치에 맞는 <b>인코딩</b>', '경로·리다이렉트는 <b>허용 목록</b>으로 검증', '비밀번호는 느린 전용 해시(bcrypt/scrypt/Argon2)', '비밀값은 환경변수·비밀 관리 서비스로'],
  render(el, { complete, h, esc }) {
    const Q = [
      { topic: 'DB 조회', a: 'db.query("SELECT * FROM orders WHERE id = " + req.params.id)', b: 'db.query("SELECT * FROM orders WHERE id = ?", [req.params.id])', safe: 'b', why: '파라미터 바인딩은 입력을 SQL 문법과 분리합니다. 문자열 결합은 입력이 쿼리 구조를 바꿀 수 있습니다 (SQL 인젝션).' },
      { topic: '댓글 출력', a: 'commentEl.textContent = comment.body;', b: 'commentEl.innerHTML = comment.body;', safe: 'a', why: 'textContent 는 문자 그대로 표시합니다. innerHTML 은 사용자 입력을 HTML로 해석해 스크립트 삽입(XSS)이 가능합니다.' },
      { topic: '파일 다운로드', a: "const p = path.resolve(BASE, name);\nif (!p.startsWith(BASE + path.sep)) return res.sendStatus(403);\nres.sendFile(p);", b: 'res.sendFile(BASE + "/" + req.query.name);', safe: 'a', why: '경로를 정규화한 뒤 허용 폴더 안인지 확인해야 합니다. 그대로 이어 붙이면 상위 폴더 이동(경로 탐색)으로 다른 파일에 접근될 수 있습니다.' },
      { topic: '비밀번호 저장', a: 'user.hash = sha256(password);', b: 'user.hash = await bcrypt.hash(password, 12);', safe: 'b', why: 'SHA-256 은 너무 빨라 유출 시 초당 수십억 번 대입됩니다. bcrypt 같은 느린 해시 + 자동 솔트가 정답입니다.' },
      { topic: '로그인 후 이동', a: 'res.redirect(req.query.next);', b: "const next = req.query.next;\nres.redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');", safe: 'b', why: '검증 없는 리다이렉트는 공식 도메인 링크로 피싱 사이트에 보내는 데 악용됩니다 (오픈 리다이렉트). 내부 경로만 허용하세요.' },
      { topic: 'API 키', a: 'const stripe = new Stripe(process.env.STRIPE_KEY);', b: "const stripe = new Stripe('sk_live_51H...');", safe: 'a', why: '코드에 넣은 키는 저장소·빌드 결과물을 통해 유출됩니다. 환경변수나 비밀 관리 서비스를 쓰고, 유출 시 즉시 교체하세요.' },
      { topic: '권한 확인', a: "app.delete('/posts/:id', auth, async (req, res) => {\n  await Post.deleteOne({ _id: req.params.id });\n});", b: "app.delete('/posts/:id', auth, async (req, res) => {\n  await Post.deleteOne({ _id: req.params.id, owner: req.user.id });\n});", safe: 'b', why: '로그인 여부만 보고 소유자 확인을 안 하면 남의 글 ID만 바꿔 삭제할 수 있습니다 (IDOR / 접근 통제 실패 — OWASP 1위).' },
    ];
    let i = 0, score = 0;
    const box = h(`<div>
      <div class="muted" id="q" style="font-size:13px"></div>
      <div class="two" id="pair"></div>
      <div class="out" id="out">더 안전한 코드를 클릭하세요.</div>
    </div>`);
    el.appendChild(box);
    const show = () => {
      const q = Q[i];
      box.querySelector('#q').textContent = `문제 ${i + 1} / ${Q.length} · 주제: ${q.topic} · 점수 ${score}`;
      const pair = box.querySelector('#pair');
      pair.innerHTML = '';
      ['a', 'b'].forEach((k) => {
        const btn = h(`<button class="codepick"><div class="muted" style="font-size:12px">코드 ${k.toUpperCase()}</div><pre style="margin:4px 0 0">${esc(q[k])}</pre></button>`);
        btn.addEventListener('click', () => pick(k));
        pair.appendChild(btn);
      });
    };
    const pick = (k) => {
      const q = Q[i];
      const ok = k === q.safe;
      if (ok) score++;
      box.querySelectorAll('.codepick').forEach((b, idx) => { b.disabled = true; b.classList.add(['a', 'b'][idx] === q.safe ? 'right' : 'wrong'); });
      const out = box.querySelector('#out');
      out.className = 'out ' + (ok ? 'ok' : 'bad');
      out.textContent = `${ok ? '정답' : '오답'} — 안전한 코드는 ${q.safe.toUpperCase()}\n${q.why}`;
      i++;
      setTimeout(() => {
        if (i < Q.length) return show();
        const pass = score >= 6;
        out.className = 'out ' + (pass ? 'ok' : 'bad');
        out.textContent = `최종 ${score}/${Q.length}. ` + (pass ? '통과!' : '6개 이상 맞히면 통과입니다.');
        if (pass) complete(score);
        else { const r = h('<button style="margin-top:8px">다시 하기</button>'); r.addEventListener('click', () => { i = 0; score = 0; r.remove(); show(); }); box.appendChild(r); }
      }, 2600);
    };
    show();
  },
});
