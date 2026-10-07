# 한국 페르소나 5만 레코드 적재 결과

2026-10-01에 사용자 요청으로 `fthzjaeucyiudbjxmlgu` 프로젝트의 `persona_data.korean_personas`에 50,000개 레코드를 적재했다. 원본의 26개 필드를 보존하고 선택 이력을 추가했다. 서비스 API·AI 서버 연동은 아직 하지 않았다.

## 출처와 재현

원본은 NVIDIA의 [Nemotron-Personas-Korea](https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea)이며 CC BY 4.0 합성 데이터다. 원본 커밋은 `ada0f5b53a38bb5a30cce09358adde883c1ab63a`, 난수 시드는 `20261001`이다. 파생 작업은 표본 추출, 연령대 추가, 저장 구조 변경이다. 실제 인물·여론을 나타내지 않으며 미성년자 페르소나는 포함하지 않는다.

| 구분 | 실제 적용 |
| --- | --- |
| 원본 | Parquet 9개, 1,000,000 레코드; 다운로드 1,982,395,106바이트 |
| 유효 레코드 | UUID·나이·성별·시도·요약 필수값이 있는 성인 1,000,000개 |
| 기본 표본 | 40,000개; 연령대 × 성별 × 시도 204개 층의 원본 비율에 비례 배정 |
| 연령대 | 19~29, 30~39, 40~49, 50~59, 60~69, 70세 이상 |
| 층 내부 선택 | 시드와 UUID의 SHA-256 순위를 이용한 재현 가능한 선택 |
| 보충 표본 | 10,000개; 혼인 상태·가족 형태·직업·학력·시군구 원본 범주의 부족분을 우선 보충 |
| 보충 목표 | 범주별 50명을 목표로 부족분이 큰 후보를 우선 선택; 원본 인원과 전체 10,000개 예산 때문에 모든 범주에서 50명을 보장하지 않음 |
| 분류 원칙 | 검증되지 않은 직업·가족 대분류나 성격·입장 태그를 추정하지 않고 원본 값을 사용 |
| 잔여 보충 | 부족 범주 보충 이후 자리가 남으면 미선정 레코드의 무작위 표본으로 채움 |

## 저장 구조와 접근

| 필드 | 저장 방식 |
| --- | --- |
| uuid | 원본 32자리 문자열, 기본 키 |
| age | smallint, 19세 이상 제약 |
| sex, province, district, occupation, marital_status, family_type, education_level, persona | 원본 값을 독립 컬럼으로 보존 |
| details | 나머지 원본 16개 필드의 JSONB; 문자열로 제공된 목록도 원본 문자열 그대로 보존 |
| age_group, sample_group, sample_reasons | 추출 연령대, base/supplement, 보충 사유 |
| source_revision, sample_seed | 원본 커밋과 시드 |

원격 마이그레이션은 `20261001023358_create_korean_persona_sample`이다. 로컬 마이그레이션 파일은 아직 없다. 실제 컬럼·제약·권한·파일 변경점은 [DB 스키마와 원격 상태](schema.md)를 참조한다. UUID 기본 키 외에 `(age_group, sex, province)`, `(marital_status, family_type)`, `(occupation)` 인덱스를 구성했다.

`persona_data`는 비공개 스키마이며 `anon`·`authenticated`의 스키마와 테이블 권한을 차단했다. RLS를 활성화했고 일반 사용자 허용 정책은 없다. 브라우저 직접 조회는 불가능하며, 후속 작업에서 NestJS의 제한된 읽기 역할을 구성해야 한다. 임시 적재 역할과 정책은 업로드 종료 후 제거했고 로컬 임시 비밀번호도 지웠다.

## 실제 용량

아래는 적재와 ANALYZE 완료 후 PostgreSQL 크기 함수를 사용한 실측이다. MB는 1,000,000바이트, MiB는 1,048,576바이트 기준이다. 임베딩·생성 응답은 포함하지 않는다.

| 항목 | 바이트 | MB |
| --- | ---: | ---: |
| 로컬 표본 JSONL | 237,197,094 | 237.20 |
| DB 본문·TOAST·관련 저장 영역 | 167,010,304 | 167.01 |
| 인덱스 전체 | 5,496,832 | 5.50 |
| **테이블 총합** | **172,507,136** | **172.51** |
| 측정 시점 프로젝트 DB 전체 | 183,465,651 | 183.47 |

테이블 총합은 약 164.52MiB이며 PostgreSQL의 반올림 표시는 `165 MB`다. DB 전체에는 시스템 테이블 등도 포함된다. Storage에는 업로드하지 않았다. 원본과 로컬 표본은 Git에서 제외되는 `.tmp/persona-sample/`에 있다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| 레코드·고유 UUID | 모두 50,000개 |
| 기본·보충 | 40,000 / 10,000개 |
| 지역 | 17개 시도, 252개 시군구 |
| 가족 형태·직업 | 39개 가족 형태, 2,120개 직업 값 |
| UUID 목록 체크섬 | 로컬·DB 모두 `4c2013ed0fcfb47daef57c805abdad6c` |
| 전체 내용 체크섬 | 로컬·DB 모두 `689dbcab8f9246ab92a88df450445f1f`; 원본 26개 필드와 추출 메타데이터를 행별 PostgreSQL JSONB 정규 형태로 비교 |
| JSONL SHA-256 | `154a7487d2c37ee5d574c69fdef3fae8fef12c478432aab15ddca98e385513f5` |
| 권한 | RLS 활성화, anon/authenticated SELECT 불가, 임시 역할 잔존 0 |
| Python 구문 | 추출·전송·적재 스크립트 AST 파싱 통과 |

보안 Advisor의 [RLS Enabled No Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)는 일반 사용자 접근을 허용하지 않는 현재 설정에 대한 정보 항목이다.

## 실행 파일

- `scripts/sample_personas.py`: 원본 다운로드, 층화·보충 추출, 배치·manifest 생성.
- `scripts/import_personas.py`: 임시 SCRAM 접속 정보 생성, 제한된 DB 역할로 적재. 역할·권한 생성과 종료 후 제거는 관리자가 별도로 수행해야 한다.
- `scripts/read_persona_batch.py`: MCP 전송 시 압축 배치 읽기. 큰 MCP SQL 호출은 중단되어 실제 적재에는 직접 Session pooler 연결을 사용했다.
- `scripts/persona-requirements.txt`: pyarrow 25.0.1, psycopg[binary] 3.3.3 버전 고정.

단순 일괄 처리 함수와 단계를 분리했다. 추가 디자인 패턴이나 클래스는 도입하지 않았다.

## 원격 상태 재확인

2026-10-01 문서 갱신 시 관리 API·DB 카탈로그로 프로젝트 ACTIVE_HEALTHY, 50,000개 레코드, 인덱스 포함 172,507,136바이트를 재확인했다. public·persona_data의 애플리케이션 테이블은 페르소나 테이블 1개, 원격 마이그레이션은 1개, Storage 버킷은 0개다. RLS 활성화·정책 0개·anon/authenticated SELECT 불가·임시 적재 역할 잔존 0개도 재확인했다. 이번 작업은 문서만 수정했고 원격 스키마·데이터는 변경하지 않았다.
