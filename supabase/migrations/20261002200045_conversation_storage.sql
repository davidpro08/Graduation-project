create table public.conversations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  source_path text not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  parser_version text not null default 'kakao-v1',
  warnings jsonb not null default '[]'::jsonb,
  message_count integer not null check (message_count between 1 and 100000),
  start_date date not null, end_date date not null,
  created_at timestamptz not null default now(),
  unique (id, owner_id), check (start_date <= end_date),
  check (source_path = owner_id::text || '/' || id::text || '/original.txt')
);
create index conversations_owner_created_idx on public.conversations(owner_id, created_at desc, id);
create table public.participants (
  id uuid primary key, conversation_id uuid not null, owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  color_index smallint not null check (color_index between 0 and 399),
  foreign key (conversation_id, owner_id) references public.conversations(id, owner_id) on delete cascade,
  unique (id, conversation_id, owner_id), unique (conversation_id, name), unique (conversation_id, color_index)
);
create table public.messages (
  id uuid primary key, conversation_id uuid not null, owner_id uuid not null,
  participant_id uuid, sequence integer not null check (sequence >= 0),
  message_date date not null, message_time time,
  body text not null, kind text not null check (kind in ('text','attachment','system')),
  character_count integer generated always as (char_length(regexp_replace(body, '[[:space:]]', '', 'g'))) stored,
  foreign key (conversation_id, owner_id) references public.conversations(id, owner_id) on delete cascade,
  foreign key (participant_id, conversation_id, owner_id) references public.participants(id, conversation_id, owner_id),
  unique (conversation_id, sequence), check ((kind = 'system') = (participant_id is null))
);
create index messages_conversation_date_idx on public.messages(conversation_id, message_date, sequence);
create index messages_participant_date_idx on public.messages(participant_id, message_date);
alter table public.conversations enable row level security;
alter table public.participants enable row level security;
alter table public.messages enable row level security;
create policy conversations_own on public.conversations for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy participants_own on public.participants for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy messages_own on public.messages for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
revoke all on public.conversations, public.participants, public.messages from anon, public;
grant select, insert, update, delete on public.conversations, public.participants, public.messages to authenticated;

-- SECURITY INVOKER: 트랜잭션으로 저장하되 요청자 RLS를 그대로 적용한다.
create function public.import_conversation(p_id uuid, p_title text, p_source_hash text, p_participants jsonb, p_messages jsonb, p_warnings jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if jsonb_array_length(p_participants) not between 1 and 400 or jsonb_array_length(p_messages) not between 1 and 100000 then raise exception 'invalid import size'; end if;
  insert into public.conversations(id,owner_id,title,source_path,source_hash,warnings,message_count,start_date,end_date)
  select p_id,v_owner,btrim(p_title),v_owner::text||'/'||p_id::text||'/original.txt',p_source_hash,p_warnings,
    jsonb_array_length(p_messages),min((m->>'date')::date),max((m->>'date')::date) from jsonb_array_elements(p_messages) m;
  insert into public.participants(id,conversation_id,owner_id,name,color_index)
  select (p->>'id')::uuid,p_id,v_owner,p->>'name',(p->>'colorIndex')::smallint from jsonb_array_elements(p_participants) p;
  insert into public.messages(id,conversation_id,owner_id,participant_id,sequence,message_date,message_time,body,kind)
  select (m->>'id')::uuid,p_id,v_owner,(m->>'participantId')::uuid,(m->>'sequence')::integer,
    (m->>'date')::date,nullif(m->>'time','')::time,m->>'text',m->>'kind' from jsonb_array_elements(p_messages) m;
  return p_id;
end; $$;
revoke all on function public.import_conversation(uuid,text,text,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.import_conversation(uuid,text,text,jsonb,jsonb,jsonb) to authenticated;

create function public.conversation_statistics(p_id uuid, p_from date default null, p_to date default null, p_participant uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
with filtered as (
  select * from public.messages where conversation_id=p_id and kind <> 'system'
    and (p_from is null or message_date>=p_from) and (p_to is null or message_date<=p_to)
    and (p_participant is null or participant_id=p_participant)
), per_person as (
  select p.id,p.name,p.color_index,
    count(f.id)::integer as count, count(f.id) filter(where f.kind='text')::integer as text_count,
    coalesce(sum(f.character_count) filter(where f.kind='text'),0)::integer as characters,
    count(f.id) filter(where f.kind='text' and f.character_count between 1 and 5)::integer as short_count,
    count(f.id) filter(where extract(hour from f.message_time)<6)::integer as night_count,
    count(f.id) filter(where f.kind='text' and f.body ~ '[?？]')::integer as question_count
  from public.participants p left join filtered f on f.participant_id=p.id
  where p.conversation_id=p_id and (p_participant is null or p.id=p_participant)
  group by p.id,p.name,p.color_index
), daily as (select message_date as date,count(*)::integer as count from filtered group by message_date),
hourly as (select h as hour,count(f.id)::integer as count from generate_series(0,23) h left join filtered f on extract(hour from f.message_time)=h group by h)
select jsonb_build_object(
  'messageCount',(select count(*) from filtered), 'textCount',(select count(*) from filtered where kind='text'),
  'participantCount',(select count(distinct participant_id) from filtered),
  'characterCount',(select coalesce(sum(character_count) filter(where kind='text'),0) from filtered),
  'participants',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'colorIndex',color_index,'count',count,'textCount',text_count,'characters',characters,'shortCount',short_count,'nightCount',night_count,'questionCount',question_count) order by count desc,color_index) from per_person),'[]'::jsonb),
  'daily',coalesce((select jsonb_agg(to_jsonb(daily) order by date) from daily),'[]'::jsonb),
  'hourly',(select jsonb_agg(to_jsonb(hourly) order by hour) from hourly)
); $$;
revoke all on function public.conversation_statistics(uuid,date,date,uuid) from public, anon;
grant execute on function public.conversation_statistics(uuid,date,date,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('conversation-originals','conversation-originals',false,10485760,array['text/plain']);
create policy conversation_originals_select on storage.objects for select to authenticated
using (bucket_id='conversation-originals' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy conversation_originals_insert on storage.objects for insert to authenticated
with check (bucket_id='conversation-originals' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy conversation_originals_delete on storage.objects for delete to authenticated
using (bucket_id='conversation-originals' and (storage.foldername(name))[1]=(select auth.uid())::text);
