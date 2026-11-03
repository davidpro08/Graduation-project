# 서비스 API 설계 초안

## 최종 문서 조합·재조사 API · 2026-11-03

기존 문서 PATCH에 markdown?:string(비공백·최대10,000자), markdownEdited?:boolean, researchReviewed?:boolean을 추가했다. markdown은 공백·개행을 그대로 저장한다. researchReviewed는 재조사 자료를 검토했다는 쓰기 전용 입력이며, researchUpdated=true인 문서는 이 값과 markdown을 함께 저장해야 검토 대기가 해제된다. 단순 저장으로 새 자료 확인을 우회하지 않는다.

| 경로 | 요청·응답과 경계 |
| --- | --- |
| POST /api/persona-debates/:id/document/compose | DocumentDto(현재 revision·편집 항목) →200 {markdown}. 본인 문서·버전 확인, 저장·모델 호출 없음. 과거 문서도 조합해 볼 수 있으나 당시 실제 입력을 뜻하지 않는다. |
| POST /api/persona-debates/:id/research | {revision,queries:string[]} →202 새 작업. queries는 중복 없는1~3개·각2~150자. 검토 상태·최신 버전만 허용하며 기존 문서/기록을 유지한다. 선택 대화·필터·수정 조건을 복사하고 새 조사 후review에서 멈춘다. |
| POST /api/persona-debates/:id/run | 기존 {revision} 계약 유지. researchUpdated=true이면409. 저장된 최종 문서를 claim해 의견 생성하며 자동 재조사하지 않는다. |

