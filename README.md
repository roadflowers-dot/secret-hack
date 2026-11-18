# SECRET//HACK

매트릭스 테마의 해킹 방어 훈련 사이트. **Firebase Spark(무료) 요금제만** 사용합니다. Hosting, Authentication, Firestore로 구성되며 서버(Cloud Functions)가 없습니다. Spark 요금제는 결제 수단이 연결되지 않아 요금이 청구될 수 없습니다. 무료 한도를 넘으면 그날은 해당 기능이 멈출 뿐입니다.

## 구조

```
public/            Firebase Hosting에 올라가는 정적 파일
  login.html       Google 로그인
  lab.html         실습실 (초급/중급/상급 시뮬레이션 10개)
  admin.html       관리자 패널
  js/levels/       실습 모듈
  js/dist/         빌드 결과 (npm run build, git에는 올리지 않음)
src/               Firebase SDK를 쓰는 페이지 스크립트 (esbuild로 번들)
firestore.rules    모든 권한 검사 (서버가 없으므로 여기가 보안의 핵심)
firebase.json      Hosting 설정 + 보안 헤더(CSP 등)
.github/workflows/firebase-deploy.yml   푸시하면 자동 배포
```

## Firestore 컬렉션

| 컬렉션 | 내용 | 누가 쓰나 |
|---|---|---|
| `admins/{이메일}` | 관리자 목록 | 기본 관리자는 **콘솔에서 직접 생성**(앱에서 해제 불가). 추가 관리자는 관리자 패널 → 관리자 탭에서 부여/해제 |
| `visitors/{uid}` | 계정별 최근 IP·IP 이력·방문 수·브라우저 | 본인 (30초에 1회까지) |
| `blocked/{uid}` | 차단된 계정 | 관리자 |
| `blockedIps/{ip}` | 차단된 IP | 관리자 |
| `events/{id}` | 보안 로그 (로그인, 실습 완료, 차단 시도, 관리자 조치) | 본인/관리자 |

## 차단 방식과 한계

- **계정 차단**: Firestore 보안 규칙으로 강제됩니다. 차단된 계정은 어떤 데이터도 쓸 수 없고 실습실에 들어갈 수 없습니다.
- **IP 차단**: 서버가 없어서 방문자의 공인 IP를 브라우저가 `api.ipify.org` 로 확인하고, 그 IP가 차단 목록에 있는지 브라우저에서 검사합니다. 일반 방문자는 막히지만 VPN이나 조작으로 우회할 수 있습니다. 확실히 막으려면 **계정 차단을 함께** 쓰세요.

## 처음 한 번 설정

1. [Firebase 콘솔](https://console.firebase.google.com)에서 Google Cloud 프로젝트 `secret-hack-17a93` 을 Firebase 프로젝트로 추가합니다. 요금제는 **Spark 그대로** 둡니다.
2. **Authentication → 시작하기 → 로그인 방법 → Google → 사용 설정 → 저장**
3. **Firestore Database → 데이터베이스 만들기** → 위치 `asia-northeast3 (서울)` → 프로덕션 모드
4. Firestore에서 컬렉션 `admins` 를 만들고, **문서 ID에 관리자 Gmail 주소**(소문자 그대로)를 넣습니다. 필드는 아무거나 하나 넣으면 됩니다 (예: `role` = `admin`).
5. GitHub 자동 배포를 설정합니다.
   1. Firebase 콘솔 **프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성** 을 누르면 JSON 파일이 다운로드됩니다.
   2. [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam) 에서 `firebase-adminsdk-…` 계정 연필 아이콘을 누르고, **Firebase Admin** 역할을 추가합니다.
   3. GitHub 저장소 **Settings → Secrets and variables → Actions → New repository secret** 을 누릅니다. 이름은 `FIREBASE_SERVICE_ACCOUNT`, 값에는 JSON 파일 내용 전체를 붙여 넣습니다.
   4. **Actions** 탭에서 `Deploy to Firebase` 를 실행합니다 (Run workflow). 이후에는 푸시할 때마다 자동으로 배포됩니다.
6. 사이트 주소: `https://secret-hack-17a93.web.app`

## 로컬 테스트 (에뮬레이터)

```bash
npm ci && npm run build
npx firebase-tools emulators:start --project demo-secret-hack
```

`http://localhost:5000/login?emu` 로 접속하면 가짜 이메일로 로그인할 수 있습니다. 에뮬레이터 연결은 localhost 에서 `?emu` 를 붙였을 때만 켜집니다.
