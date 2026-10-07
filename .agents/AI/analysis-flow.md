# 화면·DB 분석 연결 · 2026-10-03

모순 후보와 일정만 구현했다. 관점별 의견·RunPod는 후속 범위다. 실제 모델은 학교 `Qwen/Qwen3-32B-AWQ`, 확인한 컨텍스트는 2,048토큰이다.

| 단계 | 실제 동작 |
| --- | --- |
| 화면 | 분석 종류별 시작·JEV 체크박스·2초 폴링·실패 재시도·새로고침 후 마지막 작업 복원 |
| 인증 | AuthGuard 검증, 소유권 확인, 사용자 토큰으로 Supabase RLS 접근 |
| 입력 | 전체 메시지를 200개씩 조회, text만 분석. 구간 수 제한 없음, 전체 기본 2시간 |
| 분할 | 메시지 600문자 조각·약 3KB 단위. `/tokenize`로 실제 프롬프트 토큰 확인 후 필요 시 재분할 |
| JEV | 구간별 종류별 후보 확률 판단. `JEV_SKIP_THRESHOLD=0.2` 미만이면 tokenize·상세 분석 모두 생략. 토큰 재분할 시 원래 판단 재사용 |
| Qwen | JEV 비활성·호출별 우회·JEV 장애 시 직접 상세 분석. 출력 최대 768토큰, 요청 90초 |
| 저장 | 응답 형식·근거 ID 검증 후 `complete_analysis` RPC로 결과와 일정 후보 원자적 저장 |
| 일정 | 원문의 날짜 표현 보존. 사용자가 제목·날짜·시각 확인 후 한국 시간으로 확정·수정 |

0.2는 초기 임계값이며 누락률 평가를 통과한 기준이 아니다. 생략 구간 수를 표시한다. 분할 구간을 가로지르는 모순은 누락될 수 있으며 화면에 한계를 표시한다. 정확도 평가·장거리 모순 연결·구간 중첩은 후속 작업이다. 결과를 사실로 단정하지 않는다.

## API 실제 계약

모든 경로는 `/api` 접두사와 Bearer 인증을 사용한다. UUID는 v4다.

| API | 계약 |
| --- | --- |
| POST `/conversations/:id/analyses` | `{type:"contradiction" 또는 "schedule",useJev?:boolean}`. 기본 true, 202로 작업 객체 반환 |
| GET `/conversations/:id/analyses?type=` | `{job:작업 또는 null}`. 본인 마지막 작업만 조회 |
| GET `/analyses/:id` | `id,conversationId,analysisType,status,errorCode,createdAt,updatedAt,result,metadata` |
| GET `/analyses/:id/result` | 완료 시 `{items,metadata}`, 완료 전 409 |
| GET `/conversations/:id/schedules` | 후보·확정 일정 배열, 최대 1,000개 |
| POST `/schedules/:id/confirm` | `{title,date:"YYYY-MM-DD",time:"HH:mm"}` 필수. 중복 행 생성 없이 같은 ID 갱신 |
| PATCH `/schedules/:id` | 같은 입력. confirmed만 수정 |
| GET `/conversations/:id/messages?messageId=` | 소유권·대화 일치 확인 후 해당 근거의 원문 페이지 반환. 다른 필터 해제 |

모순 항목은 `{summary,evidenceMessageIds}`이며 서로 다른 근거 2개 이상이다. 일정 항목은 `{title,dateTimeText,evidenceMessageIds}`이며 근거 1개 이상이다. 결과 메타데이터는 `jevUsed,qwenModel,chunks,skippedChunks,warnings`다. 전체 구간을 완료해야 저장하며 부분 성공 결과를 확정하지 않는다.

작업은 백엔드 프로세스 메모리에서 실행한다. 토큰은 실행 중 메모리에만 유지하고 DB에 저장하지 않는다. 소유자의 상태 조회에서 검증된 최신 토큰으로 작업 토큰을 갱신한다. 화면을 닫아 갱신 요청이 없거나 DB 장애가 발생하면 장기 작업이 실패할 수 있다. 한 프로세스에서 최대 4개 작업을 허용한다. 같은 대화·종류의 진행 작업은 DB 유일 인덱스로 차단한다. 재시작 후 실행자가 없는 pending/processing은 사용자 조회 시 `JOB_INTERRUPTED` 실패로 복구한다. 다중 백엔드 배포 전에는 공유 작업 큐·worker를 도입해야 한다.

