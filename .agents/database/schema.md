# DB 스키마와 원격 상태

## 최종 판단 문서 JSON 확장 · 2026-11-03

기존 persona_debates.document JSON에 markdown, markdownEdited, researchUpdated, basedOn:{id,revision}을 선택 필드로 추가한다. research에는 queryResults(검색어별 출처/누락/오류), enrichment(정리 상태·시도 수·오류 코드), sources[].queries와 findings[].snippetId를 저장할 수 있다. researchReviewed는 PATCH 입력에서만 사용하고 저장 필드로 삼지 않는다.

새 테이블·컬럼·인덱스·마이그레이션·원격 SQL·권한 변경은 없다. 기존 owner_id·RLS와 revision의 낙관적 잠금을 유지한다. 재조사는 원래 review 행을 덮어쓰지 않고 새 작업을 만든다. 실제 의견에 쓴 최종 문서는 해당 작업의 document와 result.topic.context에 남으며 documentFormat=markdown으로 표시한다. 오래된 문서는 optional 필드 없이 읽는다.

## 페르소나 표본200명·문서 요약 · 2026-11-03

현재 sample 상한을500→200으로 바꿨다. 로컬 CLI 생성 `20261102153204_persona_analysis_budget.sql` → 원격 `20261102153710_persona_analysis_budget`. 기존 캐시 기반 쿼리와 제한된 DEFINER·소유권·권한을 유지하며 상한만 변경했다. PGlite11종·seed·200명·접근 차단과 실제 authenticated/8초의200명·모집단50000을 롤백 검증했다. 새로운 테이블/컬럼/권한은 없다.

기존 persona_debates.document JSON에 summary·sourceCoverage·warnings를 저장한다. 과거 문서는 context를 사용하며 결과 topic에는 원문·화자·근거 ID를 전달하지 않는다. 저장된 과거500명 결과는 유지한다. 아래 캐시의500명 성능 측정은 예산 변경 전 기록이다.

## 페르소나 선택지 시간 초과 해결 · 2026-11-03

실제 로그인 화면의 facets 조회 실패를 재현했다. DB/5만 원본/조회 함수는 정상이었으나, 기존 facets가5만 행의 대형 details JSON을 매번 해석·JSON 변환해 authenticated의 statement_timeout=8s에서57014로 취소됐다. 백엔드는 이를 일반 DB 연결/마이그레이션 오류로 표시했다. 학교 AI·SSH 연결은 이 조회에 관여하지 않는다.

| 변경 | 구현 |
| --- | --- |
| 필터 전용 저장 | 비공개 materialized view `app_private.persona_filter_cache`. UUID·나이·11종 정규화 특성만 저장하며 persona 본문·전체 details는 복제하지 않음 |
| JSON 해석 | 캐시 준비 시 jsonb_to_record로 details의3개 특성을 한 번에 추출 |
| 조회 | 기존 INVOKER persona_filter_rows가 캐시를 읽음. facets는 정적 VALUES로 범주를 집계하고 count/browse/sample의 필터도 캐시에서 먼저 적용 |
| 본문 | 선택된 최대500명에 대해서만 기존 원본을 조인 |
| 권한 | 캐시/기존 view의 PUBLIC·anon·authenticated 직접 접근·갱신 금지. 기존 본인 대화 확인 및 제한된 DEFINER/공개 INVOKER wrapper 유지 |
| 성능 | 같은 facets의 DB 실행764.02ms. 캐시50000행·인덱스 포함14032896바이트. 8초 제한을 늘리지 않음 |

로컬 `20261102150331_persona_filter_cache.sql` → 원격 `20261102150613_persona_filter_cache` 적용. 격리 PGlite에서11종·AND/OR·seed·500명·이름·직업 검색/페이지·시군구·입력 검증·직접 읽기/refresh 차단을 통과했다. 실제 authenticated 역할의8초 제한 안에서 facets/count/sample500을 확인 후 롤백했다. 원본/캐시 모두50000행, 기존 보안 advisor INFO/WARN만 유지했다. 실제 로그인 화면에서 조건 다시 불러오기로 필터·50000명/상세50+JEV450 미리보기가 복구됐으며, 사용자가 선택한 연령 조건의15705명 미리보기도 확인됐다. 사용자 입력·선택을 초기화하거나 새 분석을 시작하지 않았다.

