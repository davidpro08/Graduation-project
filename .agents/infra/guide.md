# 인프라 지침

## 실제 분석 실행 설정 · 2026-10-03

긴 대화는 `ANALYSIS_TIMEOUT_MS` 기본 7,200,000ms(2시간), 1분~4시간 범위로 설정한다. Compose 환경변수 전달을 추가했다. 200구간 제한은 제거했다.

Compose에 `SCHOOL_AI_BASE_URL`, `SCHOOL_AI_MODEL`, `SCHOOL_AI_API_KEY`, `JEV_SKIP_THRESHOLD`를 전달한다. [학교 터널·Docker와 로컬 주소 차이](../AI/analysis-flow.md#실행-설정)를 따른다. Docker 엔진이 꺼져 있어 컨테이너 검증은 미실행이며 로컬 프론트·Nest·SSH 터널에서 검증한다.

## JEV 설정과 학교 서버 연결 확인 · 2026-10-03

사용자가 학교 서버를 다시 기동한 뒤 끊어진 로컬 터널을 재연결했다. 실제 API는 8000번에서 실행 중이며 VRAM 23,103/24,564MiB 사용을 확인했다. `check:ai-flow`로 실제 JEV와 학교 Qwen의 연속 호출을 확인했다. 서버 설치·모델 설정은 수정하지 않았다. JEV의 과금 설정·키는 사용자가 준비했고 합성 대화로만 호출했다.

Compose backend에 `JEV_ENABLED=false`, `TYPESAFE_API_KEY`, `JEV_MODEL=jev-latest`, `JEV_TIMEOUT_MS=5000`를 전달한다. 실제 키는 Git 제외 `.env` 또는 프로세스 환경변수로 관리하며 프론트에는 전달하지 않는다. SDK 추가 후 Docker 사용 시 이미지를 재빌드해야 한다. 이번 변경에서 컨테이너 재빌드·실행은 하지 않았다.

학교 서버 설정은 사용자가 수행했다. 이전 SSH 주소는 연결 거절이었고 사용자가 제공한 새 주소 `root@203.252.159.19:57398`에서 SSH와 vLLM 내부 8000번 API를 확인했다. RTX 4090 VRAM 24,564MiB 중 21,953MiB 사용, `/v1/models`의 실제 모델 ID는 `Qwen/Qwen3-32B-AWQ`였다. 모델 설치·기동 설정·버전은 변경하지 않았다.

서버 내부 합성 한국어 요청에 `오늘 금요일 오후 3시에 회의가 있습니다.` 응답, 로컬 백엔드 Node 환경의 SSH 터널 호출에 `학교 AI 서버 연결 성공` 응답을 확인했다. 두 호출 모두 약 0.43초, finish_reason=stop이었다. non-thinking·max_tokens=128로 확인했으며 전체 분석 성능 평가와 NestJS LLM 어댑터 연결은 아니다.

로컬 터널은 숨김 SSH 프로세스로 열었다. PID는 Git 제외 `.tmp/school-ai-tunnel.pid`, 오류 로그는 `.tmp/school-ai-tunnel.err.log`에 있다. 현재 API 기본 주소는 `http://127.0.0.1:18080/v1`이다. 인스턴스·PC 재시작 시 터널 재연결이 필요하며 포트가 바뀌면 접속 명령도 갱신한다. 수동 재연결 명령:

```powershell
ssh -i "$env:USERPROFILE\.ssh\jev-test.pem" -p 57398 -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:18080:127.0.0.1:8000 root@203.252.159.19
```

이미 터널이 열려 있으면 중복 실행하지 않는다. 중단 시 PID 파일에 기록된 프로세스가 본 작업의 SSH 프로세스인지 확인한 뒤 해당 프로세스만 종료한다. RunPod 연결은 미실행이다.

## 공식 문서 우선 조회

- [AWS 공식 문서](https://docs.aws.amazon.com/): 관련 서비스의 사용자 가이드·API 참조를 찾아 EC2·ECR·IAM·Systems Manager·SQS 설정과 제한을 확인한다.
- AWS 기술을 조사할 때 위 공식 문서에서 해당 서비스와 주제를 먼저 읽는다. 사용 리전·권한·CLI/API 버전과 현재 인프라에 적용 가능한지 확인한다.
- 공식 문서가 부족하면 Context7로 공식 문서 내용을 보완하고, 이후 공식 저장소·릴리스·AWS 공지로 확인한다. Docker·Compose·GitHub Actions·Turborepo 자체 기능은 각 기술의 공식 문서를 먼저 확인한다.

## 초기 구성과 상태

로컬 Docker 개발 이미지·Compose를 구성했다. 운영 이미지·클라우드 리소스·CI/CD는 **미구현**이다. Docker·Docker Compose, GitHub Actions, ECR, EC2를 사용하도록 설계했으며 로컬은 Node 24·pnpm 10.15.0·Turborepo 2.9.14를 사용한다. AWS 리전·계정·인스턴스·도메인·리소스 이름은 미정이다.

| 구성 | 초기 계획 | 상태 |
| --- | --- | --- |
| EC2 | 한 대에서 Compose 실행 | 미생성 |
| 프론트 이미지 | Next.js standalone Node 서버 + HTTPS 진입점; HTTPS·`/api` 프록시 | 미빌드 |
| 백엔드 이미지 | NestJS 실행 | 미빌드 |
| ECR | 프론트·백엔드 이미지 저장 | 미생성 |
| GitHub Actions | 검사·테스트·빌드·게시·배포 | 미작성 |
| Supabase | 외부 Auth·DB·비공개 Storage | 프로젝트·페르소나·사용자 프로필 구현; OAuth·Storage 미구현 |
| AI 서버 | 외부 로컬 또는 GPU 대여 서버, HTTP 연결 | 미선정 |
| SQS | 후속 비동기 큐 도입 후보 | 보류 |
| Blue-Green·ASG·Load Balancer | 무중단·확장 요구 발생 시 검토 | 보류 |

## Docker·네트워크

- 로컬은 `Dockerfile.dev`·`compose.yaml`로 Node 24 기반 Linux 개발 컨테이너 두 개를 실행한다. `docker compose up --build`, 종료는 `docker compose down`이다. 소스만 bind mount하여 호스트 node_modules가 Linux 의존성을 덮어쓰지 않게 한다.
- 프론트 5173·백엔드 3000을 호스트 loopback에 공개한다. Compose의 Next.js rewrites는 `http://backend:3000`, 호스트 실행은 `http://127.0.0.1:3000`을 사용한다. NestJS healthcheck 통과 후 Next.js를 시작한다. Docker의 Nest CLI watch에만 `--no-shell`을 사용하고, 개발 이미지에 프로세스 탐색용 `procps`를 설치해 재시작 시 기존 서버가 남지 않게 한다.
- Next.js webpack watch polling과 TypeScript watch polling을 사용한다. 의존성·Dockerfile·백엔드 설정 변경은 이미지를 다시 빌드한다. `.env.example`의 포트·polling 설정은 복사 없이 기본값으로도 실행된다.
- 호스트는 루트 `.env`의 Supabase 공개 설정을 준비하고 `pnpm install --frozen-lockfile` 후 `pnpm dev`로 두 앱을 Turborepo에서 실행한다. Docker와 호스트를 같은 포트로 동시에 실행하지 않는다. 로컬은 HTTP이고 Nginx·HTTPS는 운영 구성에 해당한다.
- 운영은 두 컨테이너를 사용한다. 프론트 컨테이너가 Next.js Node 서버로 화면과 자산을 제공하고 백엔드는 내부 Docker 네트워크로 연결한다.
- 외부 서비스 트래픽은 HTTPS로 받는다. 인증서 발급·갱신은 호스트에서 관리하고 Nginx에 읽기 전용으로 마운트하는 구성을 기본으로 한다. 도메인·인증서 발급 방식은 배포 전 확정한다.
- 백엔드 포트를 인터넷에 직접 노출하지 않는다. EC2 보안 그룹·운영 접근·AI 서버 접근은 필요한 범위로 제한한다.
- Supabase와 AI 서버는 EC2의 두 컨테이너 밖에 있다. 실제 AI 원격 HTTP는 HTTPS 등 보호된 연결과 서버 간 인증을 사용한다.

사용자 API 추가 후 백엔드에 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`가 필수다. Compose는 루트 `.env`에서 두 값을 받아 백엔드에 전달하며 없으면 설정 단계에서 실패한다. 포트·polling만 기본값으로 실행된다. 호스트 진입점도 루트 `.env`를 읽으며 프로세스 환경변수가 우선한다. 공개 설정으로 연결하며 서버 secret/service_role·OAuth provider secret은 이번 단계에서 필요하지 않다.
- 이미지에 비밀 값·개인 대화·개발 캐시를 포함하지 않는다. 빌드와 런타임 단계를 분리하고 실행 권한을 최소화한다.

## 이미지와 CI/CD

1. PR에서는 정적 검사·관련 테스트·빌드로 검증한다. SonarQube는 발표의 후보이며 초기 필수 서비스로 만들지 않는다.
2. 기본 브랜치 병합 후 통과한 커밋으로 프론트·백엔드 이미지를 빌드한다.
3. 이미지에 커밋 SHA 태그를 부여하고 ECR에 게시한다. 두 이미지의 동일 커밋 조합을 배포 단위로 기록하며 `latest`만으로 배포를 식별하지 않는다.
4. GitHub Actions가 인증된 EC2 배포 명령을 실행한다. 초기 기본 방식은 AWS Systems Manager Run Command로 두며 사용 가능 여부·권한·에이전트·네트워크를 M4에서 확인한다.
5. EC2가 ECR에 인증하고 해당 이미지를 다운로드한 뒤 Compose로 단순 교체한다. ECR 자체가 배포 명령을 실행하는 것은 아니다.
6. 내부 백엔드 상태 확인과 외부 프론트·API 경로 확인 후 성공을 기록한다. 실패하면 이전 두 이미지 조합으로 복구하고 복구 성공 여부를 확인한다.

배포는 동일 환경에서 직렬 실행하고 이전 SHA·환경 설정 참조를 보관한다. 초기에는 짧은 중단을 허용한다. 비호환 DB 변경은 이미지 복구만으로 되돌릴 수 없으므로 배포 전에 호환성·별도 복구 절차를 확인한다.

## 설정과 권한

| 설정 범주 | 보관·사용 위치 |
| --- | --- |
| 공개 Supabase URL·공개 키·API 경로 | 프론트 빌드 설정; 공개 가능한 값만 |
| AI 주소·서버 간 인증·타임아웃 | 백엔드 런타임 비공개 설정 |
| Supabase 서버 비밀 키가 필요한 내부 처리 | 서버에서만 사용; 필요성·권한을 먼저 확인 |
| AWS 배포 권한 | Actions의 OIDC·역할 기반 임시 자격 증명 기본 |
| ECR 다운로드·SSM 관리 | EC2 인스턴스 역할의 최소 권한 |
| 인증서·런타임 비밀 | 호스트 또는 비밀 관리 수단; 저장소·이미지에 포함 금지 |

실제 환경변수명과 필수 여부는 구현 시 비밀 값 없는 설정 예제에 기록한다. Actions에는 ECR 게시·대상 EC2 배포 권한만 부여하고 EC2에는 다운로드·관리에 필요한 권한만 부여한다. 장기 액세스 키를 문서에 기록하지 않는다.

## SQS 후속 도입

초기 HTTP 구현을 유지한다. SQS를 도입할 때 요청 큐·결과 반환 경로, 소비 주체, 중복 처리·멱등성, visibility timeout, 재시도·DLQ, 취소·삭제 작업 처리를 함께 설계한다. 대화 전체를 큐에 무조건 넣지 않고 데이터 크기·접근 권한·참조 방식부터 결정한다. 도입 시 AI·backend 계약과 운영 문서를 함께 갱신한다.

## 운영 변경 기록

| 날짜 | 변경 | 검증 | 후속 작업 |
| --- | --- | --- | --- |
| 2026-09-30 | pnpm workspace·Turborepo·Docker 로컬 개발 구성 | Compose 설정·두 이미지 빌드·컨테이너 healthy 확인 | M4 운영 이미지·클라우드 배포 구성 |

리전·인스턴스 유형·리소스 식별자·연결 방식·이미지 SHA·변경 이유를 실제 설정 후 추가한다. 비밀 값은 제외한다. 인스턴스 변경·시스템 추가 시 상태 확인과 복구 절차도 갱신한다.

## Windows 호스트 실행 주의

Turbo 2.11.5에서 대화형 PowerShell 실행 시 종료 코드 3221226505를 재현하여 2.9.14로 고정했다. npm 설치 흔적의 바이너리가 재선택되는 것을 막기 위해 루트 실행 스크립트는 `--skip-infer`를 사용하고 dev는 stream 출력을 사용한다. 설치는 pnpm과 루트 잠금 파일을 기준으로 한다.

공백이 있는 Windows 경로에서 Nest CLI의 `--no-shell`이 실행 파일 경로를 잘못 인용하므로 호스트 dev는 기본 셸 실행을 사용한다. Docker에서는 Compose가 `nest start --watch --no-shell`을 직접 지정해 Linux 재시작 동작을 유지한다.

## Next.js 마이그레이션 · 2026-10-01

프론트 런타임을 Next.js 16.3.8로 전환했다. 개발은 webpack 모드로 WATCH_POLLING을 지원하며 프론트 5173·백엔드 3000을 유지한다. Compose는 src·design 토큰·Next/PostCSS 설정을 마운트한다. Next.js 최초 컴파일에 맞춰 healthcheck start_period를 60초로 설정했다. 빌드는 standalone이며 출력 추적 루트는 모노레포 루트다. 운영 이미지 구성은 M4 후속 작업이다. Docker 엔진 미실행으로 이번 컨테이너 재빌드·healthy 검증은 미실행, compose config 검증은 통과했다.

## OAuth 연결 준비 · 2026-10-01

| 제공자 | 후속 작업 때 필요한 설정 |
| --- | --- |
| Google | OAuth Client ID·Secret, 동의 화면·테스트 사용자 |
| Kakao | REST API 키·Client Secret, 카카오 로그인 활성화·동의 항목 |
| GitHub | OAuth App Client ID·Secret |

OAuth provider의 비밀 값은 Supabase Dashboard 제공자 설정에 넣는다. 채팅·저장소·프론트에 기록하지 않는다. 제공자 콜백 주소 후보는 `https://fthzjaeucyiudbjxmlgu.supabase.co/auth/v1/callback`이며 설정 시 Dashboard 표시값을 확인한다. 제공자에서 Supabase로 돌아가는 콜백과 Supabase에서 프론트로 돌아가는 redirectTo는 별개다. 프론트 콜백 경로·개발 주소·운영 도메인은 연결 작업에서 확정하며 아직 허용 URL을 변경하지 않았다.

공식 설정 문서: [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Kakao](https://supabase.com/docs/guides/auth/social-login/auth-kakao), [GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github).

사용자 API 작업 검증: 호스트 실제 기동·Supabase 잘못된 토큰 검증 401·Swagger 통과, Compose 설정 검증 통과. Docker 엔진 미실행으로 이미지 재빌드·컨테이너 검증은 미실행이다.

## 프론트 OAuth 공개 설정 · 2026-10-03

Next.js config는 호스트의 루트 .env를 읽고 SUPABASE_URL·SUPABASE_PUBLISHABLE_KEY를 NEXT_PUBLIC_SUPABASE_URL·NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY로 제공한다. 명시된 NEXT_PUBLIC_ 설정이 있으면 우선한다. 키는 sb_publishable_ 접두사만 허용하며 다른 값은 공개 번들에 전달하지 않는다. 서버 Secret·provider Secret은 프론트에 넣지 않는다. 공개 설정은 빌드 시 반영되므로 변경 후 dev 재시작·운영 재빌드가 필요하다.

Compose frontend에 같은 두 공개 환경변수를 전달하고 public/ 자산을 bind mount한다. 새 SDK 의존성 때문에 Docker를 사용할 때 이미지를 재빌드해야 한다. 로컬 테스트 origin은 http://localhost:5173이며 로그인 코드가 현재 origin의 /auth/callback을 사용한다. Supabase 허용 Redirect URL과 정확히 맞추고 로그인 전후 hostname을 혼용하지 않는다. 제공자 콜백은 기존 Supabase 호스팅 주소를 사용한다.

사용자 요청에 따라 이번 변경의 Compose 검증·빌드·컨테이너 실행·OAuth 테스트는 미실행이다. 원격 제공자·URL 설정을 이 작업에서 수정하지 않았다.

## OAuth 수동 확인과 오류 조사 · 2026-10-03

사용자가 카카오 로그인 성공을 보고했고 원격 Auth 로그에서도 카카오 콜백·PKCE 토큰 교환 성공을 확인했다. Google·GitHub 최종 성공은 아직 확인하지 않았다. 에이전트는 로그인 실행 테스트나 제공자 설정 변경을 하지 않고 기존 로그만 조회했다.

| 제공자 | 확인된 문제 | 조치·남은 확인 |
| --- | --- | --- |
| Kakao | 초기 KOE205: 동의항목 설정 불일치 | 사용자 설정 후 로그인 성공 보고. 개인 개발자 비즈 앱 전환 경로는 공식 앱 설정 문서 참고 |
| Google | Auth 콜백에서 invalid_client, 제공된 Client Secret이 유효하지 않음 | 같은 Web OAuth 클라이언트의 전체 Secret을 Supabase에 등록. 마스킹 표시는 Secret으로 사용할 수 없음. 수정 후 성공 미확인 |
| GitHub | 이메일 API에서 403 Resource not accessible by integration | OAuth App은 user:email, GitHub App은 Account permissions의 Email addresses 읽기 권한 확인. 수정 후 성공 미확인 |

Google 기본 로그인 권한은 openid·userinfo.email·userinfo.profile이다. 이 권한만 요청하는 경우 Testing 상태의 테스트 사용자 제한 예외가 적용된다. 학교·회사 계정의 관리자 정책은 별도로 확인한다. Google JavaScript origin은 http://localhost:5173, 제공자 callback은 원격 Supabase HTTPS 주소, Supabase Redirect URL은 http://localhost:5173/auth/callback이다.

비밀 값·인가 코드·원본 로그·사용자 이메일은 이 기록에 보관하지 않는다. 공식 근거: [Google Audience](https://support.google.com/cloud/answer/15549945?hl=en), [GitHub 이메일 API 권한](https://docs.github.com/en/rest/users/emails#list-email-addresses-for-the-authenticated-user), [카카오 개인 개발자 비즈 앱](https://developers.kakao.com/docs/ko/app-setting/app).
