# 백엔드 지침

## 최신 분석 연결 · 2026-10-03

`AnalysesModule`의 공개 API·작업 실행·결과 저장과 `QwenHttp`를 구현했다. [실제 계약·제한·검증](../AI/analysis-flow.md)을 우선한다. 분석 오케스트레이션, 외부 모델 Adapter, RLS 저장소 Adapter를 분리하고 인터페이스·DI로 연결했다. AuthGuard·사용자 토큰 접근을 재사용한다. 기존 대화 파일은 이동하지 않았다.

## JEV 내부 연결 · 2026-10-03

`ai` 기능 폴더에 설정·사용 정책·외부 호출 경계를 분리했다. `AiModule`을 AppModule에 연결하고 `JevService`를 내보낸다. `JevClient` 인터페이스와 `TypeSafeJev` 어댑터를 의존성 주입으로 연결했다. 기존 파일 이동·삭제는 없으며 별도 공개 API·모순/일정 로직·LLM 호출은 추가하지 않았다. SDK는 별도 TypeSafe API를 호출하며 학교 GPU 서버를 사용하는 라이브러리가 아니다.

타입·lint·빌드·전체 29개 테스트 통과. 9개 JEV 테스트는 실제 SDK의 fetch 전송 경계만 대체하여 사용 분기·인증·모델·Noul/Choice/Score 응답 검증·시간 초과·오류 우회를 확인한다. 이후 실제 `check:jev`는 jev-1.13.0·일정 확률 0.98, `check:jev --skip`은 request-disabled를 반환했다. `check:ai-flow`는 NestJS JEV 사전 판단→직접 Qwen HTTP 상세 분석과 낮은 확률 시 생략을 합성 대화 두 건으로 실제 확인했다. 운영 LLM 서비스 어댑터·분석 API·DB 저장은 아직 없다. [계약](../AI/api.md#jev-사전-판단-실제-계약--2026-10-03)과 [연속 진단](../AI/api.md#jev와-학교-qwen-연속-진단--2026-10-03)을 따른다.

## 대화 업로드·통계 구현 · 2026-10-03

`conversations` 기능 모듈을 추가했다. 컨트롤러는 multipart·DTO·날짜 검증, 서비스는 파싱·원본/DB 저장·재시도·삭제 흐름, KakaoParser는 파일 해석, ConversationRepository·OriginalFiles 인터페이스와 Supabase 구현은 외부 접근을 담당한다. 어댑터·의존성 주입으로 DB/Storage를 화면·HTTP·파서에서 분리했다. 별도 큐·워커·AI 호출은 추가하지 않았다.

원본 파일은 Storage API로 처리하고 DB import는 단일 트랜잭션 RPC를 사용한다. 통계도 요청자 RLS를 유지한 SQL RPC에서 전체 데이터를 집계한다. 본문·파일명·외부 상세 오류를 로그로 남기지 않는다. 비정상 외부 예외는 503으로 변환하며 입력·인증·권한 오류는 해당 HTTP 상태를 유지한다. 업로드 실패·응답 유실·부분 삭제·중복 ID 처리는 [API 계약](api.md#대화-api-실제-계약--2026-10-03)을 따른다.

파일 타입용 `@types/multer` 2.3.0을 개발 의존성으로 추가하고 tsconfig types에 등록했다. 기존 Nest FileInterceptor를 사용하며 별도 런타임 업로드 라이브러리는 추가하지 않았다. 백엔드 타입·lint·빌드·Node 테스트 20개를 통과했다. 새 10개 검증은 PC/모바일·인코딩·날짜/시간·400명·multipart·소유권·중복 요청·DB 실패·원본 삭제 실패를 포함한다. DB 통계/RLS/연쇄 삭제는 별도 실제 DB 롤백 SQL로 검증했다.

## 공식 문서 우선 조회

- [NestJS 공식 문서](https://docs.nestjs.com/): 모듈·DI, 컨트롤러·DTO, OpenAPI/Swagger, 테스트·설정을 확인한다.
- 백엔드 기술을 조사할 때 위 공식 문서에서 해당 주제를 먼저 읽고 package.json·잠금 파일의 설치 버전과 호환되는지 확인한다.
- 공식 문서가 부족하면 Context7로 공식 문서 내용을 보완하고, 이후 NestJS 공식 저장소의 이슈·릴리스를 확인한다. 다른 라이브러리 자체 기능은 해당 라이브러리의 공식 문서로 확인한다.

## 기술과 책임

NestJS·TypeScript·Swagger를 사용하는 서버로 구성한다. 소스는 `apps/backend`에 있으며 상태 확인 API·Swagger와 개발 환경을 구현했다.

| 패키지 | 구분 | 상태 | 버전 범위 |
| --- | --- | --- | --- |
| `@nestjs/common` | 런타임 | 설치됨 | `12.1.1` |
| `@nestjs/core` | 런타임 | 설치됨 | `12.1.1` |
| `@nestjs/platform-express` | 런타임 | 설치됨 | `12.1.1` |
| `@nestjs/swagger` | 런타임 | 설치됨 | `12.0.2` |
| `class-transformer` | 런타임 | 설치됨 | `^0.5.1` |
| `class-validator` | 런타임 | 설치됨 | `^0.15.1` |
| `reflect-metadata` | 런타임 | 설치됨 | `^0.2.2` |
| `rxjs` | 런타임 | 설치됨 | `^7.8.2` |
| `@supabase/supabase-js` | 런타임·Auth 검증·사용자 RLS 접근 | 설치됨 | `2.117.2` |
| `@typesafe-ai/sdk` | 런타임·JEV 구조화 판단 API | 설치됨 | `0.6.0` |
| `@eslint/js` | 개발·검증 | 설치됨 | `^10.0.1` |
| `@nestjs/cli` | 개발·검증 | 설치됨 | `12.0.8` |
| `@nestjs/testing` | 개발·검증 | 설치됨 | `12.1.1` |
| `@types/node` | 개발·검증 | 설치됨 | `^24.19.0` |
| `eslint` | 개발·검증 | 설치됨 | `^10.11.0` |
| `globals` | 개발·검증 | 설치됨 | `^17.12.0` |
| `supertest` | 개발·검증 | 설치됨 | `^7.3.0` |
| `typescript` | 개발·검증 | 설치됨 | `^5.9.3` |
| `typescript-eslint` | 개발·검증 | 설치됨 | `^8.71.0` |

실제 해석 버전은 루트 `pnpm-lock.yaml`을 기준으로 한다. Supabase SDK는 2.117.2로 정확히 고정 설치했다.

## 사용자·인증 구현 · 2026-10-01

`auth`는 Bearer 검증 Guard·현재 사용자 컨텍스트, `users`는 내 정보 유스케이스·DTO·프로필 저장소, `supabase`는 설정 검증·사용자별 SDK 클라이언트를 담당한다. `ProfileRepository` 인터페이스와 `SupabaseProfileRepo` 어댑터를 DI로 연결했다. AuthService는 `getUser(token)`으로 검증하고 사용자 요청에 서버 비밀 키를 사용하지 않는다. DB 클라이언트마다 요청자의 Authorization을 지정하며 세션 저장·자동 갱신·URL 세션 감지를 비활성화한다.

호스트 진입점은 저장소 루트 `.env`를 읽는다. 기존 프로세스 환경변수가 우선한다. `SUPABASE_URL`과 `SUPABASE_PUBLISHABLE_KEY`가 필수이며 후자는 `sb_publishable_` 키만 허용한다. 실제 값은 Git 제외 `.env`에만 둔다. 테스트는 Supabase provider를 대체하여 자격 증명 없이 실행한다.

검증: 타입·lint·빌드·Node 통합 테스트 10개 통과. 테스트는 API 정상 응답, 입력 검증, 인증 오류·외부 장애, 사용자 토큰 분리와 Swagger 계약을 확인한다. 실제 서버에서 health 200, 토큰 누락 401, 실제 Supabase에 잘못된 토큰을 전달한 401, OpenAPI 사용자 경로를 확인했다. 유효한 OAuth 세션을 통한 전체 로그인 검증은 미실행이다.

검증 도구는 ESLint·typescript-eslint, Node 내장 테스트 러너·@nestjs/testing·supertest를 사용한다. AI HTTP 클라이언트는 미선정이다.

## 컨벤션

- 기능별 모듈로 구성한다. 컨트롤러는 HTTP 입출력, 서비스는 유스케이스, DTO는 입력·출력 계약과 검증을 담당한다.
- DB·Storage·AI 접근은 주입 가능한 경계로 분리한다. 외부 시스템을 컨트롤러에서 직접 호출하지 않는다.
- AI 연결에는 어댑터 패턴을 적용한다. 모의 구현과 실제 HTTP 구현이 같은 분석 계약을 따른다.
- 클래스·DTO는 PascalCase, 함수·변수는 camelCase로 명명한다. 계층을 늘리는 것 자체를 목표로 삼지 않는다.
- 검증 가능한 사용자 ID는 인증 결과에서 가져온다. 요청 본문의 사용자 ID를 권한 판단에 사용하지 않는다.
- 파일 형식·크기, 필수 값, 날짜·ID를 검증한다. 허용 크기 등 미정 값은 구현 시 정하고 API 문서에 기록한다.
- Swagger에는 인증·요청·응답·오류·상태를 반영한다. 공개 여부는 배포 설정에서 명시하고 문서 초안과 실제 스펙을 대조한다.

## 시스템 연결

| 상대 시스템 | 연결과 책임 |
| --- | --- |
| React / Nginx | `/api` HTTP 서비스 계약; 상태·결과 반환 |
| Supabase Auth | 사용자 토큰 검증과 사용자 식별 |
| Supabase DB·Storage | 사용자별 대화·메시지·작업·결과·일정·비공개 원본 관리 |
| AI 서버 | HTTP 요청, JSON 검증, 결과 저장; AI에 DB 관리 권한 전달 금지 |

사용자 요청의 DB 접근은 사용자 토큰 컨텍스트와 RLS를 사용하고 서버에서도 소유권을 확인한다. 내부 처리에 별도 서버 권한이 필요하면 신뢰된 작업의 소유자를 기준으로 제한하고 RLS 우회 위험을 점검한다.

## 분석·오류 처리

- 생성 요청은 작업을 저장하고 ID를 반환한다. 긴 AI 응답을 브라우저 요청 종료까지 기다리게 하지 않는다.
- 작업 상태는 `pending`, `processing`, `completed`, `failed`다. 초기에는 별도 큐·워커 컨테이너 없이 백엔드 내 실행을 관리하며 SQS는 보류한다.
- AI 타임아웃·연결 실패·스키마 불일치를 실패 상태와 오류 코드로 기록한다. 잘못된 결과는 완료로 저장하지 않는다.
- 백엔드 재시작으로 중단된 작업은 시작 시 실패로 정리한다. 사용자는 새 작업으로 재요청할 수 있다. 자동 재처리·정확히 한 번 실행을 보장한다고 문서화하지 않는다.
- 상태 확인에는 작업 소유권을 적용한다. 내부 오류·개인 본문·비밀 값을 응답과 로그에 노출하지 않는다.
- API 오류는 적합한 HTTP 상태와 코드·메시지를 사용한다. 상세 오류 형식과 시간 제한은 구현 시 [api.md](api.md)에 확정한다.

## 테스트 기준

| 수준 | 핵심 대상 |
| --- | --- |
| 단위 | 날짜·발화자·멀티라인 파싱, 통계 기대값, 상태 전이, 결과 검증 |
| 통합 | 저장·조회·소유권, RLS, 비공개 Storage, 모의 AI 정상·지연·실패 |
| E2E | 인증 → 업로드 → 분석 요청 → 상태·결과 조회, 타인 접근 거절, 일정 후보 확인·수정 |

합성 대화를 사용한다. 실제 개인 대화를 픽스처로 저장하지 않는다. DB 테스트는 운영 데이터와 분리한다. 루트 `pnpm test`는 빌드 후 tests/health.test.cjs의 상태 확인·Swagger 통합 테스트를 실행한다. 위 표의 도메인 기능 검증은 해당 기능 구현 시 추가하며, 테스트 더블은 외부 연결 경계에 적용한다.

## ESLint 기준 경로 수정 · 2026-10-03

편집기에서 프론트·백엔드 설정을 함께 로드하면 TypeScript parser의 tsconfigRootDir 자동 추론이 충돌했다. 각 앱의 eslint.config.mjs에 parserOptions.tsconfigRootDir = import.meta.dirname을 명시했다. 두 앱 lint와 동일 Node 프로세스에서 양쪽 설정 로드·기준 경로·소스 파싱 검증을 통과했다. 타입 기반 lint 설정과 런타임 동작은 변경하지 않았다.
