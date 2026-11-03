-- 필터 조회 때 대형 details JSON을 5만 번 다시 해석하지 않도록 정규화 값을 저장한다.
-- 원본 재적재/수정 후 관리자가 REFRESH MATERIALIZED VIEW를 실행해야 한다.
create materialized view app_private.persona_filter_cache as
select p.uuid as id,p.age,p.age_group as "ageGroup",p.sex,p.province,
  coalesce(nullif(p.district,''),'미상') as district,
  coalesce(nullif(p.education_level,''),'미상') as education,
  coalesce(nullif(p.marital_status,''),'미상') as "maritalStatus",
  coalesce(nullif(p.family_type,''),'미상') as "familyType",
  coalesce(nullif(p.occupation,''),'미상') as occupation,
  coalesce(nullif(d.bachelors_field,''),'미상') as "bachelorsField",
  coalesce(nullif(d.housing_type,''),'미상') as "housingType",
  coalesce(nullif(d.military_status,''),'미상') as "militaryStatus"
from persona_data.korean_personas p
cross join lateral jsonb_to_record(p.details) d(bachelors_field text,housing_type text,military_status text);
create unique index persona_filter_cache_id_idx on app_private.persona_filter_cache(id);
revoke all on app_private.persona_filter_cache from public,anon,authenticated;
comment on materialized view app_private.persona_filter_cache is '필터용 정규화 스냅샷. 원본 변경 후 관리자 REFRESH 필요. 직접 사용자 접근 금지.';

create or replace view app_private.persona_filter_rows with (security_invoker=true) as
select * from app_private.persona_filter_cache;
revoke all on app_private.persona_filter_rows from public,anon,authenticated;

