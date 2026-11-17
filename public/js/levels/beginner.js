// ═══════════════════════ 초급 ═══════════════════════

// ── B1. 비밀번호 강도 ──
LAB.add({
  id: 'b-password', level: 1,
  title: '강한 비밀번호 만들기',
  summary: '내 비밀번호가 추측·대입 공격에 얼마나 버티는지 시뮬레이션합니다.',
  threat: '공격자는 유출된 비밀번호 목록과 사전 단어, 흔한 패턴(<code>1234</code>, 생일, 키보드 배열)을 먼저 시도합니다. 짧거나 흔한 비밀번호는 몇 초 만에 뚫립니다.',
  defense: ['<b>길이</b>가 가장 중요: 단어 3~4개를 이은 문장형(패스프레이즈) 추천', '사이트마다 <b>다른 비밀번호</b> + 비밀번호 관리자 사용', '이름·생일·전화번호·흔한 패턴 피하기', '가능하면 2단계 인증(MFA) 함께 사용'],
  render(el, { complete, h }) {
    const COMMON = ['123456', '123456789', 'password', 'qwerty', '111111', '12345678', 'abc123', '1234567', 'password1', '12345', 'iloveyou', '000000', '1q2w3e4r', 'qwer1234', 'admin', 'letmein', 'welcome', 'monkey', 'dragon', 'sunshine', 'princess', 'football', 'asdf1234', 'zxcvbnm', 'qwerty123', '1qaz2wsx', 'passw0rd', 'master', 'hello123', 'love1234'];
    const box = h(`<div>
      <p class="muted" style="font-size:13px">🔒 입력한 값은 이 브라우저 안에서만 계산되며 서버로 전송되지 않습니다. 실제 사용 중인 비밀번호는 넣지 마세요.</p>
      <label for="pw">테스트할 비밀번호</label>
      <div class="row"><input id="pw" type="password" autocomplete="off" placeholder="예: 초록색-고양이가-달리는-새벽"><button id="pwshow" type="button">보기</button></div>
      <div class="meter" style="margin-top:10px"><i id="pwbar"></i></div>
      <div class="out" id="pwout">비밀번호를 입력하면 분석 결과가 표시됩니다.</div>
      <h3>목표</h3><p>평가 <b>"매우 강함"</b> 을 받는 비밀번호를 만들어 보세요. (힌트: 기호를 섞는 것보다 길이를 늘리는 게 훨씬 효과적)</p>
    </div>`);
    el.appendChild(box);
    const pw = box.querySelector('#pw'), out = box.querySelector('#pwout'), bar = box.querySelector('#pwbar');
    box.querySelector('#pwshow').addEventListener('click', (e) => { pw.type = pw.type === 'password' ? 'text' : 'password'; e.target.textContent = pw.type === 'password' ? '보기' : '숨기기'; });

    const fmtTime = (s) => {
      if (s < 1) return '즉시';
      const u = [['년', 31536000], ['일', 86400], ['시간', 3600], ['분', 60], ['초', 1]];
      if (s > 31536000 * 1e6) return '100만 년 이상';
      for (const [n, v] of u) if (s >= v) return `약 ${Math.round(s / v).toLocaleString('ko-KR')}${n}`;
      return '즉시';
    };
    let completed = false;
    pw.addEventListener('input', () => {
      const p = pw.value;
      if (!p) { out.textContent = '비밀번호를 입력하면 분석 결과가 표시됩니다.'; bar.style.width = '0'; return; }
      let pool = 0;
      if (/[a-z]/.test(p)) pool += 26;
      if (/[A-Z]/.test(p)) pool += 26;
      if (/[0-9]/.test(p)) pool += 10;
      if (/[^a-zA-Z0-9가-힣]/.test(p)) pool += 33;
      if (/[가-힣]/.test(p)) pool += 2350;
      let bits = Math.log2(Math.max(pool, 1)) * [...p].length;
      const issues = [];
      const low = p.toLowerCase();
      if (COMMON.includes(low)) { bits = 2; issues.push('유출 목록 상위권에 있는 흔한 비밀번호'); }
      if (/(.)\1{2,}/.test(p)) { bits *= 0.7; issues.push('같은 문자 반복'); }
      if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|zxcv)/i.test(p)) { bits *= 0.7; issues.push('연속/키보드 배열 패턴'); }
      if (/(19|20)\d{2}/.test(p)) { bits *= 0.85; issues.push('연도처럼 보이는 숫자(생일 등)'); }
      if ([...p].length < 10) issues.push('길이가 10자 미만');
      bits = Math.round(bits);
      const guessesFast = 2 ** bits / 2 / 1e10;  // 오프라인, 빠른 해시, GPU 100억 회/초
      const guessesOnline = 2 ** bits / 2 / 10;  // 온라인, 로그인 제한 있는 서버 10회/초
      const levels = [[28, '매우 약함', 'var(--red)'], [45, '약함', 'var(--red)'], [60, '보통', 'var(--amber)'], [80, '강함', 'var(--g)'], [Infinity, '매우 강함', 'var(--cyan)']];
      const [, label, color] = levels.find(([t]) => bits < t);
      bar.style.width = Math.min(100, bits) + '%';
      bar.style.background = color;
      out.className = 'out ' + (bits >= 80 ? 'ok' : bits < 45 ? 'bad' : '');
      out.textContent =
        `평가: ${label}  (추정 엔트로피 ${bits} bits, 길이 ${[...p].length}자)\n` +
        `▸ 유출된 해시를 GPU로 대입 (초당 100억 회): ${fmtTime(guessesFast)}\n` +
        `▸ 로그인 화면에서 직접 대입 (초당 10회):  ${fmtTime(guessesOnline)}\n` +
        (issues.length ? `⚠ 약점: ${issues.join(', ')}` : '✓ 눈에 띄는 패턴 없음');
      if (bits >= 80 && !completed) { completed = true; complete(bits); }
    });
  },
});

