import { auth, db, getIp, login, emuLogin, isEmu, logEvent, hourKey, showBlocked } from './core.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore/lite';

const err = document.getElementById('err');
const btn = document.getElementById('gbtn');

MX.type(document.getElementById('term'), [
  '> Wake up...',
  '> The Matrix has you.',
  '> 인증되지 않은 사용자는 접근할 수 없습니다.',
  '> Follow the white rabbit: Google 로그인 ↓',
], 22);

const ip = await getIp();
try {
  if (ip !== 'unknown' && (await getDoc(doc(db, 'blockedIps', ip))).exists()) {
    showBlocked('당신의 IP 주소는 관리자에 의해 차단되었습니다.');
    throw new Error('blocked');
  }
} catch (e) { if (e.message === 'blocked') throw e; }

let redirecting = false;
async function afterLogin(user) {
  if (redirecting) return;
  redirecting = true;
  await logEvent(user, ip, 'auth.login', 'Google login', { key: 'login_' + hourKey() });
  location.replace('/lab');
}

// Already signed in → straight to the lab.
onAuthStateChanged(auth, (u) => { if (u) afterLogin(u); });

btn.hidden = false;
btn.addEventListener('click', async () => {
  err.textContent = '';
  btn.disabled = true;
  try {
    await login();
  } catch (e) {
    btn.disabled = false;
    const msg = {
      'auth/popup-blocked': '팝업이 차단되었습니다. 브라우저 주소창의 팝업 허용을 눌러 주세요.',
      'auth/popup-closed-by-user': '로그인 창이 닫혔습니다.',
      'auth/cancelled-popup-request': '',
      'auth/unauthorized-domain': '이 도메인이 Firebase 승인된 도메인에 없습니다.',
      'auth/operation-not-allowed': 'Firebase 콘솔에서 Google 로그인 공급자를 사용 설정해야 합니다.',
    }[e.code];
    err.textContent = msg ?? ('로그인 실패: ' + (e.code || e.message));
  }
});

if (isEmu()) {
  const f = document.getElementById('devform');
  f.hidden = false;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await emuLogin(document.getElementById('devemail').value.trim()); } catch (x) { err.textContent = x.message; }
  });
}
