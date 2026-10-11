-- Counter features (11 Oct 2026): staff by UID, selling memberships, Excel import.

-- Member list for the counter: extra columns appended at the end (view columns can only be added at the end)
create or replace view public.member_status with (security_invoker = true) as
select m.id, m.gym_id, m.profile_id, m.code, m.name, m.phone, m.pt_only,
       cur.plan_name, cur.end_date,
       fr.end_date as frozen_until,
       case
         when m.pt_only then 'pt_only'
         when fr.end_date is not null then 'frozen'
         when cur.end_date is null then 'none'
         when cur.end_date < current_date then 'expired'
         when cur.end_date - current_date <= 7 then 'expiring'
         else 'active'
       end as status,
       cur.end_date - current_date as days_left,
       m.phone_norm, m.note, m.imported, m.created_at, cur.start_date
from public.members m
left join lateral (select plan_name, start_date, end_date from public.memberships x where x.member_id = m.id order by end_date desc limit 1) cur on true
left join lateral (select end_date from public.member_freezes f where f.member_id = m.id and current_date between f.start_date and f.end_date order by end_date desc limit 1) fr on true;

-- 1. Owner adds Admin / Operator / Trainer by the person's UID
create or replace function public.gym_add_staff(g uuid, staff_uid bigint, staff_role text)
returns json language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  if not (private.has_gym_role(g, array['owner']) or private.is_super_admin()) then
    raise exception 'only the gym owner can add staff' using errcode = '42501';
  end if;
  if staff_role not in ('admin', 'operator', 'trainer') then raise exception 'bad role: %', staff_role; end if;
  select * into p from profiles where uid = staff_uid;
  if p.id is null then raise exception 'uid not found' using errcode = 'P0002'; end if;
  if p.status <> 'active' then raise exception 'account suspended'; end if;
  if exists (select 1 from gym_staff where gym_id = g and user_id = p.id and role = 'owner') then
    raise exception 'already the owner';
  end if;
  insert into gym_staff(gym_id, user_id, role, active) values (g, p.id, staff_role, true)
  on conflict (gym_id, user_id) do update set role = excluded.role, active = true;
  insert into audit_log(actor_id, gym_id, action, target, target_id, detail)
  values (auth.uid(), g, 'add_staff', 'gym_staff', p.id::text, jsonb_build_object('uid', p.uid, 'role', staff_role));
  return json_build_object('user_id', p.id, 'uid', p.uid, 'display_name', p.display_name, 'role', staff_role);
end $$;

-- 2. Sell or renew a membership. The admin picks the start date; renewing early continues from the old end date.
create or replace function public.sell_membership(m uuid, plan uuid, start_on date default current_date,
                                                  pay text default 'cash', price_paid numeric default null)
returns public.memberships language plpgsql security definer set search_path = public as $$
declare mem members; pl membership_plans; s date; r memberships;
begin
  select * into mem from members where id = m;
  if mem.id is null then raise exception 'member not found'; end if;
  if not private.has_gym_role(mem.gym_id, array['owner', 'admin', 'operator']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into pl from membership_plans where id = plan and gym_id = mem.gym_id;
  if pl.id is null then raise exception 'plan not found'; end if;
  if pay not in ('cash', 'transfer', 'qr', 'free') then raise exception 'bad pay method'; end if;
  s := coalesce(start_on, current_date);
  s := greatest(s, coalesce((select max(end_date) + 1 from memberships where member_id = m), s));
  insert into memberships(member_id, gym_id, plan_id, plan_name, start_date, end_date, price, pay_method, sold_by)
  values (m, mem.gym_id, pl.id, pl.name, s, public.calc_end_date(mem.gym_id, s, pl.months, pl.days),
          coalesce(price_paid, pl.price), pay, auth.uid())
  returning * into r;
  if mem.pt_only then update members set pt_only = false where id = m; end if;
  insert into audit_log(actor_id, gym_id, action, target, target_id, detail)
  values (auth.uid(), mem.gym_id, 'sell_membership', 'memberships', r.id::text,
          jsonb_build_object('member', mem.code, 'plan', pl.name, 'start', r.start_date, 'end', r.end_date, 'price', r.price, 'pay', pay));
  return r;
end $$;

-- 3. Excel import (owner / admin). rows: [{name, phone, plan_name, start_date, end_date, pt_only, note}]
--    Same phone already in this gym → no new member; the membership is still added if it is new.
create or replace function public.import_members(g uuid, rows jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  cc text; r jsonb; i int := 0; mid uuid; pn text; s date; e date; nm text;
  added int := 0; existing int := 0; ms int := 0; errs jsonb := '[]'::jsonb;
begin
  if not (private.has_gym_role(g, array['owner', 'admin']) or private.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 5000 then
    raise exception 'rows must be a list of at most 5000';
  end if;
  select country_code into cc from gyms where id = g;
  for r in select * from jsonb_array_elements(rows) loop
    i := i + 1;
    begin
      nm := btrim(coalesce(r->>'name', ''));
      if nm = '' then raise exception 'ไม่มีชื่อ'; end if;
      pn := public.norm_phone(nullif(btrim(coalesce(r->>'phone', '')), ''), cc);
      e := nullif(r->>'end_date', '')::date;
      s := coalesce(nullif(r->>'start_date', '')::date, least(current_date, e));
      if e is not null and s > e then raise exception 'วันเริ่มอยู่หลังวันหมด'; end if;
      mid := null;
      if pn is not null then select id into mid from members where gym_id = g and phone_norm = pn; end if;
      if mid is null then
        insert into members(gym_id, name, phone, pt_only, note, imported, created_by)
        values (g, nm, nullif(btrim(coalesce(r->>'phone', '')), ''), coalesce((r->>'pt_only')::boolean, false),
                nullif(btrim(coalesce(r->>'note', '')), ''), true, auth.uid())
        returning id into mid;
        added := added + 1;
      else
        existing := existing + 1;
      end if;
      if e is not null and not exists (select 1 from memberships where member_id = mid and start_date = s and end_date = e) then
        insert into memberships(member_id, gym_id, plan_name, start_date, end_date, price, pay_method, sold_by)
        values (mid, g, coalesce(nullif(btrim(coalesce(r->>'plan_name', '')), ''), 'นำเข้า'), s, e, 0, 'import', auth.uid());
        ms := ms + 1;
      end if;
    exception when others then
      errs := errs || jsonb_build_object('row', i, 'name', r->>'name', 'error', sqlerrm);
    end;
  end loop;
  insert into audit_log(actor_id, gym_id, action, target, detail)
  values (auth.uid(), g, 'import_members', 'members',
          jsonb_build_object('rows', i, 'added', added, 'existing', existing, 'memberships', ms, 'errors', jsonb_array_length(errs)));
  return json_build_object('rows', i, 'added', added, 'existing', existing, 'memberships', ms, 'errors', errs);
end $$;

revoke execute on function public.gym_add_staff(uuid, bigint, text) from public, anon;
revoke execute on function public.sell_membership(uuid, uuid, date, text, numeric) from public, anon;
revoke execute on function public.import_members(uuid, jsonb) from public, anon;
grant execute on function public.gym_add_staff(uuid, bigint, text) to authenticated;
grant execute on function public.sell_membership(uuid, uuid, date, text, numeric) to authenticated;
grant execute on function public.import_members(uuid, jsonb) to authenticated;
