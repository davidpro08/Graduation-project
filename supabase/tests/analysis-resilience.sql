-- 합성 사용자·대화만 사용하는 격리 DB 회귀 검증. 항상 롤백한다.
begin;
do $test$
declare u uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
  m uuid:=gen_random_uuid(); m2 uuid:=gen_random_uuid(); j uuid:=gen_random_uuid(); confirmed uuid;
  first_item jsonb; n integer;
begin
  insert into auth.users(id,email) values(u,'analysis-resilience-'||u||'@example.invalid');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  perform public.import_conversation(c,'합성 부분 분석 검증',repeat('b',64),
    jsonb_build_array(jsonb_build_object('id',p,'name','합성A','colorIndex',0)),
    jsonb_build_array(jsonb_build_object('id',m,'participantId',p,'sequence',0,'date','2026-11-01','time','10:00','text','내일 회의','kind','text'),
      jsonb_build_object('id',m2,'participantId',p,'sequence',1,'date','2026-11-01','time','10:05','text','오후3시','kind','text')),'[]');
  first_item:=jsonb_build_object('title','기존 회의','dateTimeText','내일','evidenceMessageIds',jsonb_build_array(m),
    'suggestion',jsonb_build_object('date','2026-11-02','time','15:00','uncertain',true));
  insert into public.analysis_jobs(id,conversation_id,owner_id,analysis_type,status) values(j,c,u,'schedule','processing');
  perform public.complete_analysis(j,jsonb_build_array(first_item),'{}');
  select id into confirmed from public.schedules where job_id=j;
  update public.schedules set status='confirmed',starts_at='2026-11-02T15:00:00+09:00' where id=confirmed;
  assert (select result->'items'->0->'suggestion'->>'date'='2026-11-02' from public.analysis_jobs where id=j),'suggestion not persisted';

  j:=gen_random_uuid();
  insert into public.analysis_jobs(id,conversation_id,owner_id,analysis_type,status) values(j,c,u,'schedule','processing');
  perform public.complete_analysis(j,jsonb_build_array(jsonb_build_object('title','보존할 후보','dateTimeText','내일','evidenceMessageIds',jsonb_build_array(m))),'{}');
  j:=gen_random_uuid();
  insert into public.analysis_jobs(id,conversation_id,owner_id,analysis_type,status) values(j,c,u,'schedule','processing');
  perform public.complete_analysis(j,jsonb_build_array(first_item,
    jsonb_build_object('title','보존할 후보','dateTimeText','내일','evidenceMessageIds',jsonb_build_array(m)),
    jsonb_build_object('title','새 후보','dateTimeText','오후3시','evidenceMessageIds',jsonb_build_array(m2))),
    '{"coverage":"partial","failedChunks":1}');
  select count(*) into n from public.schedules where conversation_id=c;
  assert n=3,'partial result removed old candidates or inserted duplicates';
  assert (select metadata->>'coverage'='partial' from public.analysis_jobs where id=j),'partial marker lost';
  perform public.complete_analysis(j,'[]','{}');
  assert (select count(*)=3 from public.schedules where conversation_id=c),'partial completion not idempotent';
  j:=gen_random_uuid();
  insert into public.analysis_jobs(id,conversation_id,owner_id,analysis_type,status) values(j,c,u,'schedule','processing');
  perform public.complete_analysis(j,'[]','{"coverage":"complete"}');
  assert (select count(*)=1 from public.schedules where conversation_id=c),'full result must replace only proposed';
  assert (select status='confirmed' from public.schedules where id=confirmed),'confirmed schedule lost';
  j:=gen_random_uuid();
  insert into public.analysis_jobs(id,conversation_id,owner_id,analysis_type,status) values(j,c,u,'contradiction','processing');
  perform public.complete_analysis(j,jsonb_build_array(jsonb_build_object('title','발언 번복','summary','합성 상세 설명',
    'evidenceMessageIds',jsonb_build_array(m,m2))),'{}');
  assert (select result->'items'->0->>'title'='발언 번복' from public.analysis_jobs where id=j),'contradiction title lost';
  execute 'reset role';
  assert not has_function_privilege('anon','public.complete_analysis(uuid,jsonb,jsonb)','execute'),'anon privilege leaked';
  assert not (select prosecdef from pg_proc where oid='public.complete_analysis(uuid,jsonb,jsonb)'::regprocedure),'must remain invoker';
end $test$;
rollback;