create or replace function app_private.query_persona_data(p_conversation_id uuid, p_action text, p_filters jsonb, p_options jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_entry record; v_value jsonb; v_result jsonb;
  v_page integer := 1; v_size integer := 20; v_search text := ''; v_seed text := 'preview'; v_provinces jsonb := '[]';
begin
  if v_user is null or not exists(select 1 from public.conversations where id=p_conversation_id and owner_id=v_user) then
    raise exception 'Conversation not found' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('facets','count','browse','sample') or p_filters is null or jsonb_typeof(p_filters)<>'object'
    or p_options is null or jsonb_typeof(p_options)<>'object' then raise exception 'Invalid persona query' using errcode='22023'; end if;
  for v_entry in select key,value from jsonb_each(p_filters) loop
    if v_entry.key not in ('ageGroup','sex','province','education','maritalStatus','familyType','occupation','district','bachelorsField','housingType','militaryStatus')
      or jsonb_typeof(v_entry.value)<>'array' then raise exception 'Invalid filter' using errcode='22023'; end if;
    if jsonb_array_length(v_entry.value)>30 or (select count(*)<>count(distinct value) from jsonb_array_elements(v_entry.value)) then raise exception 'Invalid filter size' using errcode='22023'; end if;
    for v_value in select value from jsonb_array_elements(v_entry.value) loop
      if jsonb_typeof(v_value)<>'string' or length(v_value#>>'{}') not between 1 and 200 then raise exception 'Invalid filter value' using errcode='22023'; end if;
    end loop;
  end loop;
  if exists(select 1 from jsonb_object_keys(p_options) k where k not in ('page','pageSize','seed','occupationSearch','province')) then raise exception 'Invalid options' using errcode='22023'; end if;
  if p_options ? 'page' then
    if jsonb_typeof(p_options->'page')<>'number' or (p_options->>'page') !~ '^[0-9]{1,6}$' then raise exception 'Invalid page' using errcode='22023'; end if;
    v_page := (p_options->>'page')::integer;
  end if;
  if p_options ? 'pageSize' then
    if jsonb_typeof(p_options->'pageSize')<>'number' or (p_options->>'pageSize') !~ '^[0-9]{1,2}$' then raise exception 'Invalid page size' using errcode='22023'; end if;
    v_size := (p_options->>'pageSize')::integer;
  end if;
  if v_page not between 1 and 100000 or v_size not between 1 and 50 or (p_action='facets' and v_page>1000) then raise exception 'Invalid pagination' using errcode='22023'; end if;
  if p_options ? 'seed' then
    if jsonb_typeof(p_options->'seed')<>'string' or length(p_options->>'seed') not between 1 and 100 then raise exception 'Invalid seed' using errcode='22023'; end if;
    v_seed := p_options->>'seed';
  end if;
  if p_options ? 'occupationSearch' then
    if jsonb_typeof(p_options->'occupationSearch')<>'string' or length(p_options->>'occupationSearch')>100 then raise exception 'Invalid occupation search' using errcode='22023'; end if;
    v_search := btrim(p_options->>'occupationSearch');
  end if;
  if p_options ? 'province' then
    v_provinces := p_options->'province';
    if jsonb_typeof(v_provinces)<>'array' then raise exception 'Invalid province' using errcode='22023'; end if;
    if jsonb_array_length(v_provinces)>17 or exists(select 1 from jsonb_array_elements(v_provinces) v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>200) then raise exception 'Invalid province' using errcode='22023'; end if;
  end if;
  if p_action='facets' then
    with profiles as materialized (select * from app_private.persona_filter_rows),
    categories as (select e.key,e.value from profiles p cross join lateral (values
      ('ageGroup',p."ageGroup"),('sex',p.sex),('province',p.province),('education',p.education),
      ('maritalStatus',p."maritalStatus"),('familyType',p."familyType"),('bachelorsField',p."bachelorsField"),
      ('housingType',p."housingType"),('militaryStatus',p."militaryStatus")) e(key,value) group by e.key,e.value),
    grouped as (select key,jsonb_agg(value order by value) vals from categories group by key),
    occupations as materialized (select occupation as value from profiles where strpos(lower(occupation),lower(v_search))>0 group by occupation),
    page_occupations as (select value from occupations order by value limit 50 offset (v_page-1)*50),
    districts as (select district as value from profiles where v_provinces ? province group by district)
    select jsonb_build_object('values',(select jsonb_object_agg(k,'[]'::jsonb) from unnest(array['ageGroup','sex','province','education','maritalStatus','familyType','bachelorsField','housingType','militaryStatus']) k)||coalesce((select jsonb_object_agg(key,vals) from grouped),'{}'::jsonb)||jsonb_build_object(
      'occupation',coalesce((select jsonb_agg(value order by value) from page_occupations),'[]'::jsonb),
      'district',coalesce((select jsonb_agg(value order by value) from districts),'[]'::jsonb)),
      'occupation',jsonb_build_object('total',(select count(*) from occupations),'page',v_page,'pageSize',50,'search',v_search),
      'population',(select count(*) from profiles),'age',jsonb_build_object('min',(select min(age) from profiles),'max',(select max(age) from profiles))) into v_result;
    return v_result;
  end if;
  -- 공개 필터 값은 SQL 문자열로 연결하지 않고 JSONB 값으로 비교한다.
  with matched as materialized (
    select p.id from app_private.persona_filter_rows p where
      (coalesce(jsonb_array_length(p_filters->'ageGroup'),0)=0 or p_filters->'ageGroup' ? p."ageGroup") and
      (coalesce(jsonb_array_length(p_filters->'sex'),0)=0 or p_filters->'sex' ? p.sex) and
      (coalesce(jsonb_array_length(p_filters->'province'),0)=0 or p_filters->'province' ? p.province) and
      (coalesce(jsonb_array_length(p_filters->'education'),0)=0 or p_filters->'education' ? p.education) and
      (coalesce(jsonb_array_length(p_filters->'maritalStatus'),0)=0 or p_filters->'maritalStatus' ? p."maritalStatus") and
      (coalesce(jsonb_array_length(p_filters->'familyType'),0)=0 or p_filters->'familyType' ? p."familyType") and
      (coalesce(jsonb_array_length(p_filters->'occupation'),0)=0 or p_filters->'occupation' ? p.occupation) and
      (coalesce(jsonb_array_length(p_filters->'district'),0)=0 or p_filters->'district' ? p.district) and
      (coalesce(jsonb_array_length(p_filters->'bachelorsField'),0)=0 or p_filters->'bachelorsField' ? p."bachelorsField") and
      (coalesce(jsonb_array_length(p_filters->'housingType'),0)=0 or p_filters->'housingType' ? p."housingType") and
      (coalesce(jsonb_array_length(p_filters->'militaryStatus'),0)=0 or p_filters->'militaryStatus' ? p."militaryStatus")
  ), chosen as (
    select id from matched where p_action<>'count'
    order by case when p_action='sample' then md5(v_seed||':'||id) else id end,id
    limit case when p_action='sample' then 500 else v_size end offset case when p_action='browse' then (v_page-1)*v_size else 0 end
  ), profiles as (
    select c.id,jsonb_strip_nulls(to_jsonb(f)||jsonb_build_object('name',substring(p.persona from '^([가-힣]{2,6}) 씨'),'persona',p.persona)) as profile
    from chosen c join app_private.persona_filter_rows f on f.id=c.id join persona_data.korean_personas p on p.uuid=c.id
  )
  select case when p_action='browse' then jsonb_build_object('items',coalesce((select jsonb_agg(profile order by id) from profiles),'[]'::jsonb),
    'total',(select count(*) from matched),'page',v_page,'pageSize',v_size)
  else jsonb_build_object('eligible',(select count(*) from matched),'personas',coalesce((select jsonb_agg(profile order by md5(v_seed||':'||id),id) from profiles),'[]'::jsonb)) end into v_result;
  return v_result;
end;
$$;

revoke all on function app_private.query_persona_data(uuid,text,jsonb,jsonb) from public,anon;
grant execute on function app_private.query_persona_data(uuid,text,jsonb,jsonb) to authenticated;
