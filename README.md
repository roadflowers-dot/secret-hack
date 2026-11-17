# SECRET//HACK

매트릭스 테마의 웹 보안 훈련장. Google 로그인이 필수이고, 관리자는 접속 IP를 보고 차단할 수 있습니다.

## 실행

```bash
npm install
cp .env.example .env   # 값 채우기
set -a; . ./.env; set +a
npm start
```

| 환경변수 | 설명 |
|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID(웹). **승인된 JavaScript 원본**에 사이트 주소 등록 (예: `http://localhost:3000`) |
| `ADMIN_EMAILS` | 관리자 Gmail 주소 (쉼표로 여러 명) |
| `SESSION_SECRET` | 세션 쿠키 서명용 긴 랜덤 문자열 |
| `TRUST_PROXY` | 리버스 프록시 뒤라면 프록시 홉 수 (예: `1`). 프록시 없이 켜면 IP 위조 가능 |
| `NODE_ENV` | 배포 시 `production` (Secure 쿠키, HSTS) |

로컬 테스트용 개발 로그인: `ADMIN_EMAILS=you@example.com npm run dev` → 로그인 화면에 이메일 입력칸이 나옵니다 (`NODE_ENV=production`이면 비활성).

## 페이지

- `/login` — Google 로그인
- `/lab` — 실습실 (로그인 필요). 모든 테스트는 브라우저 안 시뮬레이션
  - **초급**: 강한 비밀번호 만들기 · 피싱 링크 구별 · 2단계 인증(MFA) 비교
  - **중급**: 로그인 무차별 대입 방어 설계 · 세션 쿠키 속성 · 보안 헤더 점검
  - **상급**: 침해 사고 로그 분석 · CSP 정책 작성 · 심층 방어 설계 · 시큐어 코드 리뷰
  - 완료 기록은 브라우저에 저장되고, 관리자 보안 로그에 `lab.complete` 로 남음
- `/admin` — 관리자 패널 (`ADMIN_EMAILS`만)
  - 방문 IP / 계정 / 요청 수 / 최근 접속 / User-Agent
  - IP 차단·해제 (자기 현재 IP는 차단 불가), 차단 사유 기록
  - 보안 로그: 로그인, 차단된 접근, CSRF 거부, 관리자 접근 거부 등

## 적용된 방어

- Google ID 토큰 서버 검증 (`aud`, 서명, `email_verified`)
- 서명된 세션 쿠키 (`HttpOnly`, `SameSite=Lax`, 운영 시 `Secure`), 8시간 만료
- 상태 변경 요청에 세션별 CSRF 토큰 헤더 필수
- CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS
- IP별 요청 제한 (분당 300회), 로그인 시도 제한
- 차단된 IP는 모든 요청에서 403

## 데이터

방문자·차단 목록·로그는 `data/store.json`에 저장됩니다. 관리자 IP가 바뀌어 잠겼다면 서버를 멈추고:

```bash
npm run unblock -- 203.0.113.7
```
