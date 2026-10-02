# 프론트 화면 구현 · 2026-10-01

브랜치: codex/m2/frontend-screens. 기반: codex/m0/environment-setup. Next.js 16.3.8 App Router, React 19, Tailwind 4, shadcn Button을 사용한다. 기존 디자인 인계는 [design.md](design.md)를 따른다.

## 화면과 동작

| 경로 | 구현 내용 |
| --- | --- |
| /login | Google·GitHub·Kakao OAuth 진입점, 로그인 후 내 정보·닉네임 수정·로그아웃, 화면 체험 진입 |
| /auth/callback | PKCE 코드 교환·내 정보 API 확인, 성공 시 /conversations 이동, 오류·재확인 |
| /conversations | 제목 검색, 예시 대화 열기, 삭제 확인 dialog |
| /upload | .txt 로컬 미리보기, 오류 안내, 합성 예시 추가 |
| /conversation/:id/messages | 원문 검색·참여자·기간 필터, 근거 메시지 강조·포커스 |
| /conversation/:id/statistics | 실제 표시 예시 메시지의 참여자·시간대 집계, 빈 결과 |
| /conversation/:id/contradiction | 모순 후보·원문 근거, 후보 없음, 분석 상태 체험 |
| /conversation/:id/opinions | 3개 관점과 대화 제안, 근거 링크, 예시 없음 |
| /conversation/:id/schedules | 후보 날짜·시간 확인 후 저장, 확정 일정 별도 수정 |
| /health | 기존 백엔드 상태 확인·재시도·Swagger 진입 |

## 책임과 구조

| 위치 | 책임 |
| --- | --- |
| src/app | App Router 페이지·루트 layout·Suspense·한국어 metadata |
| src/views | 화면 조합과 입력·표시. Next.js의 pages 예약 폴더와 충돌하지 않게 이번에 추가한 초안의 이름을 정리 |
| src/components | Shell·Card·Notice·Empty·ConfirmDialog·Button 재사용 |
| src/features/conversations | 합성 데이터 인터페이스와 공유 Context Provider |
| src/lib/navigation.ts | 서버에서도 참조 가능한 경로·탭 정의 |
| src/lib/use-route.ts | 클라이언트 Next.js 경로 조회 훅 |
| src/index.css | design/tokens.css 직접 연결, 3개 글꼴 굵기 자체 제공, 반응형 스타일 |

React Context Provider 패턴으로 화면 간 예시 상태를 공유하고 함수형 상태 갱신으로 저장·삭제 책임을 모았다. 서버 상태 저장소가 아니며 저장소 인터페이스·서버 요청 경계는 실제 계약 연결 때 도입한다. 기본 SSR 페이지와 클라이언트 화면을 구분하고 next/link로 이동한다.

## 범위와 제한

- OAuth 로그인·사용자 프로필 API 연결 코드는 구현했으며 실로그인 검증은 사용자 수행 예정이다. 대화 개인 저장·서버 파싱·AI 호출·외부 캘린더는 미연결이다. 앱 자체 비밀번호 폼은 제공하지 않는다.
- 예시 변경은 탭 메모리에만 남으며 새로고침 시 초기화한다. 삭제는 서버 데이터를 변경하지 않는다.
- 실제 파일은 브라우저에서만 읽고 앞 4,000자를 표시한다. 로컬 미리보기 보호 한도 2MB는 서버 업로드 정책이 아니다. 선택한 실제 파일을 합성 결과로 파싱한 것처럼 보여주지 않는다.
- 평균 응답 시간은 집계 계약 미확정이므로 계산값을 꾸며내지 않고 준비 중으로 표시한다. Figma의 큰 통계 예시 숫자를 대신해 표시한 5개·2개 메시지를 실제 집계한다.
- 분석 대기·처리·완료·실패는 타이머 기반 체험이고 결과는 사전 작성 합성 예시다. 화면 이탈 시 타이머를 정리한다.
- 일정 저장은 ID 기준 교체로 중복 저장을 막으며 시간 미정 후보는 필수 입력 후 저장한다.
- Vite 패키지는 제거했다. 기존 main.tsx·index.html·비활성 vite.config.ts는 실행하지 않는 이전 진입점 기록으로 남겼다. 운영은 정적 Nginx 빌드 대신 Next.js Node 런타임을 필요로 한다.

