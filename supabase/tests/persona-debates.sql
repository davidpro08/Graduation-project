-- 격리된 검증 DB에서 실행. 모든 합성 행은 끝에서 롤백한다.
begin;
select set_config('test.user_a',gen_random_uuid()::text,true), set_config('test.user_b',gen_random_uuid()::text,true),
  set_config('test.chat_a',gen_random_uuid()::text,true), set_config('test.chat_b',gen_random_uuid()::text,true);
insert into auth.users(id) values (current_setting('test.user_a')::uuid),(current_setting('test.user_b')::uuid);
insert into public.conversations(id,owner_id,title,source_path,source_hash,message_count,start_date,end_date)
select current_setting('test.chat_'||v)::uuid,current_setting('test.user_'||v)::uuid,'합성 검증',
  current_setting('test.user_'||v)||'/'||current_setting('test.chat_'||v)||'/original.txt',repeat('0',64),1,'2026-11-02','2026-11-02' from unnest(array['a','b']) v;
insert into persona_data.korean_personas(uuid,age,age_group,sex,province,occupation,education_level,persona,details,sample_group,sample_reasons)
select md5('persona-debate-test-'||i),30,'30-39',case when i%2=0 then '남성' else '여성' end,
  case when i%2=0 then '경기도' else '서울특별시' end,'__persona_debate_test__','대학교 졸업','합성 테스트 페르소나',
  case when i%3=0 then '{"income_decile":1}'::jsonb when i%3=1 then '{"income_decile":10}'::jsonb else '{}'::jsonb end,'base','[]'::jsonb
from generate_series(1,600) i;
set local role service_role;
do $$
declare sample jsonb; again jsonb; filtered jsonb;
begin
  sample := public.sample_debate_personas('{"occupation":["__persona_debate_test__"]}', 'test-seed');
  again := public.sample_debate_personas('{"occupation":["__persona_debate_test__"]}', 'test-seed');
  if sample <> again then raise exception '동일 seed 재현 실패'; end if;
  filtered := public.sample_debate_personas('{"occupation":["__persona_debate_test__"]}', 'test-seed', true);
  if (filtered->>'eligible')::int <> 600 or jsonb_array_length(filtered->'personas') <> 0 then raise exception '미리보기 본문 제외 실패'; end if;
  if (sample->>'eligible')::int <> 600 or jsonb_array_length(sample->'personas') <> 500 then raise exception '500명 상한 실패'; end if;
  if (select count(distinct p->>'id') from jsonb_array_elements(sample->'personas') p) <> 500 then raise exception '표본 중복'; end if;
  filtered := public.sample_debate_personas('{"occupation":["__persona_debate_test__"],"sex":["여성"],"province":["서울특별시"]}', 'test-seed');
  if (filtered->>'eligible')::int <> 300 or jsonb_array_length(filtered->'personas') <> 300 then raise exception 'AND 필터 실패'; end if;
  filtered := public.sample_debate_personas('{"occupation":["__persona_debate_test__"],"sex":["여성","남성"]}', 'test-seed');
  if (filtered->>'eligible')::int <> 600 then raise exception 'OR 필터 실패'; end if;
  filtered := public.sample_debate_personas('{"occupation":["__persona_debate_test__"],"income":["1분위"]}', 'test-seed');
  if (filtered->>'eligible')::int <> 200 then raise exception '소득 분위 필터 실패'; end if;
  filtered := public.sample_debate_personas('{"occupation":["__persona_debate_test__"],"income":["미상"]}', 'test-seed');
  if (filtered->>'eligible')::int <> 200 then raise exception '소득 미상 필터 실패'; end if;
  filtered := public.sample_debate_personas('{"occupation":["__persona_debate_no_matches__"]}', 'test-seed');
  if filtered <> '{"eligible":0,"personas":[]}'::jsonb then raise exception '빈 결과 실패'; end if;
  if not (public.persona_debate_facets()->'occupation' ? '__persona_debate_test__') then raise exception '선택지 조회 실패'; end if;
end $$;
reset role;
insert into public.persona_debates(id,owner_id,conversation_id,input)
select gen_random_uuid(),current_setting('test.user_'||v)::uuid,current_setting('test.chat_'||v)::uuid,'합성 논쟁' from unnest(array['a','b']) v;
do $$ begin
  begin
    insert into public.persona_debates(id,owner_id,conversation_id,input) values(gen_random_uuid(),current_setting('test.user_a')::uuid,current_setting('test.chat_b')::uuid,'타인 대화');
    raise exception '소유권 복합 FK 허용됨';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.persona_debates(id,owner_id,conversation_id,input) values(gen_random_uuid(),current_setting('test.user_a')::uuid,current_setting('test.chat_a')::uuid,'중복 작업');
    raise exception '중복 활성 작업 허용됨';
  exception when unique_violation then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.user_a'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare affected integer; begin
  if (select count(*) from public.persona_debates) <> 1 then raise exception '본인 작업 RLS 실패'; end if;
  update public.persona_debates set input='변조' where owner_id=current_setting('test.user_b')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception '타인 작업 수정 허용됨'; end if;
  begin
    perform public.sample_debate_personas('{}','test'); raise exception '일반 사용자 표본 RPC 허용됨';
  exception when insufficient_privilege then null; end;
  begin
    perform public.persona_debate_facets(); raise exception '일반 사용자 선택지 RPC 허용됨';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from persona_data.korean_personas; raise exception '일반 사용자 원본 조회 허용됨';
  exception when insufficient_privilege then null; end;
  begin
    update public.persona_debates set owner_id=current_setting('test.user_b')::uuid;
    raise exception '소유자 변경 허용됨';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.persona_debates; raise exception 'anon 작업 조회 허용됨'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare affected integer; begin
  begin
    update public.persona_debates set status='review',stage='review' where owner_id=current_setting('test.user_b')::uuid;
    raise exception '문서 없는 검토 상태 허용됨';
  exception when check_violation then null; end;
  update public.persona_debates set status='review',stage='review',document='{"question":"검토할 쟁점"}',revision=1 where owner_id=current_setting('test.user_b')::uuid;
  update public.persona_debates set document='{"question":"수정한 쟁점"}',revision=2 where owner_id=current_setting('test.user_b')::uuid and status='review' and revision=1;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception '문서 버전 수정 실패'; end if;
  update public.persona_debates set document='{}',revision=2 where owner_id=current_setting('test.user_b')::uuid and status='review' and revision=1;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception '이전 버전 문서 덮어쓰기 허용됨'; end if;
  update public.persona_debates set status='processing',stage='sampling' where owner_id=current_setting('test.user_b')::uuid and status='review' and revision=2;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception '문서 확정 실패'; end if;
  update public.persona_debates set status='processing',stage='sampling' where owner_id=current_setting('test.user_b')::uuid and status='review' and revision=2;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception '중복 실행 허용됨'; end if;
end $$;
delete from public.conversations where id=current_setting('test.chat_a')::uuid;
do $$ begin
  if exists(select 1 from public.persona_debates where owner_id=current_setting('test.user_a')::uuid) then raise exception '대화 연쇄 삭제 실패'; end if;
end $$;
rollback;
