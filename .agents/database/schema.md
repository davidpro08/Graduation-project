# DB 스키마와 원격 상태

## 공식 문서 우선 조회

- [Supabase 공식 문서](https://supabase.com/docs): Database·Auth·Storage, RLS·권한, 클라이언트·CLI 문서를 확인한다.
- DB 기술을 조사할 때 위 공식 문서에서 해당 제품과 주제를 먼저 확인한다. 연결된 Supabase 문서 검색 도구가 있으면 공식 문서 범위에서 검색하고 원문을 확인한다.
- 기능 구현·설정 변경 전 공식 변경 이력과 사용하는 SDK·CLI 버전의 호환성을 확인한다. 자료가 부족하면 Context7와 Supabase 공식 저장소의 이슈·릴리스로 보완한다. PostgreSQL 자체 기능은 PostgreSQL 공식 문서도 확인한다.

Supabase Auth·PostgreSQL·비공개 Storage를 사용하는 설계다. **페르소나 참조 테이블과 사용자 프로필은 원격 DB에 구현됐고, 대화·분석·일정 테이블은 개념 설계 단계다.** 프론트 컴포넌트·백엔드 클래스 구조를 DB 스키마로 그대로 복제하지 않는다. 아래 실제 상태는 2026-10-01에 관리 API와 PostgreSQL 카탈로그를 다시 조회해 확인했다.

## 원격 Supabase 상태

| 항목 | 확인된 상태 |
| --- | --- |
| 프로젝트 | `davidpro08's Project` / `fthzjaeucyiudbjxmlgu` |
| 운영 상태 | `ACTIVE_HEALTHY` |
| 리전 | `ap-south-1` |
| PostgreSQL | 엔진 17, 배포 버전 `17.11.0.002` |
| 직접 DB 호스트 | `db.fthzjaeucyiudbjxmlgu.supabase.co` |
| 실제 적재 연결 | Session pooler `aws-0-ap-south-1.pooler.supabase.com:5432`, DB `postgres`, SSL 사용 |
| 프로젝트 애플리케이션 테이블 | `persona_data.korean_personas`, `public.profiles` 2개 |
| 적재 건수 | 50,000개; 기본 표본 40,000개 + 보충 표본 10,000개 |
| 원격 마이그레이션 | `20261001023358_create_korean_persona_sample`, `20261001050936_create_user_profiles` |
| 테이블 데이터·TOAST 등 | 167,010,304바이트 |
| 인덱스 | 5,496,832바이트 |
| 테이블 총합 | 172,507,136바이트, 약 172.51MB / 164.52MiB |
| DB 전체 | 183,465,651바이트; 시스템 데이터 등 포함 |
| Storage | 버킷 0개; 페르소나 원본 파일은 원격 Storage에 올리지 않음 |
| 서비스 연결 | NestJS 사용자 Bearer 검증·프로필 API 구현; 페르소나 서버 조회·Auth OAuth 로그인·AI 연동 미구현 |

접속 비밀번호와 API 비밀 키는 기록하지 않는다. 리전·접속 주소는 실제 확인 값이며, 현재 프로젝트 상태와 용량은 재조회 시 달라질 수 있다.

## 구현된 페르소나 스키마

`persona_data.korean_personas`는 사용자 소유 데이터와 분리된 공용 참조 데이터다. 외래 키는 없으며, 사용자·대화 테이블과의 관계는 아직 구현하지 않았다.

| 컬럼 | 타입 | NULL 허용 | 제약·기본값·역할 |
| --- | --- | --- | --- |
| uuid | text | 아니오 | 기본 키; `^[0-9a-f]{32}$`; PostgreSQL uuid 타입으로 변환하지 않고 원본 문자열 보존 |
| age | smallint | 아니오 | `age >= 19` |
| age_group | text | 아니오 | 추출 시 계산한 6개 연령 구간; DB CHECK 제약은 없음 |
| sex | text | 아니오 | 원본 성별 |
| province | text | 아니오 | 원본 시도 |
| district | text | 예 | 원본 시군구 |
| occupation | text | 예 | 원본 직업 |
| marital_status | text | 예 | 원본 혼인 상태 |
| family_type | text | 예 | 원본 가족 형태 |
| education_level | text | 예 | 원본 학력 |
| persona | text | 아니오 | 원본 요약 페르소나 |
| details | jsonb | 아니오 | 나머지 원본 16개 필드 |
| sample_group | text | 아니오 | CHECK: `base` 또는 `supplement` |
| sample_reasons | jsonb | 아니오 | 보충 사유 배열; 기본 표본은 빈 배열. 배열 타입 CHECK는 없음 |
| source_revision | text | 아니오 | 기본값 `ada0f5b53a38bb5a30cce09358adde883c1ab63a` |
| sample_seed | integer | 아니오 | 기본값 `20261001` |

`details`에 보존한 필드는 `professional_persona`, `sports_persona`, `arts_persona`, `travel_persona`, `culinary_persona`, `family_persona`, `cultural_background`, `skills_and_expertise`, `skills_and_expertise_list`, `hobbies_and_interests`, `hobbies_and_interests_list`, `career_goals_and_ambitions`, `military_status`, `housing_type`, `bachelors_field`, `country`다. 원본의 목록 모양 문자열은 실제 JSON 배열로 변환하지 않았다. JSONB 객체 구조를 강제하는 CHECK는 아직 없다.

| 인덱스 | 종류·컬럼 | 목적 |
| --- | --- | --- |
| korean_personas_pkey | UNIQUE B-tree `(uuid)` | 식별·중복 방지 |
| korean_personas_demographics_idx | B-tree `(age_group, sex, province)` | 복합 인구통계 조건 조회 |
| korean_personas_family_idx | B-tree `(marital_status, family_type)` | 가족·혼인 조건 조회 |
| korean_personas_occupation_idx | B-tree `(occupation)` | 직업 조건 조회 |

복합 인덱스는 모든 개별 컬럼 조건의 성능을 보장하지 않는다. 실제 서비스 쿼리를 구현한 뒤 실행 계획을 확인하고 추가 인덱스를 결정한다. 전문 검색·벡터 인덱스와 임베딩은 없다.

### 현재 접근 권한

RLS는 활성화됐고 정책은 0개다. `anon`·`authenticated`의 스키마·테이블 접근을 차단했으며 SELECT 권한이 없음을 재확인했다. 일반 브라우저 호출로 읽을 수 없다. 임시 적재 역할 `persona_import_20261001`과 관련 INSERT·UUID SELECT 정책은 제거됐고 잔존 역할은 0개다. 로컬 임시 접속 파일은 `{}`로 비워 비밀번호를 제거했다.

관리 도구로 조회하는 현재 상태와 NestJS에서 조회할 수 있는 서비스 상태를 구분한다. 다음 작업에서 제한된 서버 읽기 역할을 구성하며 AI 서버에 직접 DB 권한을 부여하지 않는다.

## 파일 변경점과 로컬 산출물

| 경로 | 변경·역할 | 상태 |
| --- | --- | --- |
| `scripts/sample_personas.py` | 신규; 원본 다운로드·층화 추출·다양성 보충·배치와 manifest 생성 | 실행 완료 |
| `scripts/import_personas.py` | 신규; 임시 SCRAM 접속 정보 생성·Session pooler 배치 적재 | 실행 완료; 역할 생성·종료 후 제거는 관리 도구에서 별도 수행 |
| `scripts/read_persona_batch.py` | 신규; MCP 전송용 압축 배치 읽기 | 실제 최종 적재에는 직접 DB 연결 사용 |
| `scripts/persona-requirements.txt` | 신규; pyarrow 25.0.1, psycopg[binary] 3.3.3 고정 | `.tmp/persona-libs`에 설치; 앱 의존성에 추가하지 않음 |
| `.agents/database/schema.md` | 갱신; 실제 스키마·원격 상태·파일 변경점의 진입 문서 | 현재 문서 |
| `.agents/database/persona-sample.md` | 신규 후 갱신; 추출 기준·출처·실측·검증 상세 | [상세 기록](persona-sample.md) |
| `.agents/agents.md` | 갱신; DB 부분 완료와 남은 M2 작업 명시 | 서비스 전체 완료로 표시하지 않음 |
| `.tmp/persona-sample/` | 원본 Parquet 9개, sample.jsonl, 배치 JSON 100개, manifest.json, content-checksum.json | Git 제외; JSONL 237,197,094바이트 |

원격 마이그레이션은 관리 도구의 `apply_migration`으로 생성했다. 2026-10-01 사용자 인증 기반 작업에서 기존 원격 페르소나 마이그레이션 SQL을 로컬에 복원하고 사용자 마이그레이션과 함께 `supabase/migrations`에 기록했다. 기존 원격 이력·참조 데이터는 재적용하거나 변경하지 않았다. 마이그레이션 재실행만으로 페르소나 5만 건이 복원되지는 않는다.

## 검증과 후속 작업

50,000개 레코드·고유 UUID, 기본/보충 건수, 17개 시도·252개 시군구를 검증했다. 적재 시 로컬·DB의 UUID 목록 및 원본 26개 필드를 포함한 전체 내용 체크섬이 일치했다. 이번 문서 갱신에서는 원격 프로젝트 상태·컬럼·제약·인덱스·권한·용량·마이그레이션·버킷 수를 재확인했다. 체크섬과 원본 버전은 [상세 기록](persona-sample.md)에 있다.

다음 작업은 서버 전용 읽기 권한과 조회 API 구성, 사용자·대화 스키마 및 소유권 RLS 구현, 비공개 업로드 버킷 구성이다. 페르소나 증량·재추출 시 기존 표본과 원본 버전을 보존하고 인덱스 포함 용량을 다시 측정한다.

## 서비스 스키마와 후속 개념

| 개념 | 주요 필드 초안 | 관계·목적 |
| --- | --- | --- |
| 사용자 | Auth 사용자 ID·닉네임·생성/수정 시각 | `public.profiles` 구현; 아래 실제 계약 참조 |
| 대화 | ID, 소유자 ID, 제목, 원본 경로, 업로드 시각 | 사용자의 업로드 단위 |
| 메시지 | ID, 대화 ID, 순서, 발화 시각, 발화자, 본문 | 대화에 소속; 발화자를 서비스 계정과 동일시하지 않음 |
| 분석 작업 | ID, 대화 ID, 소유자 ID, 종류, 상태, 오류 코드, 생성·수정 시각 | 대화별 AI 작업의 상태 |
| 분석 결과 | 작업 ID, 결과 JSON, 모델 식별 정보 | 검증된 완료 결과; 근거는 메시지 ID 참조 |
| 일정 | ID, 대화 ID, 작업 ID, 소유자 ID, 제목, 날짜·시간 후보, 상태, 근거 메시지 ID | `proposed`와 `confirmed` 구분 |
| 원본 파일 | Storage 경로, 소유자·대화 식별 관계 | 비공개 버킷에 저장; DB에는 파일 참조만 보관 |

관계는 사용자 1:N 대화, 대화 1:N 메시지·작업·일정, 작업 1:0..1 결과다. 통계는 구조화 메시지로 계산하고 초기에는 독립 통계 테이블을 전제하지 않는다.

## 소유권과 접근

- 사용자 데이터 테이블에 RLS를 적용하고 인증 사용자와 대화 소유자를 기준으로 접근을 제한한다. 하위 메시지·결과도 부모 소유권으로 보호한다.
- Storage 버킷은 비공개로 두고 소유권 정책을 적용한다. 원본 파일의 공개 URL을 만들지 않는다.
- 브라우저의 서비스 데이터 접근은 NestJS를 거친다. 서버에서도 소유권을 확인하고 사용자 컨텍스트를 유지한다.
- 분석 작업의 대화·소유자, 결과의 근거 메시지, 일정의 소속 관계가 일치하도록 제약·검증을 설계한다.
- 대화 삭제 시 메시지·작업·결과·일정·원본을 정리한다. DB 트랜잭션과 별도 Storage 삭제의 부분 실패를 고려한다.
- AI 서버는 DB를 직접 수정하지 않는다. 서버 비밀 키는 클라이언트와 AI에 공유하지 않는다.

## 스키마 변경 규칙

정확한 타입·키·제약·인덱스는 구현 시 마이그레이션과 이 문서에 기록한다. 날짜·시간의 기준과 모호한 일정 표현을 잃지 않도록 원문 후보를 보존한다. 변경 전 데이터 호환성을 확인하고 백엔드 API 영향이 있으면 계약도 갱신한다. 운영 데이터를 테스트에 사용하지 않는다.

## 한국 페르소나 참조 데이터

2026-10-01에 Supabase 프로젝트 `fthzjaeucyiudbjxmlgu`의 비공개 `persona_data.korean_personas`에 NVIDIA 합성 한국 페르소나 50,000개를 적재했다. 서비스 사용자 프로필은 아래와 같이 구현했으며 대화·분석·일정은 미구현이다. 원본 26개 필드 보존, 표본 기준, 접근 제한, 실제 용량 및 검증은 [페르소나 표본 적재 기록](persona-sample.md)을 참조한다. 페르소나 NestJS·AI 연동은 미구현이며 AI 서버의 직접 DB 접근을 허용하지 않는다.

## 사용자 프로필 실제 계약 · 2026-10-01

| 컬럼 | 타입 | NULL | 규칙 |
| --- | --- | --- | --- |
| id | uuid | 불가 | PK, auth.users(id) FK, ON DELETE CASCADE |
| nickname | text | 허용 | 초기 NULL, DB 트리거로 앞뒤 공백 제거, CHECK 문자 길이 1~30 |
| created_at | timestamptz | 불가 | 기본 now(), 일반 사용자 수정 불가 |
| updated_at | timestamptz | 불가 | 기본 now(), 수정 트리거 clock_timestamp(), 일반 사용자 직접 수정 불가 |

가입 트리거 `create_user_profile`은 `app_private.create_profile()`로 빈 프로필을 만든다. 기존 Auth 사용자도 마이그레이션에서 보충한다. 함수는 제한된 비공개 스키마·빈 search_path·SECURITY DEFINER를 사용하며 PUBLIC·anon·authenticated 실행 권한을 회수했다. 정규화·시각 갱신 함수 `app_private.normalize_profile()`는 SECURITY INVOKER다. 초기 닉네임을 OAuth 사용자 metadata에서 가져오지 않는다.

RLS 정책 `profiles_select_own`, `profiles_update_own`은 `(select auth.uid()) = id`를 사용한다. UPDATE에는 USING과 WITH CHECK를 모두 적용한다. authenticated에는 SELECT와 UPDATE(nickname)만 부여하고 anon·PUBLIC에는 접근 권한이 없다. 일반 사용자 INSERT·DELETE·ID·시각 수정은 차단한다. 별도 이메일·비밀번호·provider·OAuth 토큰 컬럼은 없다.

원격·로컬 SQL 본문 일치와 원격 정책·컬럼 권한을 확인했다. [검증 SQL](../../supabase/tests/profiles.sql)은 합성 Auth 사용자 둘을 트랜잭션에서 생성해 트리거, 정규화, 제약, 본인·타인 접근, 삽입·삭제·보호 컬럼 차단과 연쇄 삭제를 검증한 후 롤백한다. 실행 후 Auth 사용자·프로필 모두 0건이고 페르소나 50,000건·RLS를 유지했다.

보안 advisor의 신규 사용자 스키마 지적은 없다. 기존 페르소나의 정책 0개는 일반 접근 차단을 위한 의도된 상태이며 INFO `rls_enabled_no_policy`가 유지된다. [advisor 설명](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)을 참조한다.
