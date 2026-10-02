# 서비스 API 설계 초안

상태 확인·사용자·대화 업로드·원문·통계 API를 구현했다. 분석·일정 API는 미구현 설계 초안이다. 외부 경로는 `/api`를 기준으로 한다. Supabase Auth 로그인 자체는 NestJS 로그인 API로 중복 구현하지 않는다.

| 메서드 | 경로 | 인증 | 목적 | 구현 상태 |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | 불필요 | 백엔드 프로세스 상태 확인; `status: ok`, `service: backend` | 구현 |
| GET | `/api/docs` | 불필요 | 개발 Swagger UI | 구현·로컬 개발 전용 |
| GET | `/api/docs-json` | 불필요 | 개발 OpenAPI JSON | 구현·로컬 개발 전용 |
| GET | `/api/users/me` | Bearer | 검증된 사용자 본인의 Auth 정보와 서비스 프로필 | 구현 |
| PATCH | `/api/users/me` | Bearer | 본인의 닉네임 수정 | 구현 |
| POST | `/api/conversations` | Bearer | multipart 업로드·파싱·원본과 DB 저장 | 구현 |
| GET | `/api/conversations` | Bearer | 본인의 대화 목록·제목 검색·페이지 조회 | 구현 |
| GET | `/api/conversations/:conversationId` | Bearer | 대화 정보·참여자 조회 | 구현 |
| GET | `/api/conversations/:conversationId/messages` | Bearer | 구조화 원문 검색·필터·페이지 조회 | 구현 |
| DELETE | `/api/conversations/:conversationId` | Bearer | 비공개 원본 삭제 후 대화·참여자·메시지 삭제 | 구현 |
| GET | `/api/conversations/:conversationId/statistics` | Bearer | 메시지·글자·참여자·날짜·시간대 SQL 집계 | 구현 |
| POST | `/api/conversations/:conversationId/analyses` | 필요 | 분석 생성, HTTP 202와 작업 ID 반환 | 미구현 |
| GET | `/api/analyses/:jobId` | 필요 | 작업 상태·실패 코드 조회 | 미구현 |
| GET | `/api/analyses/:jobId/result` | 필요 | 완료된 분석 결과·근거 조회 | 미구현 |
| GET | `/api/conversations/:conversationId/schedules` | 필요 | 일정 후보·확인된 일정 조회 | 미구현 |
| POST | `/api/schedules/:scheduleId/confirm` | 필요 | 후보를 확인된 일정으로 전환 | 미구현 |
| PATCH | `/api/schedules/:scheduleId` | 필요 | 본인의 확인된 일정 수정 | 미구현 |

## 최소 계약과 동작

- 인증은 Supabase 액세스 토큰을 `Authorization: Bearer ...`로 전달한다. 인증 실패와 타인 데이터 접근을 거절한다.
- 업로드는 초기 카카오톡 내보내기 텍스트로 한정한다. 필드명 `file`을 사용하며 지원 형식·크기·인코딩·파싱 실패 응답은 구현 시 확정한다.
- 분석 종류는 `contradiction`, `persona`, `schedule`로 구분한다. 한 작업은 한 종류를 처리한다. 통계는 NestJS가 소유권 확인 후 RLS가 적용되는 DB 집계 함수를 호출한다.
- 분석 생성 응답은 `jobId`, `status`를 포함한다. 조회 상태는 `pending | processing | completed | failed`다. 실패 시 비밀 정보 없는 `errorCode`를 포함한다.
- 완료 전 결과 요청은 HTTP 409, 없는 리소스는 404로 처리한다. 타인 리소스 접근은 존재 여부 노출을 피하도록 404로 처리한다.
- 결과는 [AI 계약](../AI/api.md)을 검증하여 저장한 데이터다. 근거 메시지 ID는 요청한 대화에 속해야 한다.
- 일정 후보는 `proposed`, 확인된 일정은 `confirmed`로 구분한다. 확인 전 날짜·시간의 불명확성을 사용자가 해결한다. 확인 동작은 반복해도 중복 일정을 만들지 않는다.
- 대화 삭제 중 실행 작업은 취소 가능 여부를 확인하고 최소한 삭제 후 늦게 도착한 결과가 데이터를 복원하지 못하도록 한다. DB·Storage 부분 실패 처리 방식은 구현 시 기록한다.

