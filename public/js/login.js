(async function () {
  const err = document.getElementById('err');
  MX.type(document.getElementById('term'), [
    '> Wake up...',
    '> The Matrix has you.',
    '> 인증되지 않은 사용자는 접근할 수 없습니다.',
    '> Follow the white rabbit: Google 로그인 ↓',
  ], 22);

  const cfg = (await MX.api('/api/config')).data || {};

  async function finish(url, body) {
    err.textContent = '';
    const r = await MX.api(url, { method: 'POST', body, csrf: false });
    if (r.ok) location.href = '/lab';
    else err.textContent = '로그인 실패: ' + ((r.data && r.data.error) || r.status);
  }

  if (cfg.devLogin) {
    const f = document.getElementById('devform');
    f.hidden = false;
    f.addEventListener('submit', (e) => { e.preventDefault(); finish('/auth/dev', { email: document.getElementById('devemail').value }); });
  }

  if (!cfg.googleClientId) {
    if (!cfg.devLogin) err.textContent = '서버에 GOOGLE_CLIENT_ID가 설정되지 않았습니다.';
    return;
  }
  function init() {
    google.accounts.id.initialize({
      client_id: cfg.googleClientId,
      callback: (resp) => finish('/auth/google', { credential: resp.credential }),
      ux_mode: 'popup',
      itp_support: true,
    });
    google.accounts.id.renderButton(document.getElementById('gbtn'), { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'signin_with', locale: 'ko' });
  }
  (function wait(n) {
    if (window.google && google.accounts && google.accounts.id) return init();
    if (n > 100) { err.textContent = 'Google 로그인 스크립트를 불러오지 못했습니다.'; return; }
    setTimeout(() => wait(n + 1), 100);
  })(0);
})();
