// ═══════════════════════ 중급 ═══════════════════════

// ── I1. 무차별 대입 방어 설계 ──
LAB.add({
  id: 'i-bruteforce', level: 2,
  title: '로그인 무차별 대입 막기',
  summary: '시도 횟수 제한·잠금·지연·CAPTCHA를 조합해 봇 공격을 막되, 진짜 사용자는 불편하지 않게.',
  threat: '봇이 로그인 폼에 초당 수백~수천 번 비밀번호를 대입합니다. IP 하나로 막으면 수천 개의 IP(봇넷)로 분산해서 다시 들어옵니다.',
  defense: ['<b>계정 단위</b> + IP 단위 시도 제한을 함께', '실패할수록 점점 늘어나는 지연 (지수 백오프)', '일정 횟수 실패 후 CAPTCHA', '"아이디가 없음" / "비밀번호 틀림"을 구분하지 않는 동일한 오류 메시지', '이상 징후 알림 + 2단계 인증'],
  render(el, { complete, h }) {
    const box = h(`<div>
      <div class="two">
        <div class="card">
          <h4>🛡 방어 설정</h4>
          <label for="lim">잠금 기준: <b id="limv"></b></label><input type="range" id="lim" min="0" max="20" value="0">
          <label for="lock">잠금 시간: <b id="lockv"></b>분</label><input type="range" id="lock" min="1" max="60" value="15">
          <label for="scope">제한 기준</label><select id="scope"><option value="ip">IP 주소별</option><option value="acct">계정별</option><option value="both">IP + 계정 둘 다</option></select>
          <label for="delay">실패 시 응답 지연: <b id="delayv"></b>초</label><input type="range" id="delay" min="0" max="5" step="0.5" value="0">
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="cap" style="width:auto"> 3회 실패 후 CAPTCHA</label>
        </div>
        <div class="card">
          <h4>☠ 공격자</h4>
          <label for="bots">봇넷 규모</label><select id="bots"><option value="1">IP 1개</option><option value="50">IP 50개</option><option value="5000">IP 5,000개</option></select>
          <p class="muted" style="font-size:13px;margin-top:10px">목표 계정 1개 · 비밀번호 사전 1만 개 · IP당 초당 20회 시도 · 정답은 사전의 약 6,000번째</p>
          <h4 style="margin-top:12px">👤 진짜 사용자</h4>
          <p class="muted" style="font-size:13px">비밀번호를 가끔 2번 정도 틀립니다.</p>
        </div>
      </div>
      <button id="run" style="margin-top:12px">▶ 24시간 시뮬레이션</button>
      <div class="out" id="out"></div>
      <h3>목표</h3><p class="muted">IP 5,000개 봇넷을 상대로 24시간 동안 계정을 지키면서, 진짜 사용자가 잠기지 않게 하세요.</p>
    </div>`);
    el.appendChild(box);
    const $ = (s) => box.querySelector(s);
    const sync = () => {
      $('#limv').textContent = $('#lim').value === '0' ? '제한 없음' : `연속 실패 ${$('#lim').value}회`;
      $('#lockv').textContent = $('#lock').value;
      $('#delayv').textContent = $('#delay').value;
    };
    box.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', sync));
    sync();

    $('#run').addEventListener('click', () => {
      const lim = +$('#lim').value, lockMin = +$('#lock').value, scope = $('#scope').value, delay = +$('#delay').value, cap = $('#cap').checked, bots = +$('#bots').value;
      const TARGET = 6000, DAY = 86400;
      const perIpRate = delay > 0 ? Math.min(20, 1 / delay) : 20; // a slow response throttles each connection
      let rate = perIpRate * bots;                                 // attempts / second overall
      const notes = [];
      if (cap) { rate = Math.min(rate, bots * 0.02); notes.push('CAPTCHA: 자동화가 막혀 사람 손(유료 풀이 서비스)으로만 진행 → IP당 시간당 수십 회'); }
      let totalTries;
      if (lim > 0 && (scope === 'acct' || scope === 'both')) {
        // whole account locks after lim failures; then lockMin minutes
        const cycles = DAY / (lockMin * 60);
        totalTries = Math.min(rate * DAY, lim * cycles);
        notes.push(`계정 잠금: ${lockMin}분마다 최대 ${lim}회만 시도 가능 (IP 수와 무관)`);
      } else if (lim > 0 && scope === 'ip') {
        const cycles = DAY / (lockMin * 60);
        totalTries = Math.min(rate * DAY, bots * lim * cycles);
        notes.push(`IP별 잠금: IP ${bots.toLocaleString()}개 × ${lim}회 → 봇넷이 클수록 무력화`);
      } else {
        totalTries = rate * DAY;
        notes.push('시도 횟수 제한 없음');
      }
      const breached = totalTries >= TARGET;
      const hours = breached ? TARGET / (totalTries / DAY) / 3600 : null;
      // legit user: fails twice sometimes
      const userLocked = lim > 0 && lim <= 2;
      const userAnnoyed = delay >= 3 || (lim > 0 && lockMin >= 45 && lim <= 3);
      const lines = [
        `24시간 동안 공격자 시도 횟수: 약 ${Math.round(totalTries).toLocaleString('ko-KR')}회 / 필요 ${TARGET.toLocaleString()}회`,
        ...notes.map((n) => '· ' + n),
        '',
        breached ? `✗ 계정 탈취 — 약 ${hours < 1 ? Math.max(1, Math.round(hours * 60)) + '분' : hours.toFixed(1) + '시간'} 만에 비밀번호 발견` : '✔ 계정 방어 성공',
        userLocked ? '✗ 진짜 사용자 잠김 — 2번 틀리는 사용자도 잠깁니다 (기준이 너무 낮음)' : userAnnoyed ? '△ 진짜 사용자 불편 — 지연/잠금이 과도해 고객 문의가 폭주합니다' : '✔ 진짜 사용자 정상 이용',
      ];
      const ok = !breached && !userLocked && !userAnnoyed;
      $('#out').className = 'out ' + (ok ? 'ok' : 'bad');
      $('#out').textContent = lines.join('\n');
      if (ok && bots >= 5000) complete(100);
      else if (ok) $('#out').textContent += '\n\n이제 봇넷 규모를 IP 5,000개로 올려 보세요.';
    });
  },
});