실패 코드는 `AI_CONFIG_ERROR`, `AI_CONTEXT_ERROR`, `AI_AUTH_ERROR`, `AI_UNAVAILABLE`, `AI_INVALID_RESPONSE`, `AI_INVALID_EVIDENCE`, `AI_INCOMPLETE_RESPONSE`, `ANALYSIS_TIMEOUT`, `ANALYSIS_TOO_LARGE`, `ANALYSIS_FAILED`, `JOB_INTERRUPTED`다. 원격 오류 본문·키·원문을 오류 로그에 출력하지 않는다. 대화 삭제 후 FK와 RPC 조회가 늦은 결과의 재생성을 막는다.

## DB

`analysis_jobs`는 대화·소유자 복합 FK, 작업 종류·상태·결과·메타데이터·시각을 저장한다. `schedules`는 작업·대화·소유자 복합 FK, 원문 날짜·근거 배열·proposed/confirmed·starts_at을 저장한다. 대화 삭제 시 연쇄 삭제한다. SECURITY INVOKER RPC는 근거 메시지가 같은 대화·소유자에 속하는지 검증한다. 재분석은 이전 proposed 후보를 교체하고 confirmed 일정을 유지한다. 같은 작업 완료 호출은 반복해도 결과·일정이 중복되지 않는다.

로컬 SQL은 `supabase/migrations/20261003113704_ai_analyses.sql`, 원격 MCP 적용 이력은 `20261003115026_ai_analyses`다. MCP가 적용 시각으로 버전을 부여했다. 원격 SQL은 이미 적용했으므로 같은 SQL을 `db push`로 다시 적용하지 않는다. 다음 CLI 배포 전 로컬·원격 이력 매핑을 정리해야 한다. 기존 사용자 파일 이동·원격 이력 수정은 수행하지 않았다.

