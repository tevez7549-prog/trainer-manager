-- Freeze a membership: the days on hold are added back to the end date (and later renewals move too).

create or replace function public.freeze_member(m uuid, start_on date, end_on date, why text default null)
returns json language plpgsql security definer set search_path = public as $$
declare mem members; d int; n int; f member_freezes;
begin
  select * into mem from members where id = m;
  if mem.id is null then raise exception 'member not found'; end if;
  if not private.has_gym_role(mem.gym_id, array['owner', 'admin', 'operator']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if end_on < start_on then raise exception 'freeze end before start'; end if;
  if exists (select 1 from member_freezes x where x.member_id = m and daterange(x.start_date, x.end_date, '[]') && daterange(start_on, end_on, '[]')) then
    raise exception 'freeze overlaps';
  end if;
  if not exists (select 1 from memberships where member_id = m and end_date >= start_on) then
    raise exception 'no membership to freeze';
  end if;
  d := end_on - start_on + 1;
  update memberships set
    start_date = case when start_date > start_on then start_date + d else start_date end,
    end_date = end_date + d
  where member_id = m and end_date >= start_on;
  get diagnostics n = row_count;
  insert into member_freezes(member_id, gym_id, start_date, end_date, reason, created_by)
  values (m, mem.gym_id, start_on, end_on, nullif(btrim(coalesce(why, '')), ''), auth.uid()) returning * into f;
  insert into audit_log(actor_id, gym_id, action, target, target_id, detail)
  values (auth.uid(), mem.gym_id, 'freeze_member', 'members', m::text, jsonb_build_object('member', mem.code, 'start', start_on, 'end', end_on, 'days', d));
  return json_build_object('id', f.id, 'days', d, 'memberships', n,
                           'new_end', (select max(end_date) from memberships where member_id = m));
end $$;

-- End a freeze early (or cancel one that hasn't started): unused days come off the end date again.
create or replace function public.end_freeze(f uuid)
returns json language plpgsql security definer set search_path = public as $$
declare fr member_freezes; new_end date; unused int;
begin
  select * into fr from member_freezes where id = f;
  if fr.id is null then raise exception 'freeze not found'; end if;
  if not private.has_gym_role(fr.gym_id, array['owner', 'admin', 'operator']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if fr.end_date < current_date then raise exception 'freeze already over'; end if;
  new_end := current_date - 1;                       -- the member is back today
  unused := fr.end_date - greatest(new_end, fr.start_date - 1);
  update memberships set
    start_date = case when start_date > fr.end_date then start_date - unused else start_date end,   -- renewals pushed past the freeze
    end_date = end_date - unused
  where member_id = fr.member_id and end_date >= fr.start_date;
  if new_end < fr.start_date then delete from member_freezes where id = f;
  else update member_freezes set end_date = new_end where id = f; end if;
  insert into audit_log(actor_id, gym_id, action, target, target_id, detail)
  values (auth.uid(), fr.gym_id, 'end_freeze', 'members', fr.member_id::text, jsonb_build_object('days_returned', unused));
  return json_build_object('days', unused, 'new_end', (select max(end_date) from memberships where member_id = fr.member_id));
end $$;

revoke execute on function public.freeze_member(uuid, date, date, text) from public, anon;
revoke execute on function public.end_freeze(uuid) from public, anon;
grant execute on function public.freeze_member(uuid, date, date, text) to authenticated;
grant execute on function public.end_freeze(uuid) to authenticated;