// ── I2. 세션 쿠키 보안 속성 ──
LAB.add({
  id: 'i-cookie', level: 2,
  title: '세션 쿠키 지키기',
  summary: 'HttpOnly · Secure · SameSite 속성이 각각 어떤 공격을 막는지 확인합니다.',
  threat: '로그인 상태를 담은 세션 쿠키를 빼앗기면 비밀번호 없이도 계정이 넘어갑니다. 페이지에 끼어든 스크립트, 암호화되지 않은 통신 도청, 다른 사이트에서 몰래 보내는 요청(CSRF)이 쿠키를 노립니다.',
  defense: ['<code>HttpOnly</code> — 자바스크립트가 쿠키를 읽지 못함', '<code>Secure</code> — HTTPS 연결에서만 전송', '<code>SameSite=Lax/Strict</code> — 다른 사이트에서 시작된 요청에 쿠키를 붙이지 않음', '짧은 만료 시간, 로그아웃 시 무효화, CSRF 토큰 병행'],
  render(el, { complete, h, term }) {
    const cookieNames = document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean);
    const box = h(`<div>
      <div class="card" style="margin-bottom:12px">
        <h4>🔍 이 사이트의 실제 상태</h4>
        <p style="margin:0">자바스크립트로 <code>document.cookie</code> 를 읽은 결과: <b class="cyan">${cookieNames.length ? cookieNames.length + '개 (' + cookieNames.join(', ') + ')' : '쿠키 없음'}</b></p>
        <p style="margin:6px 0 0">이 사이트는 쿠키 세션 대신 <b>Firebase 인증 토큰</b>을 브라우저 저장소(IndexedDB)에 보관합니다. 이 토큰은 스크립트로 읽을 수 있어 HttpOnly 보호를 받지 못하므로, 대신 <b>CSP</b>로 외부 스크립트 실행을 막고 토큰을 1시간마다 자동 교체해 피해를 줄입니다. 방식마다 지켜야 할 지점이 다르다는 것이 핵심입니다.</p>
      </div>
      <div class="row">
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ho" style="width:auto"> HttpOnly</label>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sec" style="width:auto"> Secure</label>
        <div><label for="ss">SameSite</label><select id="ss"><option value="None">None</option><option value="Lax">Lax</option><option value="Strict">Strict</option></select></div>
        <button id="run">▶ 공격 3종 시뮬레이션</button>
      </div>
      <pre id="hdr"></pre>
      <div class="out termlog" id="log"></div>
    </div>`);
    el.appendChild(box);
    const $ = (s) => box.querySelector(s);
    const t = term($('#log'));
    const hdr = () => {
      $('#hdr').textContent = `Set-Cookie: session=a8f3…; Path=/${$('#ho').checked ? '; HttpOnly' : ''}${$('#sec').checked ? '; Secure' : ''}; SameSite=${$('#ss').value}`;
    };
    box.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', hdr));
    hdr();
    let busy = false;
    $('#run').addEventListener('click', async () => {
      if (busy) return; busy = true;
      const ho = $('#ho').checked, sec = $('#sec').checked, ss = $('#ss').value;
      t.clear();
      let blocked = 0;
      await t.line('── 시나리오 1: 게시판에 삽입된 악성 스크립트가 쿠키를 외부로 전송 시도');
      if (ho) { await t.line('   브라우저: HttpOnly 쿠키는 스크립트에서 보이지 않음 → 탈취 실패 ✔', 'ok'); blocked++; }
      else await t.line('   스크립트가 세션 쿠키를 읽어 공격자 서버로 전송 → 세션 탈취 ✗', 'red');
      await t.line('── 시나리오 2: 카페 공용 Wi-Fi, 사용자가 http:// 주소로 접속');
      if (sec) { await t.line('   브라우저: Secure 쿠키는 http 요청에 붙이지 않음 → 도청해도 쿠키 없음 ✔', 'ok'); blocked++; }
      else await t.line('   평문 요청에 쿠키가 실려 같은 네트워크의 공격자가 엿봄 ✗', 'red');
      await t.line('── 시나리오 3: 악성 사이트가 숨겨진 폼으로 "송금" POST 요청 자동 제출');
      if (ss === 'Lax' || ss === 'Strict') { await t.line(`   브라우저: SameSite=${ss} → 다른 사이트발 POST에 쿠키 미첨부 → 로그인 안 된 요청으로 거부 ✔`, 'ok'); blocked++; }
      else await t.line('   SameSite=None → 쿠키가 함께 전송되어 송금 실행 ✗ (CSRF 토큰이 없다면)', 'red');
      await t.line(`RESULT: ${blocked}/3 방어`, blocked === 3 ? 'ok' : 'red', 0);
      if (blocked === 3) complete(100);
      busy = false;
    });
  },
});

