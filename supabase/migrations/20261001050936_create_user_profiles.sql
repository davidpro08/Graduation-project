-- Auth가 계정과 로그인 identity를 관리하고 서비스는 최소 프로필만 저장한다.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_nickname_length check (
    nickname is null or (char_length(nickname) between 1 and 30
      and nickname = regexp_replace(nickname, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
  )
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (nickname) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create function app_private.create_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id) values (new.id);
  return new;
end;
$$;
revoke all on function app_private.create_profile() from public, anon, authenticated;
create trigger create_user_profile after insert on auth.users
  for each row execute function app_private.create_profile();

create function app_private.normalize_profile()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.nickname is not null then
    new.nickname := pg_catalog.regexp_replace(new.nickname, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  end if;
  if TG_OP = 'UPDATE' then
    new.updated_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function app_private.normalize_profile() from public, anon, authenticated;
create trigger normalize_profile before insert or update on public.profiles
  for each row execute function app_private.normalize_profile();

insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;
comment on table public.profiles is 'Auth 사용자별 최소 서비스 프로필. 이메일·OAuth 토큰을 복제하지 않음.';