// ── B2. 피싱 링크 판별 ──
LAB.add({
  id: 'b-phishing', level: 1,
  title: '피싱 링크 구별하기',
  summary: '가짜 은행 "넥서스뱅크"를 사칭한 문자/메일 중 진짜와 가짜를 골라냅니다.',
  threat: '공격자는 진짜와 비슷한 주소, 급하게 만드는 문구("계정 정지", "택배 반송")로 가짜 로그인 페이지에 유도해 아이디·비밀번호·OTP를 가로챕니다.',
  defense: ['주소창의 <b>실제 도메인</b>(마지막 점 앞뒤)을 확인', '문자·메일 속 링크 대신 <b>앱이나 즐겨찾기</b>로 직접 접속', '급박함·공포를 주는 문구는 의심', '비밀번호 관리자는 가짜 도메인에서 자동 입력하지 않음 → 경고 신호', '패스키·보안키는 피싱 사이트에서 동작하지 않음'],
  render(el, { complete, h, esc }) {
    // All domains use the reserved .example TLD (fictional).
    const Q = [
      { from: '넥서스뱅크', msg: '[넥서스뱅크] 이번 달 카드 명세서가 발행되었습니다.', url: 'https://www.nexusbank.example/statement', safe: true, why: '공식 도메인 nexusbank.example 의 하위 경로입니다.' },
      { from: '010-9xxx-xxxx', msg: '[넥서스뱅크] 비정상 로그인 감지! 24시간 내 본인인증 안하면 계정 정지', url: 'https://nexusbank-secure-login.example/verify', safe: false, why: '실제 도메인은 "nexusbank-secure-login.example" — 은행 이름을 포함한 전혀 다른 도메인입니다. 개인 번호 발신 + 협박성 문구.' },
      { from: '넥서스뱅크', msg: '로그인하여 보안 설정을 확인하세요.', url: 'https://nexusbank.example.account-check.example/login', safe: false, why: '도메인은 오른쪽 끝에서 읽습니다. 실제 도메인은 "account-check.example" 이고, 앞부분은 장식일 뿐입니다.' },
      { from: '넥서스뱅크', msg: '[이벤트] 앱 업데이트하고 커피 쿠폰 받기', url: 'http://203.0.113.45/nexusbank/app.apk', safe: false, why: '도메인 대신 IP 주소, 암호화 안 된 http, 공식 스토어가 아닌 apk 직접 다운로드 — 악성 앱 설치 유도입니다.' },
      { from: '넥서스뱅크', msg: '고객센터 안내', url: 'https://help.nexusbank.example/faq', safe: true, why: '하위 도메인 help. + 공식 도메인 nexusbank.example 입니다.' },
      { from: 'support@nexusbank.example', msg: '보안 강화를 위해 아래에서 비밀번호를 재설정하세요.', url: 'https://nexusbank.example@login-portal.example/reset', safe: false, why: 'URL 안의 "@" 앞부분은 무시되고 실제로는 login-portal.example 로 접속됩니다. 발신 주소도 쉽게 위조됩니다.' },
      { from: '넥서스뱅크', msg: '로그인 페이지', url: 'https://nехusbank.example/login', display: 'https://nехusbank.example/login', safe: false, why: '"е", "х" 가 라틴 문자가 아니라 모양이 같은 키릴 문자입니다(동형 문자 공격). 브라우저 주소창에는 xn-- 로 시작하는 퓨니코드로 보일 수 있습니다.' },
      { from: 'CJ택배', msg: '[택배] 주소 불일치로 반송 예정. 주소 수정: ', url: 'https://bit.example/3xYz', safe: false, why: '단축 URL은 최종 목적지를 숨깁니다. 기다리던 택배가 없다면 운송장 번호로 택배사 앱에서 직접 조회하세요.' },
    ];
    let i = 0, score = 0;
    const box = h(`<div>
      <div class="muted" id="phq" style="font-size:13px"></div>
      <div class="phone" id="phcard"></div>
      <div class="row" style="margin-top:10px"><button id="phsafe">✓ 안전</button><button id="phbad" class="danger">✗ 피싱</button></div>
      <div class="out" id="phout">링크를 보고 판단하세요. (모든 도메인은 가상의 .example 주소입니다)</div>
    </div>`);
    el.appendChild(box);
    const show = () => {
      const q = Q[i];
      box.querySelector('#phq').textContent = `문제 ${i + 1} / ${Q.length} · 현재 점수 ${score}`;
      box.querySelector('#phcard').innerHTML = `<div class="muted" style="font-size:12px">보낸 사람: ${esc(q.from)}</div><div>${esc(q.msg)}</div><div class="link">${esc(q.display || q.url)}</div>`;
      box.querySelector('#phsafe').disabled = box.querySelector('#phbad').disabled = false;
    };
    const answer = (saidSafe) => {
      const q = Q[i];
      const right = saidSafe === q.safe;
      if (right) score++;
      const out = box.querySelector('#phout');
      out.className = 'out ' + (right ? 'ok' : 'bad');
      out.textContent = `${right ? '정답' : '오답'} — 이 링크는 ${q.safe ? '안전' : '피싱'}입니다.\n${q.why}`;
      box.querySelector('#phsafe').disabled = box.querySelector('#phbad').disabled = true;
      i++;
      if (i < Q.length) setTimeout(show, 1400);
      else setTimeout(() => {
        out.className = 'out ' + (score >= 6 ? 'ok' : 'bad');
        out.textContent += `\n\n최종 점수 ${score}/${Q.length}. ` + (score >= 6 ? '통과!' : '6점 이상이면 통과입니다. 다시 도전하세요.');
        if (score >= 6) complete(score);
        else { const r = h('<button style="margin-top:8px">다시 하기</button>'); r.addEventListener('click', () => { i = 0; score = 0; r.remove(); out.className = 'out'; out.textContent = ''; show(); }); box.appendChild(r); }
      }, 1400);
    };
    box.querySelector('#phsafe').addEventListener('click', () => answer(true));
    box.querySelector('#phbad').addEventListener('click', () => answer(false));
    show();
  },
});