// ── I3. 보안 헤더 ──
LAB.add({
  id: 'i-headers', level: 2,
  title: '보안 헤더 점검',
  summary: '이 사이트의 실제 응답 헤더를 점검하고, 가상 사이트에 헤더를 설정해 A등급을 받습니다.',
  threat: '헤더 몇 줄이 없어서 생기는 공격이 많습니다. 다른 사이트에 투명하게 겹쳐 클릭을 유도하는 <b>클릭재킹</b>, 파일 형식을 속이는 <b>MIME 스니핑</b>, HTTPS를 HTTP로 끌어내리는 <b>다운그레이드</b>, 주입된 스크립트 실행(XSS) 등입니다.',
  defense: ['<code>Content-Security-Policy</code> — 허용한 출처의 스크립트만 실행', '<code>Strict-Transport-Security</code> — 항상 HTTPS', '<code>X-Frame-Options</code> / <code>frame-ancestors</code> — 다른 사이트의 iframe 삽입 금지', '<code>X-Content-Type-Options: nosniff</code>', '<code>Referrer-Policy</code>, <code>Permissions-Policy</code>'],
  render(el, { complete, h, esc }) {
    const CHECKS = [
      { k: 'content-security-policy', name: 'Content-Security-Policy', w: 30, protects: 'XSS·데이터 유출' },
      { k: 'strict-transport-security', name: 'Strict-Transport-Security', w: 20, protects: 'HTTPS 다운그레이드' },
      { k: 'x-frame-options', name: 'X-Frame-Options', w: 15, protects: '클릭재킹' },
      { k: 'x-content-type-options', name: 'X-Content-Type-Options', w: 15, protects: 'MIME 스니핑' },
      { k: 'referrer-policy', name: 'Referrer-Policy', w: 10, protects: 'URL 속 정보 유출' },
      { k: 'permissions-policy', name: 'Permissions-Policy', w: 10, protects: '카메라·위치 등 권한 남용' },
    ];
    const grade = (s) => (s >= 90 ? 'A' : s >= 75 ? 'B' : s >= 50 ? 'C' : s >= 25 ? 'D' : 'F');
    const box = h(`<div>
      <h3 style="margin-top:0">① 이 사이트 (실제 응답)</h3>
      <div class="out" id="real">헤더를 불러오는 중…</div>
      <h3>② 가상 쇼핑몰 shop.example 헤더 설정</h3>
      <div id="opts" class="chklist"></div>
      <div class="out" id="sim"></div>
    </div>`);
    el.appendChild(box);
    fetch('/lab', { cache: 'no-store' }).then((r) => {
      let s = 0;
      const rows = CHECKS.map((c) => {
        const v = r.headers.get(c.k);
        if (v) s += c.w;
        return `${v ? '✔' : '✗'} ${c.name.padEnd(27)} ${v ? v.slice(0, 70) + (v.length > 70 ? '…' : '') : '(없음)'}`;
      });
      box.querySelector('#real').textContent = `등급 ${grade(s)} (${s}/100)\n` + rows.join('\n');
    });
    const opts = box.querySelector('#opts');
    CHECKS.forEach((c) => {
      opts.appendChild(h(`<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" data-k="${c.k}" style="width:auto"> <span>${esc(c.name)} <span class="muted">— 막는 공격: ${esc(c.protects)}</span></span></label>`));
    });
    let completed = false;
    const update = () => {
      let s = 0;
      const missing = [];
      CHECKS.forEach((c) => { if (opts.querySelector(`[data-k="${c.k}"]`).checked) s += c.w; else missing.push(c); });
      const g = grade(s);
      const out = box.querySelector('#sim');
      out.className = 'out ' + (g === 'A' ? 'ok' : g === 'F' || g === 'D' ? 'bad' : '');
      out.textContent = `shop.example 등급: ${g} (${s}/100)` + (missing.length ? '\n여전히 가능한 공격:\n' + missing.map((m) => ` ✗ ${m.protects}  ← ${m.name} 없음`).join('\n') : '\n✔ 모든 기본 보안 헤더 적용 완료');
      if (g === 'A' && !completed) { completed = true; complete(s); }
    };
    opts.addEventListener('change', update);
    update();
  },
});
