-- Gym PT plans, sold at the counter like a membership: pick a plan and a trainer.
create table public.pt_plans (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  name        text not null,
  sessions    smallint not null check (sessions > 0),
  months      smallint not null default 0 check (months >= 0),   -- 0 = no expiry
  price       numeric(10,2) not null check (price >= 0),
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index on public.pt_plans(gym_id);
alter table public.pt_plans enable row level security;
create policy read_pt_plans on public.pt_plans for select to authenticated using (private.gym_role(gym_id) is not null);
create policy manage_pt_plans on public.pt_plans for all to authenticated
  using (private.has_gym_role(gym_id, array['owner','admin'])) with check (private.has_gym_role(gym_id, array['owner','admin']));
grant select, insert, update, delete on public.pt_plans to authenticated;

-- A member can see their own PT (packages, appointments) even when the link was made before they had the app
create or replace function private.can_read_tc(tc_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_clients tc
                 where tc.id = tc_id
                   and (tc.trainer_id = auth.uid() or tc.client_id = auth.uid()
                        or (tc.gym_id is not null and private.has_gym_role(tc.gym_id, array['owner','admin','operator']))
                        or exists (select 1 from members m where m.id = tc.member_id and m.profile_id = auth.uid())))
$$;

-- Sell a PT plan to a gym member with a chosen trainer (owner, admin or trainer of the gym)
create or replace function public.sell_pt(m uuid, plan uuid, trainer uuid, pay text default 'cash', price_paid numeric default null)
returns json language plpgsql security definer set search_path = public as $$
declare mem members; pl pt_plans; tc_id uuid; pk pt_packages;
begin
  select * into mem from members where id = m;
  if mem.id is null then raise exception 'member not found'; end if;
  if not private.has_gym_role(mem.gym_id, array['owner','admin','operator']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into pl from pt_plans where id = plan and gym_id = mem.gym_id;
  if pl.id is null then raise exception 'pt plan not found'; end if;
  if not exists (select 1 from gym_staff where gym_id = mem.gym_id and user_id = trainer and active and role in ('owner','admin','trainer')) then
    raise exception 'trainer not in this gym';
  end if;
  if pay not in ('cash','transfer','qr','free') then raise exception 'bad pay: %', pay; end if;
  if price_paid is not null and price_paid < 0 then raise exception 'bad price'; end if;

  select id into tc_id from trainer_clients where trainer_id = trainer and member_id = m and status = 'active' limit 1;
  if tc_id is null and mem.profile_id is not null then
    select id into tc_id from trainer_clients where trainer_id = trainer and client_id = mem.profile_id and status = 'active' limit 1;
    if tc_id is not null then update trainer_clients set member_id = m, gym_id = mem.gym_id where id = tc_id; end if;
  end if;
  if tc_id is null then
    insert into trainer_clients(trainer_id, client_id, member_id, gym_id) values (trainer, mem.profile_id, m, mem.gym_id)
    returning id into tc_id;
  end if;

  insert into pt_packages(trainer_client_id, gym_id, label, sessions_total, start_date, end_date, price, sold_by)
  values (tc_id, mem.gym_id, pl.name, pl.sessions, current_date,
          case when pl.months > 0 then (current_date + make_interval(months => pl.months))::date - 1 end,
          coalesce(price_paid, pl.price), auth.uid())
  returning * into pk;

  insert into audit_log(actor_id, gym_id, action, target, target_id, detail)
  values (auth.uid(), mem.gym_id, 'sell_pt', 'pt_packages', pk.id::text,
          jsonb_build_object('member', m, 'trainer', trainer, 'plan', pl.name, 'sessions', pl.sessions, 'price', pk.price, 'pay', pay));
  return json_build_object('package_id', pk.id, 'trainer_client_id', tc_id, 'label', pk.label, 'end_date', pk.end_date);
end $$;
revoke execute on function public.sell_pt(uuid, uuid, uuid, text, numeric) from public, anon;
grant execute on function public.sell_pt(uuid, uuid, uuid, text, numeric) to authenticated;
