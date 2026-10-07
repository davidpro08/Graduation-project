-- 합성 Auth 사용자만 트랜잭션 안에서 만들며 모든 변경을 롤백한다.
begin;
select set_config('test.user_a', gen_random_uuid()::text, true),
       set_config('test.user_b', gen_random_uuid()::text, true);
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select current_setting('test.user_a')::uuid, 'authenticated', 'authenticated',
  'profile-test-a@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()
union all
select current_setting('test.user_b')::uuid, 'authenticated', 'authenticated',
  'profile-test-b@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now();
do $$
begin
  if (select count(*) from public.profiles where id in
    (current_setting('test.user_a')::uuid, current_setting('test.user_b')::uuid)) <> 2 then
    raise exception '가입 트리거 실패';
  end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('test.user_a'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare affected integer; original_created timestamptz; original_updated timestamptz;
begin
  if (select count(*) from public.profiles) <> 1 then raise exception '본인 조회 RLS 실패'; end if;
  select created_at, updated_at into original_created, original_updated from public.profiles;
  update public.profiles set nickname = E'  테스트 A\t ' where id = current_setting('test.user_a')::uuid;
  if not exists(select 1 from public.profiles where nickname = '테스트 A'
    and created_at = original_created and updated_at > original_updated) then
    raise exception '정규화 또는 타임스탬프 실패';
  end if;
  update public.profiles set nickname = '침범' where id = current_setting('test.user_b')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception '타인 수정 RLS 실패'; end if;
  begin
    update public.profiles set id = current_setting('test.user_b')::uuid;
    raise exception 'ID 변경 허용됨';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set created_at = now();
    raise exception '생성 시각 변경 허용됨';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set updated_at = now();
    raise exception '수정 시각 직접 변경 허용됨';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.profiles(id) values(gen_random_uuid());
    raise exception '직접 삽입 허용됨';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.profiles;
    raise exception '직접 삭제 허용됨';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set nickname = ' ';
    raise exception '빈 닉네임 허용됨';
  exception when check_violation then null; end;
  begin
    update public.profiles set nickname = repeat('가',31);
    raise exception '길이 초과 허용됨';
  exception when check_violation then null; end;
  update public.profiles set nickname = repeat('가',30);
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('test.user_b'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.profiles where id = current_setting('test.user_b')::uuid and nickname is null) <> 1
    then raise exception 'B 사용자 격리 실패'; end if;
  if exists(select 1 from public.profiles where id = current_setting('test.user_a')::uuid)
    then raise exception '타인 조회 허용됨'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.profiles;
    raise exception '익명 조회 허용됨';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from auth.users where id = current_setting('test.user_a')::uuid;
do $$ begin
  if exists(select 1 from public.profiles where id = current_setting('test.user_a')::uuid)
    then raise exception '연쇄 삭제 실패'; end if;
end $$;
rollback;
select 'profiles 트리거·정규화·RLS·컬럼 권한·제약·연쇄 삭제 검증 통과; 모든 테스트 변경 롤백' as result;
