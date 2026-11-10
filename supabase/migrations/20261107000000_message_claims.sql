-- Message-level extraction cache; caller JWT and existing conversation ownership apply.
alter table public.messages add constraint messages_claim_reference_unique unique(id,conversation_id,owner_id);
create function public.valid_claim_payload(p jsonb, message_id uuid) returns boolean
language plpgsql immutable set search_path = '' as $$
declare c jsonb; q jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' then return false; end if;
  if p->>'message_id' is distinct from message_id::text or jsonb_typeof(p->'claims') is distinct from 'array'
    or jsonb_typeof(p->'original_text') is distinct from 'string'
    or (p - array['message_id','original_text','claims']) <> '{}'::jsonb then return false; end if;
  for c in select value from jsonb_array_elements(p->'claims') loop
    if jsonb_typeof(c) is distinct from 'object' then return false; end if;
    if not (c ?& array['evidence','subject','predicate','object','polarity','qualifiers'])
      or (c - array['evidence','subject','predicate','object','polarity','qualifiers']) <> '{}'::jsonb
      or jsonb_typeof(c->'evidence') is distinct from 'string' or length(c->>'evidence')=0
      or strpos(p->>'original_text',c->>'evidence')=0
      or jsonb_typeof(c->'predicate') is distinct from 'string' or length(c->>'predicate')=0
      or jsonb_typeof(c->'subject') not in ('string','null') or jsonb_typeof(c->'object') not in ('string','null')
      or jsonb_typeof(c->'polarity') is distinct from 'string' or c->>'polarity' not in ('positive','negative','uncertain')
      or jsonb_typeof(c->'qualifiers') is distinct from 'array' then return false; end if;
    for q in select value from jsonb_array_elements(c->'qualifiers') loop
      if jsonb_typeof(q) is distinct from 'string' or q='""'::jsonb then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
create table public.message_claims (
  message_id uuid not null, conversation_id uuid not null, owner_id uuid not null,
  extractor_version text not null check(length(extractor_version) between 1 and 300),
  source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check(public.valid_claim_payload(payload,message_id)),
  updated_at timestamptz not null default now(),
  primary key(message_id,extractor_version),
  foreign key(message_id,conversation_id,owner_id) references public.messages(id,conversation_id,owner_id) on delete cascade
);
create index message_claims_conversation_idx on public.message_claims(owner_id,conversation_id);
alter table public.message_claims enable row level security;
create policy message_claims_own on public.message_claims for all to authenticated
using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
revoke all on public.message_claims from public,anon;
grant select,insert,update,delete on public.message_claims to authenticated;
-- Reject source substitution even for callers writing via PostgREST directly.
create function public.check_claim_source() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.messages m where m.id=new.message_id and m.owner_id=new.owner_id
    and m.conversation_id=new.conversation_id and m.kind='text' and m.body=new.payload->>'original_text')
  then raise exception 'claim source mismatch'; end if;
  return new;
end $$;
create trigger message_claim_source before insert or update on public.message_claims for each row execute function public.check_claim_source();
revoke all on function public.check_claim_source() from public,anon;
revoke all on function public.valid_claim_payload(jsonb,uuid) from public,anon;
grant execute on function public.valid_claim_payload(jsonb,uuid) to authenticated;
