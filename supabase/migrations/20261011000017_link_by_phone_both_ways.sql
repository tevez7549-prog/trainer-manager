-- Anyone can use the app on their own; the gym's record and the person's account meet by phone number,
-- whichever comes first.

-- 1. Gym adds (or fixes the phone of) a member who already has the app -> link right away
create or replace function public.members_set_phone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.phone_norm := public.norm_phone(new.phone, (select country_code from gyms where id = new.gym_id));
  if new.profile_id is null and new.phone_norm is not null then
    select p.id into new.profile_id from profiles p where p.phone_norm = new.phone_norm
       and not exists (select 1 from members x where x.gym_id = new.gym_id and x.profile_id = p.id and x.id <> new.id) limit 1;
  end if;
  return new;
end $$;

-- 2. Once a member record is linked, their PT links point at the account too
create or replace function public.members_link_pt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and new.profile_id is distinct from old.profile_id then
    update trainer_clients tc set client_id = new.profile_id
     where tc.member_id = new.id and tc.client_id is null
       and not exists (select 1 from trainer_clients x where x.trainer_id = tc.trainer_id and x.client_id = new.profile_id and x.status = 'active');
  end if;
  return new;
end $$;
create trigger members_link_pt after insert or update of profile_id on public.members
  for each row execute function public.members_link_pt();
revoke execute on function public.members_link_pt() from public, anon, authenticated;

-- 3. When the phones don't match (typo, new number), the counter links by the person's UID
create or replace function public.link_member_uid(m uuid, person_uid bigint)
returns json language plpgsql security definer set search_path = public as $$
declare mem members; p profiles;
begin
  select * into mem from members where id = m;
  if mem.id is null then raise exception 'member not found'; end if;
  if not private.has_gym_role(mem.gym_id, array['owner','admin','operator']) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into p from profiles where uid = person_uid;
  if p.id is null then raise exception 'uid not found' using errcode = 'P0002'; end if;
  if exists (select 1 from members where gym_id = mem.gym_id and profile_id = p.id and id <> m) then
    raise exception 'uid already linked in this gym';
  end if;
  update members set profile_id = p.id where id = m;
  insert into audit_log(actor_id, gym_id, action, target, target_id, detail)
  values (auth.uid(), mem.gym_id, 'link_member', 'members', m::text, jsonb_build_object('uid', p.uid));
  return json_build_object('display_name', p.display_name, 'uid', p.uid);
end $$;
revoke execute on function public.link_member_uid(uuid, bigint) from public, anon;
grant execute on function public.link_member_uid(uuid, bigint) to authenticated;

-- 4. Catch up anything already in the database
update public.members m set profile_id = p.id
  from public.profiles p where m.profile_id is null and m.phone_norm is not null and p.phone_norm = m.phone_norm
   and not exists (select 1 from public.members x where x.gym_id = m.gym_id and x.profile_id = p.id);
update public.trainer_clients tc set client_id = m.profile_id
  from public.members m where tc.member_id = m.id and tc.client_id is null and m.profile_id is not null
   and not exists (select 1 from public.trainer_clients x where x.trainer_id = tc.trainer_id and x.client_id = m.profile_id and x.status = 'active');

-- 5. Account side (sign-up or phone change): same guard, one member record per person per gym
create or replace function public.link_members_by_phone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_norm is not null then
    update members m set profile_id = new.id
     where m.phone_norm = new.phone_norm and m.profile_id is null
       and not exists (select 1 from members x where x.gym_id = m.gym_id and x.profile_id = new.id);
  end if;
  return new;
end $$;