원본은 현재 고정 합성 데이터셋이다. 관리자가 원본을 추가·수정·삭제한 뒤에는 아래 갱신도 수행해야 필터 스냅샷이 반영된다. 사용자용 갱신 API/추가 관리 키는 없다. UNIQUE id 인덱스가 있으므로 이미 채운 캐시는 동시 조회를 유지하며 갱신할 수 있다. [PostgreSQL REFRESH](https://www.postgresql.org/docs/17/sql-refreshmaterializedview.html)를 따른다.

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY app_private.persona_filter_cache;
```

## 모순·일정 부분 결과 저장 · 2026-11-02

`complete_analysis`는 coverage=partial이면 기존 proposed를 보존하고 같은 제목·원문 표현·근거 배열의 후보를 중복 추가하지 않는다. complete/과거 metadata는 기존처럼 proposed를 교체한다. confirmed는 항상 보존하며 작업 완료의 멱등성·근거 소유권·INVOKER·빈 search_path·기존 권한을 유지한다. 신규 컬럼/정책은 없다. 일정 추정은 analysis_jobs.result.items[].suggestion에 저장하고 schedules.item_index로 연결한다. 모순 제목도 result JSON에 저장한다.

로컬 Supabase CLI3.0.0으로 생성한 `20261102140934_analysis_resilience.sql`은 원격 `20261102141515_analysis_resilience`로 적용됐다. 기존 파일 이동이나 원격 이력 수정은 하지 않았다. 격리 PGlite와 원격 롤백 테스트에서 후보 보존/중복/전체 재분석 교체·확정 일정·제목/추정 JSON·멱등성·INVOKER/anon 차단을 검증했다. 원격은 기존 소유자 ID를 SQL 내부에서만 재사용해 합성 대화를 만들고 모두 롤백했으며 합성 대화 잔존0건이다. 새 Auth 계정·실제 대화 본문·토큰은 만들거나 읽지 않았다. 보안 advisor 신규 지적은 없고 기존 원본 정책 없음 INFO·유출 비밀번호 보호 WARN만 유지한다.

## 현재 페르소나 조회 연결 · 2026-11-02

5만 원본을 유지하고 기본6종·고급5종 필터와 사용자 JWT 조회 API를 구현했다. 아래 과거의 신규 SQL 미적용·서버 키 필요·이름 부재 기록은 이전 상태다. 현재 `PersonasModule`은 `public.query_persona_data(conversation UUID, action text, filters JSONB={}, options JSONB={})`를 호출하며 service_role/관리자 키를 사용하지 않는다. [HTTP 계약](../backend/api.md)을 따른다.

| 객체 | 현재 권한·역할 |
| --- | --- |
| `persona_data.korean_personas` | 기존50000건·RLS 유지, anon/authenticated 직접 읽기 불가 |
| `app_private.persona_filter_rows` | 필터 전용 캐시를 읽는 INVOKER view, 일반 역할 직접 읽기 불가 |
| `app_private.persona_filter_cache` | UUID·나이·11종 정규화 특성의 비공개 스냅샷. 본문/details 전체는 저장하지 않으며 관리자 원본 변경 후 refresh 필요 |
| `app_private.query_persona_data` | 빈 search_path의 제한된 DEFINER. auth.uid 비어 있음/대화 소유자 불일치 시42501. 허용 action·filter·option·길이·상한 검증 후 정적 SQL 조회 |
| `public.query_persona_data` | INVOKER wrapper, PUBLIC/anon 실행 취소·authenticated 실행만 허용 |
| `public.persona_debates` | 문서·revision·상태·결과 저장. 본인 RLS·소유권 복합FK·중복 활성 작업 차단 |

`facets`는 원본 범주·직업 검색50개·선택 시도의 시군구를 반환한다. `count`는 수만 계산하고 본문은 반환하지 않는다. `browse`는 UUID 순서 최대50개, `sample`은 MD5(seed:uuid) 순서 최대200개다. SQL에 입력 문자열을 연결하지 않는다. 이름은 본문 `^([가-힣]{2,6}) 씨`에서 추출하며 원본5만 건에서 확인했다. 소득/취미/국적 필터는 제공하지 않는다. private schema USAGE와 해당 함수 EXECUTE 외에는 추가 원본 권한을 주지 않았고 기존 private 프로필 함수의 접근 제한을 유지했다.

| 로컬 SQL | 실제 원격 적용 버전 |
| --- | --- |
| `20261102002606_persona_debates.sql` | `20261102050901_persona_debates` |
| `20261102004905_debate_documents.sql` | `20261102050921_debate_documents` |
| `20261102045839_persona_query_api.sql` | `20261102050929_persona_query_api` |
| `20261102150331_persona_filter_cache.sql` | `20261102150613_persona_filter_cache` |

MCP apply_migration의 자동 버전으로 기록됐다. 로컬 파일 이동·원격 이력 덮어쓰기는 하지 않았다. 이 문서에 적용 완료로 기록한 SQL을 `db push`로 다시 적용하면 안 된다. 기존 분석/일정 SQL의 버전 차이도 있으므로 CLI 배포 전 이력 대응을 별도 검토한다.

격리 PGlite에서 `tests/personas.sql`의11종·AND/OR·동일 seed·500개/페이지 중복·원본 이름·직업 문자 그대로 검색·시군구 범위·입력 검증·권한을 통과했다. 원격은 기존 대화 소유자 ID를 SQL 트랜잭션 내부에서만 JWT claim에 넣고 authenticated 역할로 실행했다. 50000/445/9 및500명 고유성·재현·시도17·직업 검색·타인/비로그인/직접 접근 차단을 검증 후 롤백했다. 개인 대화 본문·토큰은 읽거나 출력하지 않았고 테스트 계정/행을 만들지 않았다. 실제 브라우저 OAuth→HTTP→DB 전 구간은 미실행이다.

보안 advisor의 신규 지적 없음. 기존 원본 RLS 정책 없음 INFO와 Auth 유출 비밀번호 보호 비활성 WARN 유지. 성능 advisor는 미사용 인덱스 INFO만 있으며 신규 FK/보안 문제는 없다. [RLS 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [기존 Auth 설정 안내](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## 필터 후보 실측 검토 · 2026-11-02 (구현 전 기록)

사용자 요청으로 전체5만 건의 범주·빈 값·details 타입·조합별 건수를 읽기 전용으로 확인했다. 제안한 기본6종·고급5종은 위 현재 구현에 반영했다. [분포·제안·매핑 문제](persona-filters.md)를 참조한다.

주요 발견: 직업2,120종 중2,008종은50명 미만, 혼인4·학력7·가족39·주거6범주. 소득 없음, 국가 고정. 취미/기술 목록은 모두 실제 JSON 배열이 아닌 문자열이다. 별도 이름 컬럼은 없으나 본문에 합성 이름이 있어 이전 이름 부재 안내를 정정했다. 현재 지도 별칭이 받지 못하는 지역 원문5개도 확인했으며 수정은 후속 작업이다.

## 프로젝트 재활성화 후 조회 확인 · 2026-11-02

사용자가 무료 프로젝트를 재활성화한 후 MCP로 `ACTIVE_HEALTHY`와 실제 조회 성공을 확인했다. 페르소나50,000건·시도17개, 서울 거주 여성4,660명, 해당 조건에서 seed 정렬 후 최대500명 선택 조회가 성공했다. 개인 대화·인증 사용자 데이터는 조회하지 않았다.

`public.persona_debates`, `persona_debate_facets()`, `sample_debate_personas(jsonb,text,boolean)`는 아직 없다. 로컬 `.env`에는 공개 Supabase 설정만 있고 `SUPABASE_PERSONA_SECRET_KEY`가 없다. 관리 연결을 통한 원본 조회 성공과 앱의 RPC 연동 완료를 구분한다. 이번 재연결은 읽기 전용이며 신규 SQL 적용·권한 변경·키 생성은 하지 않았다. 아래 원격 접근 실패 기록은 재활성화 이전 상태다.

## 검토 문서와 분석별 기록 추가 · 2026-11-02

CLI로 생성한 `20261102004905_debate_documents.sql`을 앞선 persona_debates SQL 뒤에 적용한다. 로컬 준비만 했으며 원격 적용은 대기다. 기존 결과·RLS·FK·활성 작업 인덱스를 유지한다.

| 추가/변경 | 내용 |
| --- | --- |
| document | nullable JSONB 객체. 질문·맥락·쟁점·예상 찬반 논리·실제 발언 근거 |
| revision | 0 이상 integer, 문서 생성 완료1, 수정 시 증가. 수정과 실행의 WHERE 조건으로 동시 변경 차단 |
| speaker_ids | 최대400개 JSONB 배열, 초기 문서 조사에 포함할 실제 대화 참여자 ID |
| review 상태·stage | 문서 검토 대기. document non-null·revision>0 제약. 아직 활성 추론 작업이 아니므로 진행 중 인덱스에 포함하지 않음 |

사용자 토큰으로 owner_id/id/status/revision을 동시에 조건화해 수정·실행을 원자적으로 선점한다. 임시 PostgreSQL에서 문서 없는 review 거절·버전 비교 수정·이전 버전 덮어쓰기0건·중복 실행0건·기존 RLS/FK/연쇄 삭제 검증을 통과했다.

## 페르소나 논쟁 SQL · 2026-11-02

로컬 `20261102002606_persona_debates.sql`은 Supabase CLI `migration new`로 생성했다. 원격 조회3회 실패로 아직 적용하지 않았다.

| 대상 | 계약 |
| --- | --- |
| public.persona_debates | UUID PK, conversation_id/owner_id 복합 FK·연쇄 삭제, input/filters, pending/processing/completed/failed, stage, processed/selected(0~500), error_code, result JSONB, created_at/updated_at |
| 소유권 | authenticated 본인 SELECT/INSERT/UPDATE/DELETE, USING+WITH CHECK. anon/PUBLIC 권한 없음. 대화별 활성 작업1개 partial unique index |
| public.persona_debate_facets() | SECURITY INVOKER, 빈 search_path, service_role만 실행. 실제 필터 값 반환 |
| public.sample_debate_personas(jsonb,text,boolean=false) | SECURITY INVOKER, 빈 search_path, service_role만 실행. 조건 먼저 적용·seed 순서의 최대500명·전체 일치 수 반환. 미리보기는 원본 본문을 조회하지 않음 |
| persona_data.korean_personas | 기존 일반 사용자 차단·RLS 유지. service_role에 스키마 USAGE·테이블 SELECT 부여. 사용자 데이터 접근에는 이 역할을 사용하지 않음 |

기존 원본 필드에는 소득이 없어 미상이다. 검증된 `details.income_decile` 1~10을 추후 적재할 경우에만 분위로 분류한다. 별도 테이블에 전체 원본 페르소나 본문을 복사하지 않고 응답의 기본 특성만 저장한다. [흐름·제약](../AI/persona-debates.md)을 따른다.

PGlite 0.5.14의 격리 PostgreSQL에서 기존 페르소나 SQL·대화 FK 선행 구조·신규 SQL과 `tests/persona-debates.sql`을 실행했다. 표본 재현·500명 상한·중복 없음·AND/OR·소득 미상/분위·빈 결과·서버 전용 RPC·타인 차단·소유자 변경 차단·복합FK·중복 활성 작업·연쇄 삭제와 롤백을 통과했다. 실제 Supabase Auth/PostgREST 검증은 미실행이다.

## 최신 분석·일정 저장 · 2026-10-03

`analysis_jobs`, `schedules`와 SECURITY INVOKER `complete_analysis`를 실제 프로젝트에 적용했다. 사용자 RLS·복합 FK·완료/후보 원자적 저장·근거 검증·대화 연쇄 삭제를 확인했다. [컬럼·제약·로컬/원격 마이그레이션 버전 매핑](../AI/analysis-flow.md#db)을 따른다. 신규 보안·FK 인덱스 지적 없음. 이전 미구현 분석 표는 설계 기록이다.

## 공식 문서 우선 조회

- [Supabase 공식 문서](https://supabase.com/docs): Database·Auth·Storage, RLS·권한, 클라이언트·CLI 문서를 확인한다.
- DB 기술을 조사할 때 위 공식 문서에서 해당 제품과 주제를 먼저 확인한다. 연결된 Supabase 문서 검색 도구가 있으면 공식 문서 범위에서 검색하고 원문을 확인한다.
- 기능 구현·설정 변경 전 공식 변경 이력과 사용하는 SDK·CLI 버전의 호환성을 확인한다. 자료가 부족하면 Context7와 Supabase 공식 저장소의 이슈·릴리스로 보완한다. PostgreSQL 자체 기능은 PostgreSQL 공식 문서도 확인한다.

Supabase Auth·PostgreSQL·비공개 Storage를 사용한다. **페르소나·프로필·대화·참여자·메시지와 비공개 원본 버킷을 원격에 구현했다. 분석·일정은 개념 설계 단계다.** 아래 2026-10-01 원격 표는 당시 기록이며 대화 관련 최신 계약은 이 문서의 2026-10-03 절을 따른다.

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

## 대화·Storage 실제 계약 · 2026-10-03

원격 마이그레이션 `20261002200045_conversation_storage`, `20261002201431_conversation_fk_indexes`를 적용했다. CLI로 신규 파일을 만든 뒤 이번 작업에서 생성한 두 파일 이름만 원격 기록에 맞췄다. 원격 이력의 버전 직접 수정은 자동 승인 검토에서 거절되어 실행되지 않았다.

| 테이블 | 주요 필드·관계 |
| --- | --- |
| conversations | UUID id·Auth owner_id, 제목, source_path·SHA-256, parser_version=kakao-v1, warnings JSONB, message_count, start_date/end_date, created_at |
| participants | UUID id, conversation_id·owner_id 복합 FK, name, color_index(0~399); 대화별 이름·색 인덱스 유일 |
| messages | UUID id, conversation_id·owner_id 복합 FK, participant_id·conversation_id·owner_id 복합 FK, sequence, message_date/date·message_time/time, body, kind, 생성 character_count |
| conversation-originals | 비공개 Storage 버킷, 10MiB 제한, text/plain. `<owner>/<conversation>/original.txt` |

대화 삭제 시 참여자·메시지는 연쇄 삭제된다. 메시지 순서는 대화별 유일하며 시스템만 participant_id=null을 허용한다. 같은 이름은 같은 참여자로 처리한다. source_path는 소유자·대화 UUID와 반드시 일치한다. 각 공개 테이블의 RLS는 `(select auth.uid())=owner_id`를 USING·WITH CHECK에 적용한다. anon/PUBLIC 접근은 회수하고 authenticated에 필요한 CRUD 권한을 부여한다. 하위 소유자·참여자 FK가 다른 대화나 소유자 혼합을 막는다.

Storage SELECT/INSERT/DELETE 정책은 비공개 버킷과 경로의 첫 폴더가 인증 사용자 ID인 경우만 허용한다. 원본은 덮어쓰지 않으며 같은 파일의 실패 재시도는 서버가 바이트 비교 후 재사용한다. 공개 URL·서버 비밀 키·서비스 역할 우회는 사용하지 않는다. 계정 삭제 API와 Storage 자동 고아 파일 정리 작업은 아직 없다.

`import_conversation`은 SECURITY INVOKER·빈 search_path·인증 사용자 실행 권한이며 구조화 데이터를 한 트랜잭션으로 저장한다. `conversation_statistics`도 INVOKER로 실행해 RLS를 유지한다. 날짜·시각은 내보내기 파일의 한국 시간 표기를 보존한다. character_count는 공백 제거 후 char_length로 생성한다. 날짜/참여자 필터·시간대/캐릭터 정의는 backend/api.md를 따른다.

목록 조회용 `(owner_id,created_at,id)`, 원문용 대화·날짜·순서 및 참여자·날짜 인덱스를 추가했다. advisor가 지적한 복합 FK용 인덱스 3개도 추가했으며 재점검에서 신규 외래 키 지적은 0개다. 기존 페르소나의 정책 없음·미사용 인덱스 INFO와 Auth 유출 비밀번호 보호 비활성 WARN은 이 작업과 별개이며 변경하지 않았다.

`supabase/tests/conversations.sql`을 실제 DB에서 실행해 합성 Auth 사용자 둘·대화·메시지의 import, 문자·단답·질문·야간·날짜/참여자 집계, 빈 날짜 0개, 빈 결과, 타인 SELECT/DELETE 차단, 소유자 변경 차단, 연쇄 삭제를 검증하고 롤백했다. 테스트 계정 잔존 0건이다. 실제 Storage API 업로드·다운로드 전체 검증은 미실행이다.

## 일정 종료 시각 · 2026-10-03

`schedules.ends_at`은 nullable timestamptz다. DB CHECK는 종료 시각이 있으면 starts_at이 있고 ends_at > starts_at임을 강제한다. RLS와 기존 완료 RPC는 유지한다. 로컬 `20261003124739_schedule_end_time.sql`은 원격 MCP 이력 `20261003124914_schedule_end_time`으로 적용됐다. 상대 날짜 제안은 근거 메시지 조회 시 계산하며 DB에 자동 확정하지 않는다. 실제 SQL 테스트에서 정상 종료 저장과 역전 제약 거절을 확인했다.