## 검증 기록

타입 검사·lint·Next.js 및 NestJS 빌드 통과. Compose config 통과. Chrome에서 로그인·목록·원문·통계·모순·관점·일정 이동, 근거 강조, 분석 실패→재시도→완료, 일정 후보 확인·저장 및 페이지 이동 후 유지 확인. 390px viewport에서 가로 넘침 없음 확인. 최종 폼 수정 후 타입·lint 통과. 일정 수정·예시 업로드·삭제 확인 dialog·페이지 이동 후 상태 유지 및 콘솔 오류 0 확인. Next.js /api/health 응답과 /api/docs HTTP 200, frozen-lockfile 오프라인 설치 통과. 최종 프로덕션 빌드 통과(Next.js App Router 7개 경로).

Docker 엔진이 꺼져 있어 새 컨테이너 빌드·healthy 검증은 미실행이다. 프론트 자동 테스트 스위트는 없다. 다음 작업은 Supabase Auth·사용자 소유권·NestJS 업로드/파싱 계약 구현 및 연결이며 M2/M3 전체 완료로 간주하지 않는다.

프로덕션 start는 scripts/start.mjs에서 standalone 자산을 복사하고 생성된 Node 서버를 실행한다. 일반 next start의 standalone 구성 경고를 피하며 5173 포트를 기본으로 사용한다.

## OAuth 로그인 연결 · 2026-10-03

브랜치 `codex/m2/oauth-login`. 기존 화면 체험용 이메일·비밀번호 폼을 공식 리소스를 사용하는 세 제공자 버튼으로 교체했다. 로그인 시작은 Supabase OAuth, 콜백은 PKCE 세션 교환 후 GET /api/users/me 확인, 성공하면 대화 화면으로 이동한다. 상단 계정 링크에서 /login의 내 계정 화면을 열어 닉네임 수정과 현재 세션 로그아웃을 수행한다.

| 흐름 | 처리 |
| --- | --- |
| 로그인 시작 | provider=google/github/kakao, 현재 브라우저 origin + /auth/callback으로 redirectTo 지정 |
| 콜백 | 인가 코드 한 번 교환·브라우저 세션 저장·내 정보 조회 후 /conversations 이동 |
| 서버 장애 | 콜백 오류 안내·다시 확인 버튼; 이미 성공한 코드 교환은 반복하지 않음 |
| 닉네임 | 앞뒤 공백 제거, Unicode 1~30자 입력, PATCH /api/users/me 후 갱신 |
| 세션 | SDK 복원·자동 갱신, API 401 시 현재 세션 정리·재로그인 안내 |
| 화면 체험 | 로그인 없이 접근 유지, 대화 화면은 합성 데이터라고 계속 표시 |

### 사용자 확인 절차

1. 루트 .env의 Supabase URL·publishable 키, Dashboard의 Google·GitHub·Kakao 활성화를 확인한다.
2. Supabase Site URL은 http://localhost:5173, Redirect URLs는 http://localhost:5173/auth/callback으로 설정한다. 제공자 앱 콜백은 프로젝트의 https://fthzjaeucyiudbjxmlgu.supabase.co/auth/v1/callback이다.
3. dev 서버를 재시작하고 `pnpm dev`로 프론트·백엔드를 함께 실행한 뒤 http://localhost:5173/login을 연다. localhost와 127.0.0.1을 혼용하지 않는다.
4. 제공자 버튼 → 제공자 로그인/동의 → 콜백 → 대화 화면 이동과 상단 내 계정 표시를 확인한다. Supabase profiles에 본인 행이 생성됐는지도 확인한다.
5. 상단 내 계정에서 닉네임 저장·새로고침 후 유지·로그아웃·다시 로그인 흐름을 확인한다.

요청에 따라 에이전트는 타입 검사·lint·빌드·브라우저·로그인·API·컨테이너 테스트를 실행하지 않았다. 실제 로그인 완료를 검증한 상태가 아니며 사용자가 실행 후 오류를 알려줄 예정이다. 최초 제공자 로그인 시 Auth 사용자와 profiles 행이 실제로 생성된다. 현재 로그인은 대화 저장·AI 연결 완료를 의미하지 않는다.
