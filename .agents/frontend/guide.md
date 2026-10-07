# 프론트엔드 지침

## 범위와 기술

Next.js App Router·React·TypeScript 프로젝트로 구성하고 Tailwind CSS와 shadcn/ui를 사용한다. 소스는 `apps/frontend`에 있으며 M1 개발 환경을 구성했다. 실제 package.json과 잠금 파일을 기준으로 기록한다.

| 패키지 | 구분 | 상태 | 버전 범위 |
| --- | --- | --- | --- |
| `@radix-ui/react-slot` | 런타임 | 설치됨 | `^1.3.3` |
| `class-variance-authority` | 런타임 | 설치됨 | `^0.7.1` |
| `clsx` | 런타임 | 설치됨 | `^2.1.1` |
| `lucide-react` | 런타임 | 설치됨 | `^1.49.0` |
| `next` | 런타임 | 설치됨 | `16.3.8` |
| `@fontsource/noto-sans-kr` | 런타임 | 설치됨 | `^5.3.0` |
| `react` | 런타임 | 설치됨 | `^19.3.0` |
| `react-dom` | 런타임 | 설치됨 | `^19.3.0` |
| `tailwind-merge` | 런타임 | 설치됨 | `^3.7.0` |
| `@eslint/js` | 개발·검증 | 설치됨 | `^10.0.1` |
| `@tailwindcss/postcss` | 개발·검증 | 설치됨 | `^4.3.3` |
| `@types/node` | 개발·검증 | 설치됨 | `^24.19.0` |
| `@types/react` | 개발·검증 | 설치됨 | `^19.3.0` |
| `@types/react-dom` | 개발·검증 | 설치됨 | `^19.3.0` |
| `eslint` | 개발·검증 | 설치됨 | `^10.11.0` |
| `eslint-plugin-react-hooks` | 개발·검증 | 설치됨 | `^7.1.1` |
| `tailwindcss` | 개발·검증 | 설치됨 | `^4.3.3` |
| `typescript` | 개발·검증 | 설치됨 | `^5.9.3` |
| `typescript-eslint` | 개발·검증 | 설치됨 | `^8.71.0` |

실제 해석 버전은 루트 `pnpm-lock.yaml`을 기준으로 한다. Supabase 클라이언트는 M2에서 도입하며 아직 미설치다.

shadcn/ui는 패키지 자체를 설치하는 방식 대신 `components.json`과 소스 소유 방식으로 도입했다. 공개 Button 구성을 프로젝트에 맞춰 수동 반영했다. 라우팅은 Next.js App Router·next/link를 사용한다. 서버 상태 라이브러리·프론트 자동 테스트 프레임워크는 미선정이다.

## 컴포넌트와 상태

- 함수 컴포넌트·훅을 사용한다. 화면 조합, 입력·표시 컴포넌트, API 호출 책임을 분리한다.
- 컴포넌트명은 PascalCase, 함수·훅·변수는 camelCase, 훅은 use 접두사를 사용한다. 타입 경계를 명시하고 무분별한 any를 피한다.
- 상태는 가장 가까운 소유자에 둔다. 입력·모달 등의 UI 상태와 서버 데이터·분석 상태를 구분하고 계산 가능한 값을 중복 저장하지 않는다.
- 업로드·통계·모순·페르소나·일정 화면에서 로딩·빈 결과·실패 상태를 처리한다. AI 결과는 후보·제안임을 표시하고 근거 메시지로 연결한다.
- 일정 후보의 확인 동작과 이미 저장된 일정의 수정 동작을 구분한다.

## API와 인증

- 서비스 계약은 [backend/api.md](../backend/api.md)를 따른다. 인증은 Supabase Auth, 서비스 데이터는 NestJS의 `/api` 경로로 접근한다.
- API 호출을 화면마다 복제하지 않고 공통 호출 경계에 모은다. 세션 토큰을 전달하며 만료·인증 실패를 처리한다.
- 분석 생성 후 작업 ID로 상태를 조회한다. 완료·실패·화면 이탈 시 폴링을 중지하고 요청 실패 시 무한 재시도를 하지 않는다. 간격·제한은 구현 시 계약에 기록한다.
- 브라우저에 노출 가능한 공개 설정만 사용한다. NEXT_PUBLIC_ 클라이언트 환경변수에 서버 비밀 키를 넣지 않는다.
- 파일·응답 타입은 계약에 맞추고 서버 검증을 클라이언트 검사로 대체하지 않는다.

## 스타일과 접근성

- Tailwind와 shadcn/ui의 공통 토큰·컴포넌트를 재사용한다. 같은 화면 요소를 서로 다른 임의 스타일로 중복 구현하지 않는다.
- 키보드 조작, 입력 label, 오류 안내, 포커스 이동을 제공한다. 상태를 색상만으로 전달하지 않는다.
- 모바일·데스크톱에서 대화 본문과 근거를 읽을 수 있게 하고 긴 본문·파일명에 대응한다.

## 검증과 갱신

타입 검사·빌드와 변경에 필요한 UI 검증을 수행한다. 로그인 실패, 업로드 오류, 분석 상태 변화, 근거 연결, 일정 확인을 핵심 검증 대상으로 둔다. 루트의 `pnpm typecheck`, `pnpm lint`, `pnpm build`로 검증한다. 프론트 자동 테스트 스위트는 아직 없다. 계약·라이브러리가 달라지면 관련 문서를 함께 갱신한다.

## Figma 와이어프레임 기록