RLS·공개 권한 회수·FK 인덱스 검사 완료. 신규 테이블의 보안·미인덱스 FK 지적은 없다. 기존 Auth 유출 비밀번호 보호 경고와 페르소나 정책 없음 INFO는 기존 상태다. [보안 점검 설명](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [RLS 정책 점검](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## 실행 설정

학교 SSH 터널은 로컬 `127.0.0.1:18080`을 학교 `127.0.0.1:8000`으로 전달한다. 개인 SSH 키와 인증 값은 Git 제외 파일에 둔다.

| 변수 | 값·기본값 |
| --- | --- |
| SCHOOL_AI_BASE_URL | 로컬 Nest: `http://127.0.0.1:18080/v1`; Compose: `http://host.docker.internal:18080/v1` |
| SCHOOL_AI_MODEL | `Qwen/Qwen3-32B-AWQ` |
| SCHOOL_AI_API_KEY | 선택적 Bearer 키. 현재 학교 API 인증 미설정이므로 SSH 터널 사용 |
| JEV_SKIP_THRESHOLD | `0.2`, 0~1. 전역·호출별 JEV 사용 여부는 기존 계약 유지 |
| ANALYSIS_TIMEOUT_MS | 기본 `7200000`(2시간), 정수 60,000~14,400,000ms 허용 |

학교 서버 종료 또는 터널 단절 시 실패하며 더미 응답을 반환하지 않는다. Docker 엔진이 꺼져 있어 Compose 내부 연결 검증은 하지 않았다. 직접 실행한 프론트·Nest·터널로 검증한다.

## 검증

`check:analysis-pipeline`은 실제 JEV·Qwen과 운영 분석 서비스를 합성 메모리 저장소로 확인한다. 실제 두 종류 모두 completed·근거 ID·모델 확인, 약 3초. DB 테스트는 합성 데이터로 RLS·완료 RPC 반복·일정 확정/수정·위조 근거 거절·원자성·대화 연쇄 삭제 확인 후 롤백했다. 합성 Auth 계정은 잔존하지 않는다.

브라우저 파일 업로드는 Chrome 확장의 파일 URL 접근 비활성으로 막혔다. 기존 로그인 계정에 `[검증용 합성] JEV·Qwen 화면·DB` 대화를 DB import RPC로 별도 생성해 화면·분석·저장 검증에 사용한다. 실제 원본 TXT는 업로드하지 않았고 대화 안내에도 표시했다. 원본 업로드 검증과 분석 저장 검증을 구분한다.

실제 로그인된 Chrome에서 모순·일정 각각 분석 버튼 → JEV → Qwen → completed → DB 저장 → 화면 표시를 확인했다. 일정 후보를 2026-10-09 15:00 한국 시간으로 확정하고 제목·16:00으로 수정한 뒤 새로고침 복원도 확인했다. 실제 터널 단절 시 failed/AI_UNAVAILABLE와 실패 안내 확인, 확정 일정 보존 확인, 터널 복구 후 모델 목록 정상 응답 확인. 인증 실패는 HTTP Adapter 모의 401로 확인했다(실제 학교 API는 인증 미설정). 백엔드 40개 테스트·양쪽 타입/lint·Nest와 Next 프로덕션 빌드 통과. 진단 스크립트와 `supabase/tests/analyses.sql`로 재현할 수 있다.

복구 후 화면 재분석도 completed로 저장됐다. 근거 링크는 실제 메시지 페이지로 이동해 해당 발언에 포커스·강조를 적용했다. 검증용 합성 대화는 사용자가 결과를 확인할 수 있게 남겼다. 새 변경의 커밋·원격 푸시는 수행하지 않았다.

## 긴 대화 제한 오류 수정

사용자의 `ANALYSIS_TOO_LARGE` 보고를 확인했다. 초기 구현은 분할 구간이 200개를 넘으면 전체 작업을 실패시켰다. 구간 수 제한을 제거하고 시간 제한을 설정 가능한 기본 2시간으로 조정했다. JEV 판단을 먼저 실행해 생략 구간의 학교 API 호출도 없앴으며 토큰 재분할은 사전 판단을 재사용한다. 화면은 분량·시간 초과·재시작·인증·연결 실패를 서로 다른 안내로 표시한다. 기존 TOO_LARGE 작업은 다시 분석해야 한다.

16,120개 합성 메시지·200개 초과 구간의 전체 순회·JEV 생략, 상태 조회 토큰 갱신 후 최종 저장, 재분할 시 JEV 중복 호출 방지 회귀 테스트를 추가했다. 기존 인터페이스와 Adapter·DI 구조를 유지했다. 실사용자의 긴 개인 대화를 외부 AI로 재전송하는 자동 재분석은 수행하지 않았다.

수정 후 43개 테스트 통과, 백엔드 빌드·양쪽 타입/lint·Next 빌드 통과. 실제 합성 모순·일정 각각 JEV→Qwen completed 재확인. 로컬 백엔드를 새 빌드로 재시작했다.

## 일정 날짜·시간 제안 · 2026-10-03

후보 조회 시 근거 메시지의 원래 한국 날짜·시간을 기준으로 날짜를 계산한다. 실행 시각은 사용하지 않는다. 원문 날짜 표현이 실제 메시지에 포함되면 해당 표현을 사용하고, 그렇지 않으면 날짜 표현이 있는 근거 본문을 사용한다. 확정된 사용자 입력은 유지한다. 날짜 계산은 독립 함수로 분리하고 기존 Adapter·DI 구조를 유지했다.

| 표현 | 계산 규칙 |
| --- | --- |
| 금요일 4시반~5시반 | 발언 시점의 주 금요일, 시작 시각이 지났으면 다음 주 |
| 이번/다음/다다음/지난 주 | 월요일 기준 주 이동; 이번 주의 지난 시각은 다음 주 |
| 오늘·내일·모레·글피 | 발언 날짜 기준 일 이동 |
| 다음 달·이번 달의 일자 | 발언 월 기준; 일자만 있고 지난 시각이면 다음 달 |
| 명시한 연·월·일 | 과거라도 임의 이동하지 않음 |
| 오전·오후 없는 1~12시 | 오후 제안과 확인 경고; 자동 확정하지 않음 |

숫자 시각·반·분·콜론 표기와 범위를 지원한다. 알 수 없는 날짜·시간은 비워 확인 안내를 표시한다. 자정을 넘는 종료 시각은 자동 제안하지 않으며 현재 저장 계약은 같은 날 종료만 지원한다. 반복 일정은 첫 일정 제안만 제공한다.

조회 응답 suggestion은 date/time/endTime, referenceDate/referenceTime, warnings를 포함한다. 사용자 확정 시에만 starts_at/ends_at을 저장한다. 기존 후보도 새로고침만으로 제안을 표시한다.

로컬 종료 시각 마이그레이션은 `20261003124739_schedule_end_time.sql`, 원격 적용 이력은 `20261003124914_schedule_end_time`다. MCP 적용 시각 차이이며 이미 적용한 SQL을 재적용하지 않는다.

백엔드 51개 테스트, 타입·lint·빌드를 검증했다. 실제 로그인 화면에서 shadcn 달력 선택·시/분 선택과 16:00~17:30 종료 시간 DB 저장을 확인했다. SQL 테스트는 종료 시각 제약을 검증 후 롤백했다.