## 구현 시 확정할 항목

페이지네이션·응답 DTO·오류 코드 목록·업로드 제한·타임아웃·폴링 정책·일정 시간대와 날짜 검증을 구현 전에 명시한다. 이 목록은 완료 API가 아닌 후속 설계 작업이다. 계약 변경 시 프론트·데이터·AI의 영향 범위를 확인한다.

## 사용자 API 계약 · 2026-10-01

GET·PATCH 응답은 `id`, `nickname`, `email`, `providers`, `createdAt`, `updatedAt`이다. ID는 UUID, 시각은 시간대가 포함된 문자열이다. nickname·email은 NULL을 허용하며 providers는 Auth identities의 제공자를 중복 제거·정렬한 배열이다. 이메일·identity는 `auth.getUser(token)`으로 검증된 정보만 사용하고 토큰은 반환하지 않는다.

PATCH 요청은 `{ "nickname": "문재현" }`만 허용한다. 앞뒤 공백을 제거한 뒤 Unicode 문자 1~30자를 허용한다. 필드 누락·빈 문자열·NULL·비문자열·길이 초과·추가 필드는 400이다. 임의 사용자 ID를 받는 API와 목록·삭제 API는 없다.

| 상태 | 조건 |
| --- | --- |
| 200 | 본인 조회·수정 성공 |
| 400 | PATCH 입력 검증 실패 |
| 401 | Bearer 누락·형식 오류·위조·만료·익명 Auth 사용자 |
| 404 | 검증된 사용자의 서비스 프로필 누락 |
| 503 | Auth·DB 연결 실패, 타임아웃 또는 외부 서비스 오류 |

외부 요청 제한은 요청당 10초다. Auth SDK 내부 재시도가 있어 전체 처리 시간이 항상 10초 이하인 것은 아니다. 오류에는 토큰·개인 본문·원격 오류 상세를 노출하지 않는다. GET은 프로필을 생성하지 않으며 프로필 생성은 DB 가입 트리거가 담당한다.

백엔드는 HTTP 요청에서 Bearer 액세스 토큰만 사용하며 자체 세션 쿠키나 JWT를 발급하지 않는다. 2026-10-03 프론트 OAuth 시작·콜백·SDK 세션 갱신·로그아웃과 사용자 API 호출 코드를 연결했다. NestJS 로그인 API는 추가하지 않았다. 사용자가 제공자 앱 설정을 완료했다고 알렸으며 실제 로그인·API 연결 테스트는 사용자 수행으로 남겼다.

## 대화 API 실제 계약 · 2026-10-03

서비스 데이터는 NestJS를 거치며 모든 대화 경로에 Bearer 검증과 소유권 확인을 적용한다. 타인 대화와 없는 대화는 404다. 원본 파일 다운로드 API·AI 작업·일정 API는 이번에 추가하지 않았다.

| 요청 | 입력·응답 |
| --- | --- |
| POST /conversations | multipart `file`, `title`(공백 제거 후 1~80자), `uploadId`(UUID v4). 201로 대화 정보 반환 |
| GET /conversations | `page` 기본 1, 페이지당 20개; `search` 제목 부분 검색(최대 200자). `{items,total}` |
| GET /conversations/:id | `id,title,participants,messageCount,startDate,endDate,createdAt,warnings`; participants는 `{id,name,colorIndex}` 배열 |
| GET /conversations/:id/messages | `from,to` YYYY-MM-DD 포함 범위, `participantId`, `search` 본문 부분 검색, `page` 기본 1, `pageSize` 기본 100·최대 200. `{items,total,page,pageSize}` |
| GET /conversations/:id/statistics | `from,to,participantId`; 조회 조건에 해당하는 전체 데이터 집계 |
| DELETE /conversations/:id | 원본 삭제 후 DB 연쇄 삭제. 성공 204 |