2026-10-01에 [그랬잖아 와이어프레임](https://www.figma.com/design/5IToNjI4vrk4ZPiptrvyfF?node-id=7-2)을 구성했다. README와 프론트·서비스 API·AI 계약 초안을 기준으로 작성한 설계이며 서비스 구현 완료를 의미하지 않는다.

| 항목 | 구성 |
| --- | --- |
| 데스크톱 | 로그인, 내 대화, 업로드, 원문, 통계, 모순 후보·근거, 관점별 의견, 일정 후보·확정 일정 8개 |
| 모바일 | 모순 후보, 일정 확인 2개 |
| 상태 | 분석 대기·처리·실패, 후보 없음, 대화 없음, 업로드·파싱 실패, 인증·입력 오류, 일정 확인 필요 |
| 공통 요소 | 버튼 2종, 입력, 메뉴; 변수·본문/설명/제목 스타일; 자동 배치 |
| 글꼴 | 사용자 승인으로 Noto Sans KR 사용. Pretendard는 Figma MCP 글꼴 목록과 직접 로드에서 사용 불가 확인 |
| 검증 | 편집 가능한 레이어·120개 화면 인스턴스·이미지 레이어 없음, 주요 이동 76개, 버튼 문구 영역 초과 없음, 데스크톱·모바일·상태 화면 시각 확인 |

예시는 합성 데이터다. AI 결과는 후보·제안으로 표시하며 원문 근거 연결, 일정 후보 확인과 확정 일정 수정 분리를 반영했다. 구현 시 업로드 제한·집계 기준·인증 정책 등 미확정 계약을 확정해야 한다.

## 디자인 토큰 v1

2026-10-01 사용자 요청으로 Realtime Colors에서 팔레트를 미리보기한 뒤 [Figma 디자인 토큰](https://www.figma.com/design/5IToNjI4vrk4ZPiptrvyfF?node-id=17-249) 페이지를 구성했다. 개발 기준 파일은 [design/README.md](../../design/README.md), [tokens.json](../../design/tokens.json), [tokens.css](../../design/tokens.css)에 기록했다. design/은 앱 소스와 별도로 공유 디자인 기준을 관리하기 위해 추가했으며 기존 파일 이동·삭제는 없다.

| 영역 | 확정한 설계 |
| --- | --- |
| Color | #182235 본문, #F8FAFC 배경, #3D5A99 Primary, #DCE8F2 Secondary, #237F86 Accent; 상태·입력·포커스 별칭 포함 |
| Typography | Noto Sans KR, 8개 본문·라벨·제목 스타일 |
| Spacing | 4px 단위, 0–96px, 최소 터치 영역 44px |
| Radius | 버튼·입력 10px, 카드 12px, 대화상자 16px, pill 9999px |
| Shadow | none/sm/md/lg 효과 스타일 |
| 검증 | Figma 변수 106개·별칭 40개·텍스트 스타일 8개·효과 스타일 4개, code syntax·명시적 scopes·폰트 확인 및 가이드 시각 검증. JSON·110개 CSS 변수 참조/중복 검사 통과 |

Figma 화면에는 브랜드 토큰 적용을 완료했다. 앱 연결은 frontend-screens 브랜치에서 진행한다. 디자인 토큰 구성만으로 서비스 기능 또는 구현 마일스톤을 완료로 변경하지 않는다.

## Figma 브랜드 토큰 적용

2026-10-01 사용자 요청으로 기존 데스크톱 8개·모바일 2개·상태 화면과 공통 컴포넌트에 design/tokens.json의 브랜드 팔레트와 Typography·Spacing·Radius·Shadow를 적용했다. 색상·폰트·간격·모서리는 Figma 변수에 연결하고 그림자는 효과 스타일로 연결했다. 현재 메뉴를 강조하고 근거 영역은 청록색, 삭제·실패는 오류 색, 날짜 확인은 주의 색으로 표시했다. 화면 구조와 프로토타입 연결 76개를 유지했다.

최종 검증: 기존 회색 토큰 참조 0, 변수/렌더 색상 불일치 0, 버튼 문구 영역 초과 0, Noto Sans KR 확인. 데스크톱·모바일 렌더 확인 통과. 최신 기록은 design/theme-application.json 및 design/figma-state.json에 저장했다. 실제 프론트 코드의 테마 연결은 미실행이며 구현 마일스톤은 M1 완료 유지한다.

## 최신 인계

현재 확정 디자인 기준은 [design.md](design.md)를 따른다. 이전 작업 기록의 미적용 상태는 당시 기록이며 현재 상태와 구분한다.


## Next.js 전환 · 화면 구현

2026-10-01 사용자 요청으로 Vite 런타임과 전용 패키지를 Next.js 16.3.8 App Router·Tailwind PostCSS로 대체했다. 실제 경로, 공유 데모 Context Provider, 루트 layout·Suspense, /api rewrites, standalone 빌드, Next.js용 타입 생성·출력 캐시·Docker bind mount를 구성했다. Noto Sans KR 400·500·700은 패키지로 자체 제공한다. 기존 main.tsx·index.html·비활성 vite.config.ts는 이전 진입점 기록으로 남겼으며 Next.js가 사용하지 않는다.

이번 작업에서 새로 추가한 src/pages 화면 초안은 Next.js Pages Router 예약 이름과 충돌하여 src/views로 정리했다. 기존 사용자 소스 이동은 없다. 디자인 인계는 [design.md](design.md), 화면·검증·미연결 범위는 [screens.md](screens.md)를 따른다. 앱 테마 연결 완료 상태가 최신 기준이다.
