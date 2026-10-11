-- Security hardening after Supabase advisor review (11 Oct 2026).
-- 1. Privacy helper functions move out of the public API schema into "private".
--    Policies keep working: they point to the functions themselves, not to their names.
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_super_admin()                 set schema private;
alter function public.gym_role(uuid)                   set schema private;
alter function public.has_gym_role(uuid, text[])       set schema private;
alter function public.is_trainer_of(uuid)              set schema private;
alter function public.is_gym_owner_of(uuid)            set schema private;
alter function public.can_see_private(uuid)            set schema private;
alter function public.can_see_profile(uuid)            set schema private;
alter function public.can_manage_tc(uuid)              set schema private;
alter function public.can_read_tc(uuid)                set schema private;

-- functions above call each other by their old public.* names; repoint them
create or replace function private.can_see_private(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select person = auth.uid() or private.is_super_admin() or private.is_trainer_of(person) or private.is_gym_owner_of(person)
$$;
create or replace function private.can_see_profile(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select person = auth.uid()
      or private.is_super_admin()
      or private.is_trainer_of(person)
      or exists (select 1 from trainer_clients tc where tc.client_id = auth.uid() and tc.trainer_id = person and tc.status = 'active')
      or exists (select 1 from trainer_profiles tp where tp.user_id = person and tp.is_public)
      or exists (select 1 from gym_staff me where me.user_id = auth.uid() and me.active and me.role in ('owner','admin','operator')
                 and (   exists (select 1 from members m where m.gym_id = me.gym_id and m.profile_id = person)
                      or exists (select 1 from gym_staff s where s.gym_id = me.gym_id and s.user_id = person)))
      or exists (select 1 from gym_staff me join gym_staff s on s.gym_id = me.gym_id
                 where me.user_id = auth.uid() and me.active and s.user_id = person)
$$;
create or replace function private.can_manage_tc(tc_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_clients tc
                 where tc.id = tc_id
                   and (tc.trainer_id = auth.uid()
                        or (tc.gym_id is not null and private.has_gym_role(tc.gym_id, array['owner','admin']))))
$$;
create or replace function private.can_read_tc(tc_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_clients tc
                 where tc.id = tc_id
                   and (tc.trainer_id = auth.uid() or tc.client_id = auth.uid()
                        or (tc.gym_id is not null and private.has_gym_role(tc.gym_id, array['owner','admin','operator']))))
$$;

-- public functions that still call helpers
create or replace function public.apply_holiday(h uuid) returns int
language plpgsql security definer set search_path = public as $$
declare hol gym_holidays; n int; open_days int; closed smallint[];
begin
  select * into hol from gym_holidays where id = h;
  if hol is null then raise exception 'holiday not found'; end if;
  if not (private.has_gym_role(hol.gym_id, array['owner','admin']) or private.is_super_admin()) then
    raise exception 'not allowed';
  end if;
  if hol.applied_at is not null then return 0; end if;
  select coalesce(closed_weekdays, '{}') into closed from gyms where id = hol.gym_id;
  select count(*) into open_days from generate_series(hol.start_date, hol.end_date, interval '1 day') s(day)
   where not (extract(dow from s.day)::smallint = any(closed));
  update memberships ms set end_date = end_date + open_days
   where ms.gym_id = hol.gym_id and ms.end_date >= hol.start_date and ms.start_date <= hol.end_date;
  get diagnostics n = row_count;
  update pt_packages p set end_date = end_date + open_days
   where p.gym_id = hol.gym_id and p.end_date is not null and p.end_date >= hol.start_date;
  update gym_holidays set applied_at = now() where id = h;
  insert into audit_log(actor_id, gym_id, action, target, target_id, detail)
  values (auth.uid(), hol.gym_id, 'apply_holiday', 'gym_holidays', h::text, jsonb_build_object('days', open_days, 'memberships', n));
  return n;
end $$;

create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_super_admin() and auth.uid() is not null then
    if new.is_super_admin is distinct from old.is_super_admin
       or new.status is distinct from old.status
       or new.uid is distinct from old.uid
       or new.dev_note is distinct from old.dev_note then
      raise exception 'only super admin can change this field';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 2. Date helpers run with the caller's own rights (RLS applies)
alter function public.calc_end_date(uuid, date, int, int) security invoker;
alter function public.renewal_start(uuid, date)           security invoker;

-- 3. Nobody calls trigger functions directly; signed-out visitors call nothing
revoke execute on all functions in schema private from public, anon;
grant  execute on all functions in schema private to authenticated;
revoke execute on function public.handle_new_user()       from public, anon, authenticated;
revoke execute on function public.link_members_by_phone() from public, anon, authenticated;
revoke execute on function public.guard_profile()         from public, anon, authenticated;
revoke execute on function public.gym_add_owner()         from public, anon, authenticated;
revoke execute on function public.apply_holiday(uuid)                   from public, anon;
revoke execute on function public.calc_end_date(uuid, date, int, int)   from public, anon;
revoke execute on function public.renewal_start(uuid, date)             from public, anon;
grant execute on function public.apply_holiday(uuid)                   to authenticated;
grant execute on function public.calc_end_date(uuid, date, int, int)   to authenticated;
grant execute on function public.renewal_start(uuid, date)             to authenticated;
