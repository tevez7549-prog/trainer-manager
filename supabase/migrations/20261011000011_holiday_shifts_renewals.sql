-- A gym holiday now also pushes back renewals that follow straight on from an extended membership
-- (before, the renewal kept its start date and the member lost the extra days).
create or replace function public.apply_holiday(h uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  hol gym_holidays; n int := 0; open_days int; closed smallint[];
  r record; cur_member uuid := null; shift int := 0; prev_end date;
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

  -- walk each member's memberships in order; one that overlaps the holiday gets longer,
  -- and the ones that continue straight after it move back by the same number of days
  for r in select id, member_id, start_date, end_date from memberships
            where gym_id = hol.gym_id and end_date >= hol.start_date
            order by member_id, start_date loop
    if cur_member is distinct from r.member_id then cur_member := r.member_id; shift := 0; prev_end := null; end if;
    if shift > 0 and r.start_date <= prev_end + 1 then
      prev_end := r.end_date;
      update memberships set start_date = start_date + shift, end_date = end_date + shift where id = r.id;
      n := n + 1;
    elsif r.start_date <= hol.end_date then
      prev_end := r.end_date;
      shift := open_days;
      update memberships set end_date = end_date + open_days where id = r.id;
      n := n + 1;
    else
      shift := 0; prev_end := r.end_date;
    end if;
  end loop;

  update pt_packages p set end_date = end_date + open_days
   where p.gym_id = hol.gym_id and p.end_date is not null and p.end_date >= hol.start_date;
  update gym_holidays set applied_at = now() where id = h;
  insert into audit_log(actor_id, gym_id, action, target, target_id, detail)
  values (auth.uid(), hol.gym_id, 'apply_holiday', 'gym_holidays', h::text, jsonb_build_object('days', open_days, 'memberships', n));
  return n;
end $$;
