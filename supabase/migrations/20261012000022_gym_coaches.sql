-- Gym coaches: the gym lists its trainers by name, with or without the app.
-- A coach whose phone matches an account (now or later) is linked and sees their own PT schedule.
-- PT links and sessions carry coach_id so the gym can see each coach's free time.

create table if not exists public.gym_coaches (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  phone text,
  phone_norm text,
  profile_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists gym_coaches_profile_uq on public.gym_coaches (gym_id, profile_id) where profile_id is not null;
create index if not exists gym_coaches_phone_idx on public.gym_coaches (phone_norm);

create or replace function public.gym_coaches_set_phone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.phone_norm := public.norm_phone(new.phone, (select country_code from gyms where id = new.gym_id));
  if new.profile_id is null and new.phone_norm is not null then
    select p.id into new.profile_id from profiles p where p.phone_norm = new.phone_norm
       and not exists (select 1 from gym_coaches c where c.gym_id = new.gym_id and c.profile_id = p.id and c.id <> new.id) limit 1;
  end if;
  return new;
end $$;
create or replace trigger gym_coaches_set_phone before insert or update of phone on public.gym_coaches
  for each row execute function public.gym_coaches_set_phone();
revoke execute on function public.gym_coaches_set_phone() from public, anon, authenticated;

-- account side: signing up (or changing phone) links any gym coach entry with that phone
create or replace function public.profiles_link_coach() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_norm is not null then
    update gym_coaches c set profile_id = new.id
     where c.phone_norm = new.phone_norm and c.profile_id is null
       and not exists (select 1 from gym_coaches x where x.gym_id = c.gym_id and x.profile_id = new.id);
  end if;
  return new;
end $$;
create or replace trigger profiles_link_coach after insert or update of phone on public.profiles
  for each row execute function public.profiles_link_coach();
revoke execute on function public.profiles_link_coach() from public, anon, authenticated;

alter table public.gym_coaches enable row level security;
create policy coaches_read on public.gym_coaches for select to authenticated
  using (profile_id = auth.uid() or private.has_gym_role(gym_id, array['owner','admin','operator']));
create policy coaches_write on public.gym_coaches for all to authenticated
  using (private.has_gym_role(gym_id, array['owner','admin'])) with check (private.has_gym_role(gym_id, array['owner','admin']));

alter table public.trainer_clients add column if not exists coach_id uuid references public.gym_coaches(id) on delete set null;
alter table public.appointments add column if not exists coach_id uuid references public.gym_coaches(id) on delete set null;
create index if not exists appointments_coach_idx on public.appointments (coach_id, starts_at);

-- a session takes its coach from the PT link
create or replace function public.appointments_coach() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.coach_id is null then
    select coach_id into new.coach_id from trainer_clients where id = new.trainer_client_id;
  end if;
  return new;
end $$;
create or replace trigger appointments_coach before insert on public.appointments
  for each row execute function public.appointments_coach();
revoke execute on function public.appointments_coach() from public, anon, authenticated;

-- catch up: every gym trainer (and owner/admin who has PT clients there) becomes a coach entry
insert into public.gym_coaches (gym_id, name, phone, profile_id)
select distinct s.gym_id, p.display_name, p.phone, s.user_id
  from gym_staff s join profiles p on p.id = s.user_id
 where s.active and (s.role = 'trainer' or exists (select 1 from trainer_clients tc where tc.gym_id = s.gym_id and tc.trainer_id = s.user_id))
   and not exists (select 1 from gym_coaches c where c.gym_id = s.gym_id and c.profile_id = s.user_id);
update public.trainer_clients tc set coach_id = c.id
  from public.gym_coaches c where tc.coach_id is null and tc.gym_id = c.gym_id and c.profile_id = tc.trainer_id;
update public.appointments a set coach_id = tc.coach_id
  from public.trainer_clients tc where a.coach_id is null and a.trainer_client_id = tc.id and tc.coach_id is not null;

-- Sell a PT package with a coach from the gym's list. A coach without the app is kept under the seller's account
-- (trainer_id) with coach_id naming the real coach; once the coach links, they see the schedule through coach_id.
create or replace function public.sell_pt_coach(m uuid, plan uuid, coach uuid, pay text default 'cash', price_paid numeric default null)
returns json language plpgsql security definer set search_path = public as $$
declare mem members; pl pt_plans; co gym_coaches; tc_id uuid; pk pt_packages; holder uuid;
begin
  select * into mem from members where id = m;
  if mem.id is null then raise exception 'member not found'; end if;
  if not private.has_gym_role(mem.gym_id, array['owner','admin','operator']) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into pl from pt_plans where id = plan and gym_id = mem.gym_id;
  if pl.id is null then raise exception 'pt plan not found'; end if;
  select * into co from gym_coaches where id = coach and gym_id = mem.gym_id and active;
  if co.id is null then raise exception 'trainer not in this gym'; end if;
  if pay not in ('cash','transfer','qr','free') then raise exception 'bad pay: %', pay; end if;
  if price_paid is not null and price_paid < 0 then raise exception 'bad price'; end if;
  holder := coalesce(co.profile_id, auth.uid());

  select id into tc_id from trainer_clients where member_id = m and coach_id = co.id and status = 'active' limit 1;
  -- an older PT link of a coach with the app (made before coach entries existed) is reused
  if tc_id is null and co.profile_id is not null then
    select id into tc_id from trainer_clients where trainer_id = holder and member_id = m and status = 'active' and coach_id is null limit 1;
    if tc_id is not null then update trainer_clients set coach_id = co.id where id = tc_id; end if;
  end if;
  if tc_id is null and mem.profile_id is not null and co.profile_id is not null then
    select id into tc_id from trainer_clients where trainer_id = holder and client_id = mem.profile_id and status = 'active' limit 1;
    if tc_id is not null then update trainer_clients set member_id = m, gym_id = mem.gym_id, coach_id = co.id where id = tc_id; end if;
  end if;
  if tc_id is null then
    insert into trainer_clients(trainer_id, client_id, member_id, gym_id, coach_id, client_name)
    -- coach without the app: the member still sees it through their member record, so no client_id here
    values (holder, case when co.profile_id is not null then mem.profile_id end, m, mem.gym_id, co.id, mem.name)
    returning id into tc_id;
  end if;

  insert into pt_packages(trainer_client_id, gym_id, label, sessions_total, start_date, end_date, price, sold_by)
  values (tc_id, mem.gym_id, pl.name, pl.sessions, current_date,
          case when pl.months > 0 then (current_date + make_interval(months => pl.months))::date - 1 end,
          coalesce(price_paid, pl.price), auth.uid())
  returning * into pk;

  insert into audit_log(actor_id, gym_id, action, target, target_id, detail)
  values (auth.uid(), mem.gym_id, 'sell_pt', 'pt_packages', pk.id::text,
          jsonb_build_object('member', m, 'coach', co.id, 'coach_name', co.name, 'plan', pl.name, 'sessions', pl.sessions, 'price', pk.price, 'pay', pay));
  return json_build_object('package_id', pk.id, 'trainer_client_id', tc_id, 'label', pk.label, 'end_date', pk.end_date);
end $$;

-- A coach's own sessions (any gym where their account is linked), with the member's name and session count
create or replace function public.my_coach_schedule(d_from date, d_to date)
returns table (appointment_id uuid, starts_at timestamptz, duration_min smallint, status text, gym_name text, client text,
               used int, total int)
language sql stable security definer set search_path = public as $$
  select a.id, a.starts_at, a.duration_min, a.status, g.name,
         coalesce(mb.name, tc.client_name, pr.display_name, '–'),
         (select count(*)::int from appointments x where x.trainer_client_id = tc.id and x.status = 'done'),
         (select coalesce(sum(p.sessions_total), 0)::int from pt_packages p where p.trainer_client_id = tc.id)
    from appointments a
    join gym_coaches c on c.id = a.coach_id and c.profile_id = auth.uid()
    join trainer_clients tc on tc.id = a.trainer_client_id
    join gyms g on g.id = c.gym_id
    left join members mb on mb.id = tc.member_id
    left join profiles pr on pr.id = tc.client_id
   where a.starts_at >= d_from::timestamptz and a.starts_at < (d_to + 1)::timestamptz and a.status <> 'cancelled'
   order by a.starts_at
$$;

revoke execute on function public.sell_pt_coach(uuid, uuid, uuid, text, numeric), public.my_coach_schedule(date, date) from public, anon;
grant execute on function public.sell_pt_coach(uuid, uuid, uuid, text, numeric), public.my_coach_schedule(date, date) to authenticated;