메시지는 `{id,sequence,participantId,speaker,date,time,text,kind}`다. sequence는 원본 순서이며 같은 시각의 메시지도 합치지 않는다. kind는 text/attachment/system, 시스템의 participantId는 null이며 시각이 없으면 time은 빈 문자열이다. 사진·파일 표시는 원문 텍스트로 보존하며 첨부 파일 자체를 추출하지 않는다. 검색의 `%`, `_`, 역슬래시는 와일드카드가 아닌 문자로 처리한다.

통계 응답은 `messageCount,textCount,participantCount,characterCount,participants,daily,hourly`다. 참여자별 값은 `id,name,colorIndex,count,textCount,characters,shortCount,nightCount,questionCount`다. 날짜별 `{date,count}`는 첫·마지막 발언 사이 빈 날짜를 0으로 포함하고 시간별 `{hour,count}`는 0~23시 모두 포함한다. 시스템은 전부 제외하고 첨부 표시는 메시지 수만 집계한다. 글자 수는 공백·줄바꿈을 제외한 유니코드 문자 수다. shortCount는 텍스트 1~5자, nightCount는 00:00~05:59 메시지, questionCount는 `?`/`？`가 있는 텍스트 메시지 수다. 실제 답장 여부·평균 응답 시간은 추정하지 않는다.

| 상태 | 조건 |
| --- | --- |
| 400 | 지원하지 않는 형식·날짜·시간·이름·빈 파일·파싱 실패·제목·조회 조건 오류 |
| 401 | 인증 누락·만료·위조·익명 사용자 |
| 404 | 없는 대화 또는 타인 소유 대화 |
| 409 | 같은 업로드 ID 처리 중 또는 다른 파일에 ID 재사용 |
| 413 | 업로드 10MiB 초과 |
| 503 | DB·Storage 실패; 원격 오류 상세와 개인 원문은 노출하지 않음 |

PC 한국어 날짜 구분선 + `[이름] [오전/오후 시:분]`, 모바일 한국어 날짜·점 표기 + `시:분, 이름 : 본문`을 지원한다. UTF-8/BOM, UTF-16 BOM, CP949를 읽으며 최대 10MiB·100,000개 메시지·400명이다. 날짜 구분선·제목·저장 시각은 본문에서 분리하고 멀티라인 본문은 보존한다. 이름이 같으면 동일 인물로 처리하므로 동일 닉네임의 서로 다른 실제 사람을 구분할 수 없다.

원본 업로드 후 SECURITY INVOKER RPC가 대화·참여자·메시지를 한 트랜잭션으로 저장한다. 원본 SHA-256과 uploadId를 기록한다. 같은 ID·같은 파일 재시도는 기존 대화를 반환한다. DB 저장 실패 시 원본을 정리하지만 저장 완료 여부를 확인할 수 없으면 보존하여 재시도에 사용한다. DB 행 없는 기존 원본이 같은 바이트이면 재사용한다. 프로세스 내 같은 ID 동시 요청은 409로 제한하며 분산 락은 제공하지 않는다. 확인 불가능한 원본을 정리하는 운영 배치와 자동 재파싱 UI는 이번 범위에 없다.

Storage 삭제가 실패하면 DB를 유지하고, DB 삭제만 실패하면 메시지는 남으므로 삭제 재시도로 완료한다. 브라우저 요청 제한은 60초, SDK 외부 호출 제한은 요청당 10초다. 클라이언트의 응답 대기 취소가 서버 트랜잭션을 취소한다고 보장하지 않는다. 폴링·AI 호출·외부 캘린더 연결은 없다.
