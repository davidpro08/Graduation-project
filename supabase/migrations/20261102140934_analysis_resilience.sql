-- 부분 분석에서는 이전 후보를 지우지 않고 성공한 구간의 새 후보만 추가한다.
-- 권한·소유권·근거 검증과 원자적 저장은 기존 계약을 유지한다.
create or replace function public.complete_analysis(p_id uuid,p_items jsonb,p_metadata jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.analysis_jobs; item jsonb; evidence uuid[]; item_no integer:=0;
  is_partial boolean:=coalesce(p_metadata->>'coverage','complete')='partial';
begin
  select * into j from public.analysis_jobs where id=p_id and owner_id=auth.uid() for update;
  if j.id is null then raise exception 'job not found'; end if;
  if j.status='completed' then return; end if;
  if j.status<>'processing' or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>1000
    or jsonb_typeof(p_metadata) is distinct from 'object' then raise exception 'invalid result'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item->'evidenceMessageIds') is distinct from 'array' then raise exception 'invalid evidence'; end if;
    select array_agg(distinct value::uuid) into evidence from jsonb_array_elements_text(item->'evidenceMessageIds');
    if coalesce(cardinality(evidence),0)<(case when j.analysis_type='contradiction' then 2 else 1 end) then raise exception 'missing evidence'; end if;
    if exists(select 1 from unnest(evidence) e where not exists(select 1 from public.messages m where m.id=e and m.conversation_id=j.conversation_id and m.owner_id=j.owner_id)) then raise exception 'foreign evidence'; end if;
    if j.analysis_type='contradiction' and (jsonb_typeof(item->'summary') is distinct from 'string' or char_length(item->>'summary') not between 1 and 2000) then raise exception 'invalid summary'; end if;
    if j.analysis_type='schedule' and (jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'dateTimeText') is distinct from 'string') then raise exception 'invalid schedule'; end if;
  end loop;
  if j.analysis_type='schedule' then
    if not is_partial then
      delete from public.schedules where conversation_id=j.conversation_id and owner_id=j.owner_id and status='proposed';
    end if;
    for item in select value from jsonb_array_elements(p_items) loop
      select array_agg(distinct value::uuid order by value::uuid) into evidence from jsonb_array_elements_text(item->'evidenceMessageIds');
      if not exists(select 1 from public.schedules s where s.conversation_id=j.conversation_id and s.owner_id=j.owner_id
        and (s.status='confirmed' or is_partial) and s.title=item->>'title' and s.date_time_text=item->>'dateTimeText' and s.evidence_message_ids=evidence) then
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
