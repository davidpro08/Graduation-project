-- 합성 계정·대화만 사용하고 항상 롤백한다.
begin;
do $test$
declare u uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); j uuid:=gen_random_uuid(); s uuid; n integer;
begin
 insert into auth.users(id,email) values(u,'analysis-'||u||'@example.invalid'),(other_user,'analysis-'||other_user||'@example.invalid');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 perform public.import_conversation(c,'합성 분석 검증',repeat('a',64),jsonb_build_array(jsonb_build_object('id',p,'name','합성A','colorIndex',0)),jsonb_build_array(jsonb_build_object('id',m,'participantId',p,'sequence',0,'date','2026-10-09','time','15:00','text','회의합시다','kind','text')),'[]');
 insert into public.analysis_jobs(id,conversation_id,owner_id,analysis_type,status) values(j,c,u,'schedule','processing');
 perform public.complete_analysis(j,jsonb_build_array(jsonb_build_object('title','회의','dateTimeText','10월 9일 오후 3시','evidenceMessageIds',jsonb_build_array(m))),'{}');
 select id into s from public.schedules where job_id=j; assert s is not null,'candidate missing';
 perform public.complete_analysis(j,'[]','{}');
 select count(*) into n from public.schedules where job_id=j; assert n=1,'completion not idempotent';
 update public.schedules set status='confirmed',starts_at='2026-10-09T15:00:00+09:00' where id=s;
 update public.schedules set title='수정 회의',starts_at='2026-10-10T16:00:00+09:00' where id=s;
 assert (select status='confirmed' and title='수정 회의' from public.schedules where id=s),'confirmation failed';
 update public.schedules set ends_at='2026-10-10T17:00:00+09:00' where id=s;
 assert (select ends_at>starts_at from public.schedules where id=s),'end time missing';
 begin
  update public.schedules set ends_at='2026-10-10T15:00:00+09:00' where id=s;
  raise exception 'invalid end accepted';
 exception when check_violation then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_user,'role','authenticated')::text,true);
 select count(*) into n from public.analysis_jobs where id=j; assert n=0,'jobs RLS leaked';
 select count(*) into n from public.schedules where id=s; assert n=0,'schedules RLS leaked';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 j:=gen_random_uuid();
 insert into public.analysis_jobs(id,conversation_id,owner_id,analysis_type,status) values(j,c,u,'schedule','processing');
 begin
  perform public.complete_analysis(j,jsonb_build_array(jsonb_build_object('title','위조','dateTimeText','날짜','evidenceMessageIds',jsonb_build_array(gen_random_uuid()))),'{}');
  raise exception 'foreign evidence accepted';
 exception when others then if sqlerrm='foreign evidence accepted' then raise; end if; end;
 assert (select status='processing' from public.analysis_jobs where id=j),'failed RPC not atomic';
 delete from public.conversations where id=c;
 select count(*) into n from public.analysis_jobs where conversation_id=c; assert n=0,'jobs cascade failed';
 select count(*) into n from public.schedules where conversation_id=c; assert n=0,'schedules cascade failed';
 execute 'reset role';
end $test$;
rollback;
