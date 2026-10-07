# 서비스 API 설계 초안

상태 확인과 개발 문서 경로만 구현했다. 나머지는 **미구현 설계 초안**이다. 외부 경로는 `/api`를 기준으로 한다. Supabase Auth 로그인 자체는 NestJS 로그인 API로 중복 구현하지 않는다.

| 메서드 | 경로 | 인증 | 목적 | 구현 상태 |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | 불필요 | 백엔드 프로세스 상태 확인; `status: ok`, `service: backend` | 구현 |
| GET | `/api/docs` | 불필요 | 개발 Swagger UI | 구현·로컬 개발 전용 |
| GET | `/api/docs-json` | 불필요 | 개발 OpenAPI JSON | 구현·로컬 개발 전용 |
| POST | `/api/conversations` | 필요 | multipart 파일 업로드·파싱, 대화 ID 반환 | 미구현 |
| GET | `/api/conversations` | 필요 | 본인의 대화 목록 조회 | 미구현 |
| GET | `/api/conversations/:conversationId` | 필요 | 대화·구조화 메시지 조회 | 미구현 |
| DELETE | `/api/conversations/:conversationId` | 필요 | 본인 대화와 관련 데이터·원본 삭제 | 미구현 |
| GET | `/api/conversations/:conversationId/statistics` | 필요 | 대화량·시간대·답장 간격 조회 | 미구현 |
| POST | `/api/conversations/:conversationId/analyses` | 필요 | 분석 생성, HTTP 202와 작업 ID 반환 | 미구현 |
| GET | `/api/analyses/:jobId` | 필요 | 작업 상태·실패 코드 조회 | 미구현 |
| GET | `/api/analyses/:jobId/result` | 필요 | 완료된 분석 결과·근거 조회 | 미구현 |
| GET | `/api/conversations/:conversationId/schedules` | 필요 | 일정 후보·확인된 일정 조회 | 미구현 |
| POST | `/api/schedules/:scheduleId/confirm` | 필요 | 후보를 확인된 일정으로 전환 | 미구현 |
| PATCH | `/api/schedules/:scheduleId` | 필요 | 본인의 확인된 일정 수정 | 미구현 |

## 최소 계약과 동작

- 인증은 Supabase 액세스 토큰을 `Authorization: Bearer ...`로 전달한다. 인증 실패와 타인 데이터 접근을 거절한다.
- 업로드는 초기 카카오톡 내보내기 텍스트로 한정한다. 필드명 `file`을 사용하며 지원 형식·크기·인코딩·파싱 실패 응답은 구현 시 확정한다.
- 분석 종류는 `contradiction`, `persona`, `schedule`로 구분한다. 한 작업은 한 종류를 처리하며 통계는 NestJS에서 계산한다.
- 분석 생성 응답은 `jobId`, `status`를 포함한다. 조회 상태는 `pending | processing | completed | failed`다. 실패 시 비밀 정보 없는 `errorCode`를 포함한다.
- 완료 전 결과 요청은 HTTP 409, 없는 리소스는 404로 처리한다. 타인 리소스 접근은 존재 여부 노출을 피하도록 404로 처리한다.
- 결과는 [AI 계약](../AI/api.md)을 검증하여 저장한 데이터다. 근거 메시지 ID는 요청한 대화에 속해야 한다.
- 일정 후보는 `proposed`, 확인된 일정은 `confirmed`로 구분한다. 확인 전 날짜·시간의 불명확성을 사용자가 해결한다. 확인 동작은 반복해도 중복 일정을 만들지 않는다.
- 대화 삭제 중 실행 작업은 취소 가능 여부를 확인하고 최소한 삭제 후 늦게 도착한 결과가 데이터를 복원하지 못하도록 한다. DB·Storage 부분 실패 처리 방식은 구현 시 기록한다.

## 구현 시 확정할 항목

페이지네이션·응답 DTO·오류 코드 목록·업로드 제한·타임아웃·폴링 정책·일정 시간대와 날짜 검증을 구현 전에 명시한다. 이 목록은 완료 API가 아닌 후속 설계 작업이다. 계약 변경 시 프론트·데이터·AI의 영향 범위를 확인한다.
