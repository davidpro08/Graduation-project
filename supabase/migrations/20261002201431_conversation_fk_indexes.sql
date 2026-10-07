create index participants_conversation_owner_idx on public.participants(conversation_id, owner_id);
create index messages_conversation_owner_idx on public.messages(conversation_id, owner_id);
create index messages_participant_conversation_owner_idx on public.messages(participant_id, conversation_id, owner_id);
create or replace function public.conversation_statistics(p_id uuid, p_from date default null, p_to date default null, p_participant uuid default null)
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
), daily as (select d::date as date,count(f.id)::integer as count from generate_series((select min(message_date) from filtered)::timestamp,(select max(message_date) from filtered)::timestamp,interval '1 day') d left join filtered f on f.message_date=d::date group by d),
hourly as (select h as hour,count(f.id)::integer as count from generate_series(0,23) h left join filtered f on extract(hour from f.message_time)=h group by h)
select jsonb_build_object(
  'messageCount',(select count(*) from filtered), 'textCount',(select count(*) from filtered where kind='text'),
  'participantCount',(select count(distinct participant_id) from filtered),
  'characterCount',(select coalesce(sum(character_count) filter(where kind='text'),0) from filtered),
  'participants',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'colorIndex',color_index,'count',count,'textCount',text_count,'characters',characters,'shortCount',short_count,'nightCount',night_count,'questionCount',question_count) order by count desc,color_index) from per_person),'[]'::jsonb),
  'daily',coalesce((select jsonb_agg(to_jsonb(daily) order by date) from daily),'[]'::jsonb),
  'hourly',(select jsonb_agg(to_jsonb(hourly) order by hour) from hourly)
); $$;
