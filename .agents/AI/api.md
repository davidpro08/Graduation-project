# AI 연결 계약과 분석 HTTP 초안

JEV SDK와 학교 Qwen HTTP Adapter를 실제 분석 API·DB·화면에 연결했다. 최신 계약은 [화면·DB 분석 흐름](analysis-flow.md)을 따른다. 아래 별도 AI 서버 `/analyze`는 과거 설계 초안이며 실제 호출은 vLLM `/tokenize`·`/v1/chat/completions`다. RunPod·관점별 의견은 제외한다.

## JEV 사전 판단 실제 계약 · 2026-10-03

공식 `@typesafe-ai/sdk` 0.6.0으로 NestJS가 `https://api.typesafe.ai/v1/systemone`을 호출한다. 인증은 서버 전용 `TYPESAFE_API_KEY`의 Bearer 방식이다. 설치 대상은 JEV 모델 자체가 아니라 API 클라이언트다. 새 공개 서비스 API와 분석 종류별 후보 판단 로직은 추가하지 않았다.

| 항목 | 실제 계약 |
| --- | --- |
| 내부 호출 | `JevService.evaluate({state, questions}, {useJev?})`; Noul·Choice·Score 질문 지원 |
| 전역 비활성화 | `JEV_ENABLED=false`이면 SDK 생성·HTTP 호출 없이 `{used:false, reason:'disabled'}` |
| 호출별 비활성화 | 전역 활성화 + `useJev:false`이면 `{used:false, reason:'request-disabled'}` |
| 활성화 | 전역 true + 호출별 true 또는 생략 시 `{used:true, result:{model, answers, usage}}` |
| 실패 | `{used:false, reason:'unavailable', errorCode}`; 시간 초과·연결·HTTP·응답·요청 오류를 구분 |
| 시간 제한 | 기본 5,000ms, `JEV_TIMEOUT_MS`로 1~60,000ms 설정, 자동 재시도 0회 |
| 모델 | `JEV_MODEL`, 기본 `jev-latest`; 호출 입력의 model은 사용하지 않고 서버 설정으로 고정 |

전역 true에 키가 없으면 시작 시 설정 오류다. 호출별 true는 전역 false를 우회하지 않는다. SDK 로그는 환경변수와 무관하게 off로 고정한다. 질문별 응답 타입·확률 범위·선택지·점수 범위와 공통 메타데이터를 검증하며, 실패를 후보 없음으로 바꾸지 않는다. 예기치 못한 어댑터 외부 구현 오류는 숨기지 않는다.

호출자는 `used:false`면 원문을 유지하고 LLM 경로로 이어가야 한다. 실제 LLM 연결은 아직 없으므로 이 결과만으로 분석이 완료되지는 않는다. 후보 선별 임계값·전체 대화 분할·학교 서버 호출은 후속 구현이다.

`pnpm --filter @gratta/backend build` 후 `pnpm --filter @gratta/backend check:jev`로 합성 메시지 1개를 확인한다. `check:jev --skip`은 호출별 우회를 확인한다. 키가 없는 기본 상태는 disabled를 출력하며 실제 API 요청을 보내지 않는다. 키는 루트 Git 제외 `.env` 또는 프로세스 환경변수에 두고 브라우저로 전달하지 않는다.

## JEV와 학교 Qwen 연속 진단 · 2026-10-03

`pnpm --filter @gratta/backend check:ai-flow`는 NestJS `AiModule`·`JevService`로 합성 대화에 모순 가능성·일정 언급 Noul 질문을 한 번에 전송한다. 백엔드가 결과를 읽고 종류별 상세 분석이 필요하면 Qwen HTTP API를 직접 호출한다. JEV가 Qwen을 직접 호출하는 구조가 아니다. 운영 서비스·DB·화면 연결이 아닌 진단용 스크립트다.

진단용 생략 기준은 종류별 확률 `<0.2`다. 불확실한 값도 포함해 `>=0.2`이면 원문을 Qwen에 보내며 JEV 비활성화·실패 시 두 종류를 모두 상세 분석한다. 이 수치는 검증용이며 운영 기준으로 확정하지 않는다. 같은 사람의 모순 발언과 구체적 일정이 있는 합성 대화, 일반 인사 대화만 사용한다.

Qwen은 `contradictions[{summary,evidenceMessageIds}]`, `schedules[{title,dateTimeText,evidenceMessageIds}]` JSON을 반환한다. 배열·필수 문자열·입력에 존재하는 근거 ID·모순 근거 최소 두 개·선택하지 않은 종류의 빈 결과·정상 완료를 확인한다. 일정은 확정하지 않으며 날짜는 원문 표현으로 보존한다. 선택한 종류를 판단하려고 관련 원문 전체를 전달하며 JEV가 메시지 단위 후보를 추출하지 않는다.

