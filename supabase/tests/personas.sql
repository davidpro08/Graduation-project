-- 격리 검증 DB 전용. 사용자·대화·합성 페르소나는 모두 롤백한다.
begin;
select set_config('test.user',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),set_config('test.chat',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.user')::uuid);
insert into public.conversations(id,owner_id,title,source_path,source_hash,message_count,start_date,end_date)
values(current_setting('test.chat')::uuid,current_setting('test.user')::uuid,'API 검증',current_setting('test.user')||'/'||current_setting('test.chat')||'/original.txt',repeat('0',64),1,'2026-11-02','2026-11-02');
insert into persona_data.korean_personas(uuid,age,age_group,sex,province,district,education_level,marital_status,family_type,occupation,persona,details,sample_group,sample_reasons)
select md5('persona-api-'||i),30,'30-39',case when i%2=0 then '여자' else '남자' end,
  case when i%2=0 then '서울' else '경상남' end,case when i%2=0 then '서울-강서구' else '경상남-김해시' end,
  '4년제 대학교','배우자있음','배우자와 거주',case when i=600 then '특수%_직업' else '합성직업'||lpad((i%60)::text,2,'0') end,
  '김가람 씨는 합성 검증 페르소나입니다.','{"bachelors_field":"공학","housing_type":"아파트","military_status":"비현역"}', 'base','[]'
from generate_series(1,600) i;
refresh materialized view app_private.persona_filter_cache;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare allrows jsonb; sample jsonb; v jsonb; f jsonb; entry record; invalid jsonb; begin
  allrows := public.query_persona_data(current_setting('test.chat')::uuid,'count');
  if allrows <> '{"eligible":600,"personas":[]}'::jsonb then raise exception 'count 본문 제외/전체 수 실패'; end if;
  sample := public.query_persona_data(current_setting('test.chat')::uuid,'sample','{}','{"seed":"same"}');
  if jsonb_array_length(sample->'personas')<>200 or (select count(distinct x->>'id') from jsonb_array_elements(sample->'personas') x)<>200 then raise exception '200명/중복 실패'; end if;
  if sample <> public.query_persona_data(current_setting('test.chat')::uuid,'sample','{}','{"seed":"same"}') then raise exception '동일 seed 재현 실패'; end if;
  if sample = public.query_persona_data(current_setting('test.chat')::uuid,'sample','{}','{"seed":"different"}') then raise exception 'seed 다양성 실패'; end if;
  v := sample->'personas'->0;
  if v->>'name'<>'김가람' or not v ? 'persona' or not v ?& array['maritalStatus','familyType','district','bachelorsField','housingType','militaryStatus'] or v ? 'income' then raise exception '프로필·이름·원본 차원 실패'; end if;
  for entry in select key,value from jsonb_each(v - array['id','age','name','persona']) loop
    f := jsonb_build_object(entry.key,jsonb_build_array(entry.value));
    if (public.query_persona_data(current_setting('test.chat')::uuid,'count',f)->>'eligible')::int<1 then raise exception '차원 필터 실패: %',entry.key; end if;
  end loop;
  v := public.query_persona_data(current_setting('test.chat')::uuid,'count','{"sex":["여자"],"province":["서울"],"maritalStatus":["배우자있음"]}');
  if (v->>'eligible')::int<>300 then raise exception 'AND 실패'; end if;
  if (public.query_persona_data(current_setting('test.chat')::uuid,'count','{"sex":["여자","남자"]}')->>'eligible')::int<>600 then raise exception 'OR 실패'; end if;
  if public.query_persona_data(current_setting('test.chat')::uuid,'count','{"province":["없는 지역"]}')<>'{"eligible":0,"personas":[]}'::jsonb then raise exception '빈 결과 실패'; end if;
  v := public.query_persona_data(current_setting('test.chat')::uuid,'browse','{}','{"page":1,"pageSize":50}');
  if jsonb_array_length(v->'items')<>50 or (v->>'total')::int<>600 then raise exception '목록 페이지 실패'; end if;
  if exists(select 1 from jsonb_array_elements(v->'items') a join jsonb_array_elements(public.query_persona_data(current_setting('test.chat')::uuid,'browse','{}','{"page":2,"pageSize":50}')->'items') b on a->>'id'=b->>'id') then raise exception '페이지 중복'; end if;
  v := public.query_persona_data(current_setting('test.chat')::uuid,'facets','{}','{"province":["경상남"]}');
  if v->'values'->'district'<>'["경상남-김해시"]'::jsonb or jsonb_array_length(v->'values'->'occupation')<>50 or (v->'occupation'->>'total')::int<>61 then raise exception '시군구/직업 페이지 실패'; end if;
  v := public.query_persona_data(current_setting('test.chat')::uuid,'facets','{}','{"occupationSearch":"%_"}');
  if v->'values'->'occupation'<>'["특수%_직업"]'::jsonb or v->'values'->'district'<>'[]'::jsonb then raise exception '직업 리터럴 검색/시도 미선택 실패'; end if;
  foreach invalid in array array['{"income":["미상"]}'::jsonb,'{"sex":null}','{"sex":"여자"}','{"sex":[1]}','{"sex":["여자","여자"]}','{"sex":[""]}'] loop
    begin perform public.query_persona_data(current_setting('test.chat')::uuid,'sample',invalid); raise exception '잘못된 필터 통과: %',invalid; exception when invalid_parameter_value then null; end;
  end loop;
  foreach invalid in array array['{"page":0}'::jsonb,'{"pageSize":51}','{"page":"1"}','{"seed":null}','{"occupationSearch":12}','{"unknown":true}','{"province":null}'] loop
    begin perform public.query_persona_data(current_setting('test.chat')::uuid,'browse','{}',invalid); raise exception '잘못된 옵션 통과: %',invalid; exception when invalid_parameter_value then null; end;
  end loop;
  begin perform public.query_persona_data(gen_random_uuid(),'count'); raise exception '다른 대화 접근'; exception when insufficient_privilege then null; end;
  begin perform 1 from persona_data.korean_personas; raise exception '원본 직접 조회'; exception when insufficient_privilege then null; end;
  begin perform 1 from app_private.persona_filter_rows; raise exception '뷰 직접 조회'; exception when insufficient_privilege then null; end;
  begin perform 1 from app_private.persona_filter_cache; raise exception '캐시 직접 조회'; exception when insufficient_privilege then null; end;
  begin refresh materialized view app_private.persona_filter_cache; raise exception '캐시 사용자 갱신'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin begin perform public.query_persona_data(current_setting('test.chat')::uuid,'count'); raise exception '타인 대화 허용'; exception when insufficient_privilege then null; end; end $$;
reset role;
set local role anon;
do $$ begin begin perform public.query_persona_data(current_setting('test.chat')::uuid,'count'); raise exception '비로그인 허용'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
