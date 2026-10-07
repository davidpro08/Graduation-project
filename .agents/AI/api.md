# AI HTTP 계약 초안

**미구현 설계 초안**이다. 모델 설정·추론 프레임워크는 보류하며 모의 서버와 실제 서버가 같은 계약을 사용하도록 한다.

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