| 합성 시나리오 | 실제 JEV 결과 | 실제 Qwen 결과 |
| --- | --- | --- |
| 모순과 일정 | 모순 0.59·일정 0.99, 329ms | 제출 담당 발언 불일치(m1,m3), 2026-10-09 오후 3시 도서관 회의(m4), 3,776ms |
| 일반 인사 | 모순 0.05·일정 0.10, 187ms | 두 종류 모두 낮아 HTTP 호출 생략 |

학교 API 기본 주소는 `http://127.0.0.1:18080/v1`; 진단용 `SCHOOL_AI_BASE_URL`, `SCHOOL_AI_API_KEY`가 있으면 사용한다. 모델은 확인된 `Qwen/Qwen3-32B-AWQ`, 시간 제한 90초·자동 재시도 없음·non-thinking·출력 최대 1,024토큰이다. JEV 키는 출력하지 않으며 진단 출력에는 합성 입력의 결과만 기록한다. 처리 시간과 확률은 이번 실행 결과이며 일반 성능 보장은 아니다.

## 별도 분석 서버 HTTP 초안

| 메서드 | AI 내부 경로 | 목적 | 인증 | 상태 |
| --- | --- | --- | --- | --- |
| POST | `/analyze` | 한 작업의 분석 입력을 받아 결과 반환 | 서버 간 인증 필요; 방식은 연결 시 확정 | 미구현 |
| GET | `/health` | 프로세스 준비 상태 확인 | 노출 범위는 배포 시 제한 | 미구현 |

브라우저는 이 API를 직접 호출하지 않는다. NestJS는 사용자에게 작업 ID를 먼저 반환한 뒤 AI HTTP 호출을 실행한다. AI 응답의 비동기 콜백이나 SQS는 초기 계약에 포함하지 않는다.

## 입력 예시

합성 대화 예시이며 ID·시간은 설명용이다.

```json
{
  "jobId": "job-example",
  "analysisType": "contradiction",
  "conversationId": "conversation-example",
  "messages": [
    {"messageId": "m1", "speaker": "참여자A", "sentAt": "2026-09-29T09:00:00+09:00", "text": "제가 금요일까지 제출할게요."},
    {"messageId": "m2", "speaker": "참여자A", "sentAt": "2026-09-30T09:00:00+09:00", "text": "제가 제출하기로 한 적은 없어요."}
  ]
}
```

| 필드 | 의미 |
| --- | --- |
| jobId | NestJS가 발급한 작업 ID; 응답과 일치해야 함 |
| analysisType | `contradiction`, `persona`, `schedule` 중 하나 |
| conversationId | 분석 대상 대화 식별자 |
| messages | 메시지 ID·발화자·시각·본문; 실제 계정 ID나 비밀 키는 보내지 않음 |

## 출력 예시

```json
{
  "jobId": "job-example",
  "analysisType": "contradiction",
  "modelId": "mock",
  "result": {
    "items": [
      {"summary": "제출 약속 여부에 불일치 가능성이 있습니다.", "evidenceMessageIds": ["m1", "m2"]}
    ]
  }
}
```

공통 출력은 `jobId`, `analysisType`, `modelId`, `result`다. `modelId`는 실제 모델 식별 정보 또는 `mock`으로 기록한다. 결과 종류별 최소 항목은 다음과 같다.

| 종류 | result 초안 | 처리 |
| --- | --- | --- |
| contradiction | `items`: summary, evidenceMessageIds | 불일치 후보와 근거 표시 |
| persona | `opinions`: perspective, opinion, suggestion, evidenceMessageIds | 생성 관점·해결 제안 표시; 여론 비율 제외 |
| schedule | `candidates`: title, dateTimeText, evidenceMessageIds | 원문 날짜·시간 후보 보존; 사용자 확인 전 확정 일정으로 저장하지 않음 |

## 검증·오류

- jobId·analysisType이 요청과 일치하고 JSON 형태·결과 종류가 계약을 따라야 한다.
- evidenceMessageIds는 입력 메시지에 존재해야 한다. 후보가 없으면 빈 배열을 반환하며 근거를 만들어내지 않는다.
- NestJS가 HTTP 성공 여부와 별도로 결과를 검증한다. 잘못된 결과는 완료로 저장하지 않는다.
- AI 오류·타임아웃은 작업을 `failed`로 만든다. 재요청은 새 작업 ID로 처리하며 초기에는 자동 재시도를 전제하지 않는다.
- 상세 JSON 스키마, 본문·컨텍스트 제한, 시간 제한, 인증 헤더, 오류 응답 형식은 실제 연결 구현 전에 확정하고 문서화한다.

## 일정 제안 보강 · 2026-10-03

Qwen의 원문 날짜 표현·근거 ID 계약은 유지한다. 백엔드 후보 조회에서 해당 근거의 발언 날짜·시각으로 상대 날짜와 시간 범위를 결정하여 suggestion을 추가한다. 모호한 오전·오후는 확인 경고를 붙이고 사용자 확정이 필요하다. 상세 규칙은 analysis-flow.md의 일정 날짜·시간 제안을 따른다.
