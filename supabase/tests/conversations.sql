-- 합성 사용자·대화만 생성하고 모든 데이터를 롤백한다.
begin;
select set_config('test.chat_owner',gen_random_uuid()::text,true),set_config('test.chat_other',gen_random_uuid()::text,true),
 set_config('test.chat_id',gen_random_uuid()::text,true),set_config('test.person_a',gen_random_uuid()::text,true),set_config('test.person_b',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select current_setting('test.chat_owner')::uuid,'authenticated','authenticated','chat-test-owner@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now()
union all select current_setting('test.chat_other')::uuid,'authenticated','authenticated','chat-test-other@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now();
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.chat_owner'),'role','authenticated')::text,true);
set local role authenticated;
select public.import_conversation(current_setting('test.chat_id')::uuid,'합성 테스트',repeat('a',64),
 jsonb_build_array(jsonb_build_object('id',current_setting('test.person_a'),'name','A','colorIndex',0),jsonb_build_object('id',current_setting('test.person_b'),'name','B','colorIndex',399)),
 (select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'participantId',case when seq<3 then current_setting('test.person_a') when seq<5 then current_setting('test.person_b') else null end,
  'sequence',seq,'date',case when seq<3 then '2026-09-29' else '2026-10-01' end,'time',tm,'text',body,'kind',kind))
 from (values (0,'00:01','네','text'),(1,'12:00','좋아요?','text'),(2,'05:00','사진','attachment'),(3,'09:00',' 긴 답변 입니다 ','text'),(4,'23:00','응','text'),(5,'','B님이 나갔습니다.','system')) as fixture(seq,tm,body,kind)), '[]');
do $$ declare s jsonb; p jsonb; affected integer;
begin
 if (select count(*) from public.conversations)<>1 or (select count(*) from public.messages)<>6 or (select count(*) from public.participants)<>2 then raise exception 'import failed'; end if;
 s:=public.conversation_statistics(current_setting('test.chat_id')::uuid);
 if (s->>'messageCount')::int<>5 or (s->>'textCount')::int<>4 or (s->>'characterCount')::int<>12 or (s->>'participantCount')::int<>2 then raise exception 'statistics total mismatch: %',s; end if;
 select value into p from jsonb_array_elements(s->'participants') where value->>'name'='A';
 if (p->>'count')::int<>3 or (p->>'shortCount')::int<>2 or (p->>'nightCount')::int<>2 or (p->>'questionCount')::int<>1 then raise exception 'participant mismatch: %',p; end if;
 if jsonb_array_length(s->'hourly')<>24 then raise exception 'hour bucket mismatch'; end if;
 if jsonb_array_length(s->'daily')<>3 or (s->'daily'->1->>'count')::int<>0 then raise exception 'missing zero day'; end if;
 s:=public.conversation_statistics(current_setting('test.chat_id')::uuid,'2026-10-01','2026-10-01',current_setting('test.person_b')::uuid);
 if (s->>'messageCount')::int<>2 or (s->>'characterCount')::int<>7 then raise exception 'filter mismatch'; end if;
 s:=public.conversation_statistics(current_setting('test.chat_id')::uuid,'2027-01-01','2027-01-02',null);
 if (s->>'messageCount')::int<>0 or (s->>'characterCount')::int<>0 then raise exception 'empty mismatch'; end if;
 begin
  update public.messages set owner_id=current_setting('test.chat_other')::uuid;
  raise exception 'owner reassignment allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.chat_other'),'role','authenticated')::text,true);
do $$ declare affected integer;
begin
 if (select count(*) from public.conversations)<>0 or (select count(*) from public.messages)<>0 or (select count(*) from public.participants)<>0 then raise exception 'cross-user select allowed'; end if;
 if (public.conversation_statistics(current_setting('test.chat_id')::uuid)->>'messageCount')::int<>0 then raise exception 'cross-user stats leaked'; end if;
 delete from public.conversations where id=current_setting('test.chat_id')::uuid;get diagnostics affected=row_count;
 if affected<>0 then raise exception 'cross-user delete allowed'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.chat_owner'),'role','authenticated')::text,true);
delete from public.conversations where id=current_setting('test.chat_id')::uuid;
do $$ begin if (select count(*) from public.messages)<>0 or (select count(*) from public.participants)<>0 then raise exception 'cascade failed'; end if; end $$;
reset role;
rollback;
