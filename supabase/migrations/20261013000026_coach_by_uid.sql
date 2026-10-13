-- Add a gym coach by the person's app UID (typed or scanned from their QR).
-- Reuses the gym's existing entry for that person, or an unlinked entry with the same phone, instead of making a duplicate.
create or replace function public.gym_add_coach_uid(g uuid, person_uid bigint, coach_name text default null)
returns json language plpgsql security definer set search_path = public as $$
declare p profiles; c gym_coaches; nm text;
begin
  if not (private.has_gym_role(g, array['owner','admin']) or private.is_super_admin()) then
    raise exception 'only the gym owner or admin can add trainers' using errcode = '42501';
  end if;
  select * into p from profiles where uid = person_uid;
  if p.id is null then raise exception 'uid not found' using errcode = 'P0002'; end if;
  if p.status <> 'active' then raise exception 'account suspended'; end if;
  nm := left(coalesce(nullif(trim(coach_name), ''), nullif(trim(p.display_name), ''), 'UID ' || p.uid), 60);

  select * into c from gym_coaches where gym_id = g and profile_id = p.id;
  if c.id is null and p.phone_norm is not null then
    select * into c from gym_coaches where gym_id = g and profile_id is null and phone_norm = p.phone_norm limit 1;
  end if;

  if c.id is not null then
    update gym_coaches set profile_id = p.id, active = true,
      name = case when nullif(trim(coach_name), '') is not null then nm else name end
     where id = c.id returning * into c;
    return json_build_object('id', c.id, 'name', c.name, 'display_name', p.display_name, 'uid', p.uid, 'existing', true);
  end if;

  insert into gym_coaches (gym_id, name, phone, profile_id) values (g, nm, p.phone, p.id) returning * into c;
  insert into audit_log(actor_id, gym_id, action, target, target_id, detail)
  values (auth.uid(), g, 'add_coach', 'gym_coaches', c.id::text, jsonb_build_object('uid', p.uid));
  return json_build_object('id', c.id, 'name', c.name, 'display_name', p.display_name, 'uid', p.uid, 'existing', false);
end $$;
revoke execute on function public.gym_add_coach_uid(uuid, bigint, text) from public, anon;
grant execute on function public.gym_add_coach_uid(uuid, bigint, text) to authenticated;