두 새 경로 모두 기존 AuthGuard·소유권404·버전409·DTO400을 적용한다. 재조사는 활성 작업 제한·DB 중복 방지를 재사용한다. 문서 응답에 basedOn?:{id,revision}, researchUpdated?:boolean, markdownEdited?:boolean을 추가하며 research.queryResults와 research.enrichment로 검색 누락·정리 오류를 표시한다. 읽기 전용 조사/메타데이터를 PATCH로 주입할 수 없다. 기존 JSON 저장소를 사용하고 원격 스키마/권한 변경은 없다. [AI 계약](../AI/persona-debates.md#최종-마크다운-중심-조사분석-파이프라인--2026-11-03)을 따른다.

## 모니터링 진단·실패 다시시작 · 2026-11-03

사용자 GPU 그래프에 대응해 읽기 전용으로 실제 작업 상태와 학교 로그를 확인했다. 2026-11-03 11:20:07 KST 시작 작업은11:21:09에 AI_REQUEST_TIMEOUT(약62초,0명)으로 실패했다. 직전 작업은JOB_INTERRUPTED였다. 학교 Qwen/JEV tmux는 살아 있고 GPU0%/VRAM23119MiB, 최신 로그의 Running=0/Waiting=0으로 유휴였다. OOM/학교 프로세스 종료의 증거는 없었다. 요청별 HTTP200은 내용 검증 성공을 뜻하지 않으며 첫 응답 뒤 재시도 중60초 전체 제한에 걸린 정황이다. 첫 응답의 세부 검증 실패 코드는 과거 로그가 없어 단정하지 않는다.

초안 출력1536→1152토큰, 짧은 항목/인용 지시로 줄이고 문서 모델 단계의 전체60→100초 한도를 조정했다. 실제20~21토큰/초 로그에 비해 기존60초 예산이 재시도를 수용하기 어려웠다. 추가 재귀 호출/전체 대화 조사는 도입하지 않았다. 이후 진단을 위해 원문·키를 제외한 시도 번호/오류 코드만 Logger에 기록한다. 실제 모델 재요청·서버 재기동은 수행하지 않았다.

POST /api/persona-debates/:id/restart {mode:'document'|'opinions'} →202. 본인 failed 작업만 허용하며 원래 실패 기록은 보존한다. 입력·필터·발언자를 복사한 새 UUID/새 표본 작업을 만든다. document는 빠른 문서 생성 후review에서 멈추고, opinions는 저장된 문서 스냅샷을 복사해 의견을 새로 요청한다(이전 부분 응답 이어받기는 아님). 문서 없음400·잘못된 모드400·타인404·실패 이외409·활성 작업 제한과 DB 중복 방지를 유지한다. 기존 인터페이스/DI·저장소 Adapter를 재사용해 DB 마이그레이션·권한 변경은 없다.

실패 카드에 문서 생성 다시시작 또는 AI 의견 요청 다시시작을 제공하고 문서가 있으면 문서부터 다시 만들기도 옆에 표시한다. 접수 중 비활성화·진행 표시·오류 안내·새 분석 페이지 이동을 연결했다. 자동 재요청하지 않고 사용자의 버튼 클릭으로만 실행한다.


## 빠른 검색 초안으로 전환 · 2026-11-03

사용자 정정으로 전체 대화 페이지 순회·구간별 누적 요약·재귀 분할을 문서 생성에서 제거했다. 기존 messages search API로 질문에서 추출한 최대6개 핵심 단어를 첫40개씩 제한 조회한다(동시3개). 단일 발언자는 DB 조건에도 적용하고 복수 발언자는 후보에서 제한한다. 중복·무관·제외 화자를 제거하고 관련도순 최대16개/약6KB의 단어 주변 발췌만 한 번에 Qwen에 보낸다. 조회한 후보가 없으면 대화 없이 질문만 정리한다. 전체 데이터에서 일치가 전혀 없음을 보장하는 검색은 아니며 first-page 제한과 복수 화자 희소 조건으로 관련 발언을 놓칠 수 있다. 결과에 검색어·후보 수·참고 수·부분 조사 경고를 표시한다.

AI 호출은 기본1회, 실패 시 입력을 줄여 최대1회 재시도하며 previous=null이다. 재귀 분할·누적/전체 요약은 없다. 모델 단계는60초 대기 제한, 출력1536토큰·짧은 초안 지시를 사용한다. DB 검색 시간은 별도이며 완료 시간을 보장하지 않는다. JEV 관련성 호출은 추가하지 않아 대기 경로를 늘리지 않는다. 기존 인용 검증·주제별 응답 기준·원문 제외 의견 입력은 유지한다. sourceCoverage JSON에 mode=keyword/keywords/matchedMessages/searchFailed를 추가하며 신규 DB 마이그레이션은 없다. 순수 검색/발췌 함수를 document-search.ts로 분리하고 기존 Adapter/DI를 유지했다.

이전의 ‘모든 페이지 조사/구간별 복구’ 문서 기록은 과거 동작이다. 사용자 직접 시험을 위해 실제 AI 요청·학교 서버 변경은 하지 않았다. 새 문서 생성 요청부터 적용한다.


## 문서 근거 품질 보완 · 2026-11-03

사용자 요청으로 문서 품질만 보완했다. **실제 학교 AI 요청·모델 실험·서버 재시작은 실행하지 않고 사용자 직접 시험을 기다린다.** 프롬프트는 질문 의도·사실/참여자 의견/가정/미확인 정보·쟁점·판단 기준을 분리하고 없는 반대 논거나 합의를 채우지 않도록 강화했다. optional factEvidence(최대8개: text/kind/messageId/quote)를 생성하며 reported/opinion의 인용은 실제 현재 구간에 포함되거나 이전 구간에서 확인한 동일 항목이어야 한다. 위조 ID/인용·이전 사실 변형은 AI_TOPIC_EVIDENCE로 거절하고 기존 재시도/분할 정책을 따른다. 가정·미확인 항목에는 원문 근거를 붙이지 않는다.

화면은 항목별 분류·원문 인용·근거 이동 버튼을 표시한다. facts는 분류 문구를 포함해 의견 모델에 전달하지만 원문 인용과 ID는 기존 opinionContext 허용 목록으로 제외한다. 사용자 facts 변경은 오래된 factEvidence를 지워 잘못된 근거 연결을 방지한다. 근거 연결 없는 과거 문서는 확인 경고와 함께 호환한다. document JSON 확장이며 새 DB 컬럼·원격 SQL·런타임 의존성은 없다. 기존 Adapter/DI를 유지하고 document-grounding.ts의 순수 함수로 검증 책임을 분리했다.

이 검증은 **인용 존재와 출처 연결 확인**이다. 발언의 진위·법률 현행 여부·요약의 의미적 타당성을 자동 보장하지 않는다. 외부 조사 기능을 추가하지 않았으며 관련 자료가 없으면 미확인으로 남긴다. 변경 후 생성되는 새 문서에 적용되고 과거 저장 문서를 자동 재생성하지 않는다.


## 주제별 판단 문서·응답 구현 · 2026-11-03

사용자 후속 실행 요청으로 계획의 구현에 착수했다. 문서는 질문 의도→관련 사실/주장/미확인 정보→쟁점→판단 기준→응답 유형과 선택지를 생성한다. `answerSchema`는 stance/numeric/choice이며 금액에 고정하지 않는다. facts와 응답 기준은 편집 가능하고 원문은 사실 확인용으로 제공한다. 원문 체크만으로 입력이 달라지는 것처럼 보이던 UI를 제거했다. 선택지는2~9개, 수치형은 연속 하한 포함/상한 제외 구간과 별도 보류 항목을 검증한다. Qwen은 상세 결론·수치(수치형만)·근거 특성, JEV v2는 같은 문서의 항목 ID·조건부 확률을 반환한다. JEV 구간을 정확한 금액으로 변환하지 않고 수치 평균은 상세 실제 응답만 사용한다.

공통 인터페이스/DI·HTTP Adapter를 유지하고 검증은 answer-schema.ts의 순수 함수로 분리했다. 과거 문서는 v1 찬반 호환 경로로 읽는다. 새 결과는 고정 동의도/신뢰도 스펙트럼을 주요 결과로 사용하지 않으며 이름 옆에 실제 수치/선택 결과를 표시한다. 연령대·성별·지역·학력 그래프는 바로 보이고 나머지7개는 개별 펼침 영역, 분석에 사용한 추가 조건은 기본 펼침이다. 기존20+180 예산과 AI 진행 표시를 유지한다. 새 런타임 의존성·파일 이동/삭제·커밋/푸시·DB 마이그레이션은 없다.

SSH 직접 접속(-F NUL)으로 기존 설치를 확인했고, 꺼져 있던 Qwen/JEV를 기존 캐시로 재기동했다. JEV 브리지를 v1/v2 호환으로 반영하고 로컬18080/18081 터널을 열었다. 상세 술 정산 합성 사례에서 금액형 문서·상세 답변·JEV 구간 응답을 확인했다. 실제 모델 실험은 소규모이며 품질 전반 개선이나200명 전체 성공을 뜻하지 않는다. 백엔드106개 테스트·JEV4개 테스트 및 프론트 타입/lint, 백엔드 빌드/lint 통과 기록이 있다. 최종 주제3종 분류 검증과 화면 시각 검증 상태는 별도 결과를 따른다.


## 현재 요약 문서·표본 계약 · 2026-11-03

새 표본은 최대200명(상세20명 우선·나머지JEV 최대180명)이다. 문서에 `summary?:string`, `sourceCoverage?:{scannedMessages,successfulChunks,failedChunks,retries,partial,errorCodes:string[]}`, `warnings?:string[]`를 추가한다. 이전 문서는 context를 요약으로 사용한다. PATCH의 sourceCoverage/warnings/statements는 읽기 전용이며 전달하면400이다. 의견 입력은 요약·쟁점 허용 필드만 사용하고 원문 발언·화자·원문 ID를 제외한다. 작업의 processed/selected와 기존 stage/status를 진행 바에 사용하며 가상 백분율을 DB에 저장하지 않는다. [현재 AI 계약](../AI/persona-debates.md#현재-구성--2026-11-03)을 따른다.

2026-11-03 페르소나 facets/count/browse/sample의 HTTP·RPC 계약은 유지하며 내부 필터 조회만 비공개 캐시로 변경했다. 기존 facets의8초 시간 초과를 재현했고 수정 후 실제 로그인 화면에서 조회를 확인했다. [DB 변경·캐시 갱신](../database/schema.md#페르소나-선택지-시간-초과-해결--2026-11-03)을 참조한다.

## 모순·일정 응답과 오류 복구 · 2026-11-02

기존 URL·요청 형식을 유지한다. 모순 items는 title·기존 summary·근거 ID를 반환하고 일정 items는 date/time/uncertain과 영속 suggestion을 추가할 수 있다. 완료 metadata에 coverage('complete'/'partial'),successfulChunks,failedChunks,retries,splits,failures,truncatedItems를 기록한다. 일부 구간 실패는 유효 결과가 있으면 partial 안내와 함께 완료하고 전부 실패하면 failed다. 상태가 completed라는 이유만으로 전체 범위를 분석했다고 해석하지 않는다. AI_REQUEST_TIMEOUT/AI_BUSY를 추가했다. [전체 정책](../AI/analysis-flow.md#후보-표현대화-흐름오류-복구--2026-11-02)을 따른다.

GET schedules는 proposed의 suggestion(date/time/endTime/referenceDate/referenceTime/warnings/uncertain)을 작업 result.items[item_index]에서 복원한다. 기존 후보는 근거 발언으로 추정하고 confirmed는 저장된 사용자 입력을 그대로 반환한다. partial 완료는 기존 후보·확정 일정을 보존한다.

상태 확인·사용자·대화·원문·통계 및 모순 후보·일정 분석 API를 구현했다. 아래 과거 기록보다 마지막 실제 계약을 우선한다. 외부 경로는 `/api`를 기준으로 한다. 관점별 의견은 2026-11-02에 학교 연결 전 구현을 추가했다.

## 모순·일정 최근 한 달 제한 · 2026-11-02

POST `/conversations/:id/analyses`의 요청 형식은 `{type}` 그대로다. 새 작업은 대화 endDate 기준 한 달 전~마지막 날짜를 포함해 from/to로 DB 조회하며 기간 내 text만 모델에 보낸다. 완료 metadata에 `inputRange:{from,to,anchor:'conversation_end',messageCount}`를 추가한다. 월말 보정·빈 기간·기존 결과 호환은 [분석 흐름](../AI/analysis-flow.md#최근-한-달-분석--2026-11-02)을 따른다. 메시지 원문·통계·페르소나 분석 범위와 DB 스키마·RLS는 변경하지 않는다.

## 페르소나 DB 조회 API · 2026-11-02

아래 경로 앞에 `/api`를 붙인다. 모든 경로는 Bearer 로그인·대화 소유권을 확인하며 DB에서도 같은 소유권을 재확인한다. 관리자 키 없이 사용자 JWT로 `query_persona_data`를 호출한다. 모델 호출 없이 실제 5만 건을 조회한다.

| 메서드 | `/conversations/:id/personas` 하위 경로 | 요청·응답 |
| --- | --- | --- |
| GET | `/facets` | `?province=서울&province=경상남&occupationSearch=마케팅&page=1` → `{values,occupation:{total,page,pageSize:50,search},population,age:{min,max}}`. 직업은50개씩, 시군구는 선택 시도에 한정·시도 미선택 시 빈 배열 |
| POST | `/preview` | `{filters?}` → `{eligible,selected,detail,jev,warnings}`. 본문 미조회, 최대200명 기준 상세20 우선 |
| POST | `/search` | `{filters?,page?:1,pageSize?:20}` → `{items,total,page,pageSize}`. 최대50개씩 프로필·본문, UUID 순서 |
| POST | `/sample` | `{filters?,seed?}` → `{eligible,personas,seed,selected,detail,jev}`. 최대200명, 같은 seed/데이터/조건이면 같은 순서·표본. 생략 seed는 새 UUID |

필터 키는 `ageGroup,sex,province,education,maritalStatus,familyType,occupation,district,bachelorsField,housingType,militaryStatus`다. 항목당 최대30개·중복 없는 문자열 배열, 문자열1~200자, 빈 배열/생략은 전체다. 항목 내부 OR·항목 사이 AND다. 원본 값은 표시명과 구분하며 `경상남`, `서울-강서구`, `배우자있음`, `4년제 대학교` 등을 그대로 전달한다. `income` 및 임의 키·null·잘못된 타입은400. page1~100000(선택지는1000), pageSize1~50, 검색100자, seed1~100자. 목록·표본 프로필의 `name`은 본문 첫 이름, `persona`는 원문 요약이다. 분석 결과에는 요약 본문을 저장하지 않는다.

예: `/conversations/:id/personas/preview`에 `{"filters":{"province":["서울"],"sex":["여자"],"ageGroup":["30-39"],"maritalStatus":["배우자있음"]}}` → 조건 일치445명일 때 현재 배정 `{eligible:445,selected:200,detail:20,jev:180,warnings:[]}`.20명 이하이면 JEV가0임을 경고한다. `/search`와 `/sample`은 학술 합성 데이터 조회이며 실제 인물 조회가 아니다.

## 페르소나 논쟁 API · 2026-11-02

JEV-CPU 결과는 기존 opinion 필드와 함께 선택적 `scoreKind:"conditional_option_probability"`, `optionProbabilities:number[5]`를 저장한다. 순서는 강한반대/반대/중립/찬성/강한찬성, 좌표는-1/-0.5/0/0.5/1이다. confidence는 최대 확률, opinion은 해당 라벨이다. 서버는 유한성·합1·승리값과 라벨/좌표를 검증한다. statistics의 `jevScoreKind`는 conditional_option_probability/self_reported/mixed/null이다. 과거 필드가 없는 저장 결과는 자기평가 방식으로 호환한다. 이 값은 정확도·모집단 신뢰구간이 아니다.

모든 경로는 AuthGuard·대화/작업 소유권을 확인한다. 상세 구조·처리 제한·연결 순서는 [페르소나 논쟁 계약](../AI/persona-debates.md)을 따른다.

| 메서드 | `/api` 뒤 경로 | 동작 |
| --- | --- | --- |
| GET | `/conversations/:id/persona-debates/facets` | 호환용 값 맵. 직업 첫50개·시군구 비움. 신규 화면은 `/personas/facets` 사용 |
| POST | `/conversations/:id/persona-debates/preview` | `{filters?}` → eligible/selected/detail/jev, 200, AI 미호출 |
| POST | `/conversations/:id/persona-debates` | `{input,filters?,speakerIds?}` → 문서 생성 pending 작업, 202. 페르소나 분석은 시작하지 않음 |
| GET | `/conversations/:id/persona-debates/history?page=1` | 분석 기록20개씩, `{items,total}`. 결과 본문은 별도 개별 조회 |
| GET | `/conversations/:id/persona-debates` | `{job:null 또는 최신작업}` |
| GET | `/persona-debates/:id` | 상태·문서·revision·speakerIds·진행률·오류·완료 result |
| PATCH | `/persona-debates/:id/document` | review 상태에서 `{revision,summary?,question,proposition,context,keyIssues,supportingLogic,opposingLogic,evidenceMessageIds}` 저장, 200 |
| POST | `/persona-debates/:id/run` | `{revision}` 문서 버전 확인 후 페르소나 분석 시작, 202 |
| POST | `/persona-debates/:id/result` | `{filters?}` → 저장 결과·필터 재집계 statistics, 200; 미완료409 |

input은 비공백 1~800자다. filters는 위 DB 조회와 같은11종·배열 제한을 사용한다. 빈 배열은 전체, 항목 내부 OR·항목 사이 AND다. 알 수 없는 필드는400, 인증401, 없는/타인 대화·작업404, 중복 활성 작업·서버 작업 초과409, DB/선택지 장애503. 샘플·AI 실행 중 장애는 저장된 failed 작업의 오류 코드로 반환한다. 개인 원문·외부 상세 오류·비밀 키는 반환/로그에 기록하지 않는다.

speakerIds는 실제 대화 참여자의 UUID v4를 최대400개·중복 없이 받으며 빈 배열은 전체다. 문서 정리가 끝나면 `review`가 되고 revision=1이다. 논리 배열은 각6개·각500자, 질문/주장은300자·맥락800자·summary는 비공백 최대2000자(과거 클라이언트는 생략 가능), 근거는 기존 statements에 있는 ID만 최대20개 허용한다. 실제 화자·발언 본문을 바꾸는 입력은 받지 않는다. 수정 시 revision 증가, 이전 revision의 수정/실행과 review 이외의 수정/중복 실행은409다. 기록 page는1~100000이다.

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
| POST | `/api/conversations/:conversationId/analyses` | Bearer | 분석 생성, HTTP 202와 작업 `id` 반환 | 구현 |
| GET | `/api/conversations/:conversationId/analyses?type=` | Bearer | 마지막 저장 작업 `{job:작업 또는 null}` | 구현 |
| GET | `/api/analyses/:jobId` | Bearer | 작업 상태·실패 코드 조회 | 구현 |
| GET | `/api/analyses/:jobId/result` | Bearer | 완료된 분석 결과·근거 조회 | 구현 |
| GET | `/api/conversations/:conversationId/schedules` | Bearer | 일정 후보·확인된 일정 배열 | 구현 |
| POST | `/api/schedules/:scheduleId/confirm` | Bearer | 후보를 확인된 일정으로 전환 | 구현 |
| PATCH | `/api/schedules/:scheduleId` | Bearer | 본인의 확인된 일정 수정 | 구현 |

## 최소 계약과 동작

긴 대화 처리 수정: 구간 200개 제한을 제거했다. 작업 시간은 `ANALYSIS_TIMEOUT_MS` 기본 2시간이며 소유자의 상태 조회로 검증된 최신 토큰을 작업에 전달한다.  기존 `ANALYSIS_TOO_LARGE` 실패 작업은 재분석 시 새 작업으로 처리한다.

현재 분석 요청은 `type`만 받으며 기존 `useJev`는 400으로 거절한다. 학교 Qwen을 분석 작업과 DB·화면에 연결했다. 자체 서버 jev-cpu는 미연결이다. 상세 입력·응답·제한은 [분석 실제 계약](../AI/analysis-flow.md#api-실제-계약)을 따른다.

- 인증은 Supabase 액세스 토큰을 `Authorization: Bearer ...`로 전달한다. 인증 실패와 타인 데이터 접근을 거절한다.
- 업로드는 초기 카카오톡 내보내기 텍스트로 한정한다. 필드명 `file`을 사용하며 지원 형식·크기·인코딩·파싱 실패 응답은 구현 시 확정한다.
- 분석 종류는 `contradiction`, `schedule`만 허용한다. 한 작업은 한 종류를 처리한다. 관점별 의견은 미구현이다. 통계는 NestJS가 소유권 확인 후 RLS가 적용되는 DB 집계 함수를 호출한다.
- 분석 생성 응답은 `id`, `status`를 포함하는 작업 객체다. 조회 상태는 `pending | processing | completed | failed`다. 실패 시 비밀 정보 없는 `errorCode`를 포함한다.
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

## 일정 시각 계약 추가 · 2026-10-03

일정 조회는 `endsAt: string|null` 및 근거 메시지 시점 기준 `suggestion`을 제공한다. suggestion 필드는 `date`, `time`, `endTime`(nullable), `referenceDate`, `referenceTime`, `warnings: string[]`다. 제안은 저장·확정 상태를 변경하지 않는다.

일정 확정 POST와 수정 PATCH는 기존 title/date/time에 선택적 `endTime`(HH:mm)을 받는다. 생략하면 종료 시각은 null이며 같은 날 시작 시각보다 늦어야 한다. 잘못된 시각·역전 범위는 400이다. 한국 시간으로 저장하고 기존 확정값을 제안으로 덮어쓰지 않는다.
