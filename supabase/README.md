# Supabase 스키마와 검증

대상 프로젝트는 `fthzjaeucyiudbjxmlgu`다. DB 변경은 로컬 SQL과 원격 마이그레이션 이력을 함께 관리한다.

| 마이그레이션 | 상태 |
| --- | --- |
| 20261001023358_create_korean_persona_sample | 기존 원격 SQL을 그대로 로컬 복원; 재적용하지 않음 |
| 20261001050936_create_user_profiles | 원격 적용 완료; 로컬 SQL과 동일 |
| 20261002200045_conversation_storage | 대화·참여자·메시지, RLS, 원자적 import·통계 함수, 비공개 버킷 |
| 20261002201431_conversation_fk_indexes | 복합 외래 키 인덱스 3개, 날짜별 활동의 빈 날짜 0개 집계 |

신규 사용자 마이그레이션은 Supabase CLI `migration new create_user_profiles`로 생성했다. 원격 적용 시 관리 도구가 기록한 버전으로 이번에 생성한 파일명을 맞춰 이력 중복을 방지했다. 기존 사용자 파일·폴더를 이동하지 않았다. 페르소나 마이그레이션은 이미 존재하던 원격 이력의 복사본이다. 마이그레이션은 스키마만 복원하며 페르소나 데이터 5만 건은 별도 적재 산출물이다.

`tests/profiles.sql`은 관리자 SQL 연결로 실행하는 롤백 검증 스크립트다. 운영 사용자 대신 합성 Auth 사용자 두 명을 생성하고 RLS·컬럼 권한·가입과 수정 트리거·제약·연쇄 삭제를 확인한다. 실패 시 연결을 롤백하고 성공 시 스크립트의 ROLLBACK으로 모든 데이터를 제거한다. 실행하려면 Auth 테스트 행 생성 및 SET ROLE 권한이 필요하며 API 사용자 권한으로 실행하지 않는다.

원격 적용·검증은 Supabase MCP를 사용했다. 로컬 Docker DB reset·db push는 실행하지 않았다. CLI로 향후 동기화할 때는 연결 프로젝트와 원격 이력을 먼저 확인하며 이미 적용된 마이그레이션을 수동 재실행하지 않는다.

`tests/conversations.sql`도 합성 사용자·대화·참여자·메시지를 한 트랜잭션에서 생성하고 통계·RLS·연쇄 삭제를 확인한 뒤 롤백한다. Storage 객체를 SQL로 직접 삽입·삭제하지 않는다. 원본 파일의 생명주기는 Storage API를 사용한다. 테스트용 지속적 Auth 사용자 생성은 자동 승인 검토에서 거절되었으며 테스트 계정은 생성하지 않았다.

실제 구조와 권한은 [DB 스키마](../.agents/database/schema.md#사용자-프로필-실제-계약--2026-10-01), HTTP 계약은 [사용자 API](../.agents/backend/api.md#사용자-api-계약--2026-10-01)를 참조한다.
