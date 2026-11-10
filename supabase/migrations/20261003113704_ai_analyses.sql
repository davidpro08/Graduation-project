create table public.analysis_jobs (
  id uuid primary key, conversation_id uuid not null, owner_id uuid not null,
  analysis_type text not null check (analysis_type in ('contradiction','schedule')),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  error_code text, result jsonb, metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (conversation_id,owner_id) references public.conversations(id,owner_id) on delete cascade,
  unique(id,conversation_id,owner_id),
  check ((status='completed') = (result is not null)),
  check (error_code is null or status='failed')
);
create index analysis_jobs_owner_conversation_idx on public.analysis_jobs(owner_id,conversation_id,analysis_type,created_at desc);
create index analysis_jobs_conversation_fk_idx on public.analysis_jobs(conversation_id,owner_id);
create unique index analysis_jobs_active_idx on public.analysis_jobs(conversation_id,analysis_type) where status in ('pending','processing');
create table public.schedules (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null, owner_id uuid not null,
  job_id uuid not null, item_index integer not null check(item_index>=0),
  title text not null check(char_length(btrim(title)) between 1 and 200),
  date_time_text text not null check(char_length(date_time_text) between 1 and 500),
  evidence_message_ids uuid[] not null check(cardinality(evidence_message_ids)>0),
  status text not null default 'proposed' check(status in ('proposed','confirmed')),
  starts_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(job_id,conversation_id,owner_id) references public.analysis_jobs(id,conversation_id,owner_id) on delete cascade,
  unique(job_id,item_index), check((status='confirmed')=(starts_at is not null))
);
create index schedules_owner_conversation_idx on public.schedules(owner_id,conversation_id,status,created_at);
create index schedules_job_fk_idx on public.schedules(job_id,conversation_id,owner_id);
alter table public.analysis_jobs enable row level security;
alter table public.schedules enable row level security;
create policy analysis_jobs_own on public.analysis_jobs for all to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy schedules_own on public.schedules for all to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
revoke all on public.analysis_jobs,public.schedules from public,anon;
grant select,insert,update,delete on public.analysis_jobs,public.schedules to authenticated;

-- 결과와 일정 후보를 한 트랜잭션으로 저장한다. 호출자 RLS·대화 소유권을 유지한다.
create function public.complete_analysis(p_id uuid,p_items jsonb,p_metadata jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.analysis_jobs; item jsonb; evidence uuid[]; item_no integer:=0;
begin
  select * into j from public.analysis_jobs where id=p_id and owner_id=auth.uid() for update;
  if j.id is null then raise exception 'job not found'; end if;
  if j.status='completed' then return; end if;
  if j.status<>'processing' or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>1000 then raise exception 'invalid result'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item->'evidenceMessageIds') is distinct from 'array' then raise exception 'invalid evidence'; end if;
    select array_agg(distinct value::uuid) into evidence from jsonb_array_elements_text(item->'evidenceMessageIds');
    if coalesce(cardinality(evidence),0)<(case when j.analysis_type='contradiction' then 2 else 1 end) then raise exception 'missing evidence'; end if;
    if exists(select 1 from unnest(evidence) e where not exists(select 1 from public.messages m where m.id=e and m.conversation_id=j.conversation_id and m.owner_id=j.owner_id)) then raise exception 'foreign evidence'; end if;
    if j.analysis_type='contradiction' and (jsonb_typeof(item->'summary') is distinct from 'string' or char_length(item->>'summary') not between 1 and 2000) then raise exception 'invalid summary'; end if;
    if j.analysis_type='schedule' and (jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'dateTimeText') is distinct from 'string') then raise exception 'invalid schedule'; end if;
  end loop;
  if j.analysis_type='schedule' then
    delete from public.schedules where conversation_id=j.conversation_id and owner_id=j.owner_id and status='proposed';
    for item in select value from jsonb_array_elements(p_items) loop
      select array_agg(distinct value::uuid order by value::uuid) into evidence from jsonb_array_elements_text(item->'evidenceMessageIds');
      if not exists(select 1 from public.schedules s where s.conversation_id=j.conversation_id and s.owner_id=j.owner_id and s.status='confirmed' and s.title=item->>'title' and s.date_time_text=item->>'dateTimeText' and s.evidence_message_ids=evidence) then
        insert into public.schedules(conversation_id,owner_id,job_id,item_index,title,date_time_text,evidence_message_ids)
          values(j.conversation_id,j.owner_id,j.id,item_no,item->>'title',item->>'dateTimeText',evidence);
      end if;
      item_no:=item_no+1;
    end loop;
  end if;
  update public.analysis_jobs set status='completed',result=jsonb_build_object('items',p_items),metadata=p_metadata,error_code=null,updated_at=now() where id=p_id;
end; $$;
revoke all on function public.complete_analysis(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.complete_analysis(uuid,jsonb,jsonb) to authenticated;
