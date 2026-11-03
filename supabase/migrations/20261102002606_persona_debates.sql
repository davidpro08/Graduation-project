-- 사용자 작업은 사용자 JWT와 RLS, 공용 참조 표본은 서버 전용 RPC로 분리한다.
create table public.persona_debates (
  id uuid primary key,
  conversation_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  input text not null check (char_length(btrim(input)) between 1 and 800),
  filters jsonb not null default '{}' check (jsonb_typeof(filters) = 'object'),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  stage text not null default 'pending' check (stage in ('pending','sampling','refining','detail','jev','completed','failed')),
  processed integer not null default 0 check (processed between 0 and 500),
  selected integer not null default 0 check (selected between 0 and 500 and processed <= selected),
  error_code text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (conversation_id,owner_id) references public.conversations(id,owner_id) on delete cascade,
  check ((status = 'completed') = (result is not null)),
  check (result is null or jsonb_typeof(result) = 'object')
);
create index persona_debates_latest_idx on public.persona_debates(owner_id,conversation_id,created_at desc,id);
create index persona_debates_conversation_idx on public.persona_debates(conversation_id,owner_id);
create unique index persona_debates_active_idx on public.persona_debates(owner_id,conversation_id) where status in ('pending','processing');
alter table public.persona_debates enable row level security;
revoke all on public.persona_debates from public, anon, authenticated;
grant select,insert,update,delete on public.persona_debates to authenticated;
create policy persona_debates_own on public.persona_debates for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- secret 키는 서버에만 둔다. 함수는 호출자의 권한으로 실행되며 일반 사용자 실행을 금지한다.
grant usage on schema persona_data to service_role;
grant select on persona_data.korean_personas to service_role;
create function public.persona_debate_facets() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'sex', (select jsonb_agg(v order by v) from (select distinct sex v from persona_data.korean_personas) a),
    'province', (select jsonb_agg(v order by v) from (select distinct province v from persona_data.korean_personas) a),
    'education', (select jsonb_agg(v order by v) from (select distinct coalesce(nullif(education_level,''),'미상') v from persona_data.korean_personas) a),
    'occupation', (select jsonb_agg(v order by v) from (select distinct coalesce(nullif(occupation,''),'미상') v from persona_data.korean_personas) a),
    'ageGroup', (select jsonb_agg(v order by v) from (select distinct age_group v from persona_data.korean_personas) a),
    'income', (select jsonb_agg(v order by v) from (select distinct
      case when details->>'income_decile' ~ '^([1-9]|10)$' then (details->>'income_decile') || '분위' else '미상' end v from persona_data.korean_personas) a)
  );
$$;
revoke all on function public.persona_debate_facets() from public,anon,authenticated;
grant execute on function public.persona_debate_facets() to service_role;

create function public.sample_debate_personas(p_filters jsonb, p_seed text, p_preview boolean default false) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' or p_seed is null or length(p_seed) > 100 then
    raise exception 'invalid sample arguments' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_filters) f where f.key not in ('sex','province','education','occupation','income','ageGroup')
    or jsonb_typeof(f.value) <> 'array') then
    raise exception 'invalid filters' using errcode = '22023';
  end if;
  with eligible as materialized (
    select jsonb_build_object('id',p.uuid,'age',p.age,'sex',p.sex,'province',p.province,
      'education',coalesce(nullif(p.education_level,''),'미상'), 'occupation',coalesce(nullif(p.occupation,''),'미상'),
      'ageGroup',p.age_group,'income',case when p.details->>'income_decile' ~ '^([1-9]|10)$' then (p.details->>'income_decile') || '분위' else '미상' end) profile
    from persona_data.korean_personas p
  ), matching as materialized (
    select profile from eligible e where not exists (
      select 1 from jsonb_each(p_filters) f
      where jsonb_array_length(f.value) > 0 and not (f.value ? (e.profile->>f.key))
    )
  ), sampled as (
    select profile from matching order by md5(p_seed || ':' || (profile->>'id')),profile->>'id' limit 500
  )
  select jsonb_build_object('eligible',(select count(*) from matching),
    -- 큰 원본 본문은 선택된 500명에 대해서만 결합한다. 미리보기에서는 본문을 조회하지 않는다.
    'personas',case when p_preview then '[]'::jsonb else coalesce((select jsonb_agg(s.profile || jsonb_build_object('persona',p.persona)
      order by md5(p_seed || ':' || (s.profile->>'id')),s.profile->>'id')
      from sampled s join persona_data.korean_personas p on p.uuid = s.profile->>'id'),'[]'::jsonb) end) into result;
  return result;
end;
$$;
revoke all on function public.sample_debate_personas(jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.sample_debate_personas(jsonb,text,boolean) to service_role;
comment on table public.persona_debates is '합성 페르소나의 생성 의견 작업. 실제 여론조사 또는 모집단 대표 추정치가 아님.';