// ── B3. 2단계 인증 ──
LAB.add({
  id: 'b-mfa', level: 1,
  title: '2단계 인증(MFA)의 힘',
  summary: '비밀번호가 이미 유출된 상황에서 어떤 2단계 인증이 계정을 지키는지 비교합니다.',
  threat: '다른 사이트에서 유출된 비밀번호를 그대로 넣어 보는 <b>크리덴셜 스터핑</b>, 가짜 로그인 페이지로 OTP까지 실시간으로 가로채는 <b>중간자 피싱</b>, 통신사를 속여 번호를 옮기는 <b>심 스와핑</b>이 대표적입니다.',
  defense: ['어떤 MFA든 <b>없는 것보다 훨씬 낫다</b>', 'SMS < 인증 앱(OTP) < <b>패스키/보안키</b> 순으로 강력', '패스키는 도메인에 묶여 있어 <b>피싱 사이트에서 작동하지 않음</b>', '모르는 로그인 알림·OTP 요청은 절대 승인하지 않기'],
  render(el, { complete, h, term }) {
    const box = h(`<div>
      <div class="row">
        <div><label for="mfa">내 계정의 2단계 인증</label><select id="mfa">
          <option value="none">없음 (비밀번호만)</option><option value="sms">SMS 문자 인증</option>
          <option value="otp">인증 앱 OTP (6자리)</option><option value="passkey">패스키 / 보안키</option></select></div>
        <div><label for="atk">공격 시나리오</label><select id="atk">
          <option value="stuff">① 유출 비밀번호 대입 (크리덴셜 스터핑)</option>
          <option value="sim">② 심 스와핑 + 유출 비밀번호</option>
          <option value="aitm">③ 가짜 로그인 페이지 실시간 중계 (피싱)</option></select></div>
        <button id="run">▶ 공격 시뮬레이션</button>
      </div>
      <div class="out termlog" id="log"></div>
      <h3>목표</h3><p class="muted" id="goal">세 가지 시나리오를 모두 막아내는 2단계 인증 방식을 찾으세요.</p>
    </div>`);
    el.appendChild(box);
    const t = term(box.querySelector('#log'));
    const blockedBy = { none: [], sms: ['stuff'], otp: ['stuff', 'sim'], passkey: ['stuff', 'sim', 'aitm'] };
    const won = new Set();
    let busy = false;
    box.querySelector('#run').addEventListener('click', async () => {
      if (busy) return; busy = true;
      const mfa = box.querySelector('#mfa').value, atk = box.querySelector('#atk').value;
      t.clear();
      await t.line('[attacker] 다른 사이트 유출 DB에서 이메일/비밀번호 확보');
      if (atk === 'sim') await t.line('[attacker] 통신사 고객센터를 속여 피해자 번호를 새 유심으로 이동');
      if (atk === 'aitm') {
        await t.line('[attacker] 피해자에게 nexusbank-login.example 링크 발송');
        await t.line('[victim]   가짜 페이지에 비밀번호 입력 → 공격자가 실시간으로 진짜 사이트에 전달');
      }
      await t.line('[server]   비밀번호 일치 ✓');
      const blocked = blockedBy[mfa].includes(atk);
      if (mfa === 'none') {
        await t.line('[server]   추가 인증 없음 → 로그인 성공', 'red');
      } else {
        const name = { sms: 'SMS 인증번호', otp: 'OTP 6자리', passkey: '패스키 서명' }[mfa];
        await t.line(`[server]   ${name} 요구`);
        if (mfa === 'sms' && atk === 'sim') await t.line('[attacker] 옮겨 온 유심으로 인증번호 수신 → 입력', 'red');
        else if (mfa === 'sms' && atk === 'aitm') await t.line('[victim]   가짜 페이지에 SMS 번호 입력 → 공격자가 중계', 'red');
        else if (mfa === 'otp' && atk === 'aitm') await t.line('[victim]   가짜 페이지에 OTP 입력 → 30초 안에 공격자가 중계', 'red');
        else if (mfa === 'passkey' && atk === 'aitm') await t.line('[browser]  패스키는 nexusbank.example 전용 — 가짜 도메인에서는 서명 거부', 'cyan');
        else await t.line('[attacker] 2차 인증 수단이 없음 → 진행 불가', 'cyan');
      }
      if (blocked) {
        await t.line('[server]   로그인 차단 + 사용자에게 의심 로그인 알림 발송', 'ok');
        await t.line('RESULT: 계정 방어 성공 ✔', 'ok', 0);
        won.add(mfa + atk);
      } else {
        await t.line('RESULT: 계정 탈취됨 ✗', 'red', 0);
      }
      if (['stuff', 'sim', 'aitm'].every((a) => won.has('passkey' + a))) complete(100);
      busy = false;
    });
  },
});
