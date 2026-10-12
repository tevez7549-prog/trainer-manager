-- Groups: couples, families, friends who train together (max 20 people), joined with a 6-character code.
-- The feed, weekly board and nudges come from members' own workouts through the functions below,
-- so nobody's private data opens up beyond "who trained, what, how much".
-- "Looking after" someone keeps using trainer_clients (programs, targets, food comments); a person added
-- without the app can later be linked by phone, but only after they accept.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  kind text not null default 'friends' check (kind in ('couple', 'family', 'friends')),
  code text not null unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);
create table if not exists public.group_cheers (
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workout_id, user_id)
);
create table if not exists public.group_nudges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists group_nudges_to_idx on public.group_nudges (to_user, created_at desc);

create or replace function private.in_group(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid())
$$;
create or replace function private.shares_group(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members a join group_members b on a.group_id = b.group_id
                  where a.user_id = auth.uid() and b.user_id = person)
$$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_cheers enable row level security;
alter table public.group_nudges enable row level security;
create policy groups_read on public.groups for select to authenticated using (private.in_group(id));
create policy groups_owner_edit on public.groups for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy group_members_read on public.group_members for select to authenticated using (private.in_group(group_id));
create policy group_members_leave on public.group_members for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy cheers_read on public.group_cheers for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from workouts w where w.id = workout_id and (w.user_id = auth.uid() or private.shares_group(w.user_id))));
create policy cheers_write on public.group_cheers for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from workouts w where w.id = workout_id and private.shares_group(w.user_id)));
create policy cheers_undo on public.group_cheers for delete to authenticated using (user_id = auth.uid());
create policy nudges_read on public.group_nudges for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());
create policy nudges_seen on public.group_nudges for update to authenticated using (to_user = auth.uid()) with check (to_user = auth.uid());

-- Make a group; the maker is its first member. Code: 6 letters/digits that are easy to read aloud.
create or replace function public.create_group(gname text, gkind text default 'friends')
returns json language plpgsql security definer set search_path = public, extensions as $$
declare c text; g groups; abc text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from groups where owner_id = auth.uid()) >= 20 then raise exception 'too many groups'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from groups where code = c);
  end loop;
  insert into groups (name, kind, code, owner_id) values (trim(gname), coalesce(gkind, 'friends'), c, auth.uid()) returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  return json_build_object('id', g.id, 'code', g.code);
end $$;

-- Join with a code (spaces, dashes and case ignored); at most 20 people in a group
create or replace function public.join_group(gcode text)
returns json language plpgsql security definer set search_path = public as $$
declare g groups; n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into g from groups where code = upper(regexp_replace(coalesce(gcode, ''), '[^A-Za-z0-9]', '', 'g'));
  if g.id is null then raise exception 'group code not found' using errcode = 'P0002'; end if;
  if exists (select 1 from group_members where group_id = g.id and user_id = auth.uid()) then
    return json_build_object('id', g.id, 'name', g.name, 'already', true);
  end if;
  select count(*) into n from group_members where group_id = g.id;
  if n >= 20 then raise exception 'group is full'; end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  return json_build_object('id', g.id, 'name', g.name, 'already', false);
end $$;

-- Members with names, uid (to offer "look after"), and their latest workout
create or replace function public.group_people(g uuid)
returns table (user_id uuid, uid bigint, display_name text, is_owner boolean, joined_at timestamptz, last_workout timestamptz, i_care boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.uid, p.display_name, gr.owner_id = m.user_id, m.joined_at,
         (select max(w.started_at) from workouts w where w.user_id = m.user_id),
         exists (select 1 from trainer_clients tc where tc.trainer_id = auth.uid() and tc.client_id = m.user_id and tc.status = 'active')
    from group_members m join profiles p on p.id = m.user_id join groups gr on gr.id = m.group_id
   where m.group_id = g and private.in_group(g)
   order by m.joined_at
$$;

-- The feed: members' workouts, newest first, with a short summary and cheers
create or replace function public.group_feed(g uuid, lim int default 30)
returns table (workout_id uuid, user_id uuid, display_name text, title text, started_at timestamptz, ended_at timestamptz,
               moves int, sets int, volume numeric, cheers int, cheered boolean)
language sql stable security definer set search_path = public as $$
  select w.id, w.user_id, p.display_name, w.title, w.started_at, w.ended_at,
         (select count(distinct coalesce(s.exercise_id::text, s.exercise_name))::int from workout_sets s where s.workout_id = w.id),
         (select count(*)::int from workout_sets s where s.workout_id = w.id),
         (select coalesce(sum(coalesce(s.reps, 0) * coalesce(s.weight_kg, 0)), 0) from workout_sets s where s.workout_id = w.id),
         (select count(*)::int from group_cheers c where c.workout_id = w.id),
         exists (select 1 from group_cheers c where c.workout_id = w.id and c.user_id = auth.uid())
    from workouts w join group_members m on m.user_id = w.user_id and m.group_id = g join profiles p on p.id = w.user_id
   where private.in_group(g) and w.started_at > now() - interval '30 days'
   order by w.started_at desc
   limit least(greatest(lim, 1), 100)
$$;

-- Days (Bangkok time) each member trained in the last 60 days: the app works out streaks and the weekly board
create or replace function public.group_days(g uuid)
returns table (user_id uuid, day date)
language sql stable security definer set search_path = public as $$
  select distinct w.user_id, (w.started_at at time zone 'Asia/Bangkok')::date
    from workouts w join group_members m on m.user_id = w.user_id and m.group_id = g
   where private.in_group(g) and w.started_at > now() - interval '60 days'
$$;

-- Nudge someone in the same group (once per 12 hours per person)
create or replace function public.nudge(g uuid, person uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not private.in_group(g) or not exists (select 1 from group_members where group_id = g and user_id = person) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if person = auth.uid() then raise exception 'cannot nudge yourself'; end if;
  if exists (select 1 from group_nudges where from_user = auth.uid() and to_user = person and created_at > now() - interval '12 hours') then
    return json_build_object('sent', false);
  end if;
  insert into group_nudges (group_id, from_user, to_user) values (g, auth.uid(), person);
  return json_build_object('sent', true);
end $$;

-- Nudges for me that I have not seen yet
create or replace function public.my_nudges()
returns table (id uuid, group_id uuid, group_name text, from_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, n.group_id, g.name, p.display_name, n.created_at
    from group_nudges n join groups g on g.id = n.group_id join profiles p on p.id = n.from_user
   where n.to_user = auth.uid() and n.seen_at is null and n.created_at > now() - interval '3 days'
   order by n.created_at desc limit 5
$$;

-- "Look after" a person added without the app (an invite of kind 'client' carrying tc_id): when someone with that phone signs up (or sets the phone),
-- they get a request to accept; only then does the record become theirs.
alter table public.invites add column if not exists tc_id uuid references public.trainer_clients(id) on delete cascade;

create or replace function public.offer_care_links(person uuid, phone text) returns void
language sql security definer set search_path = public as $$
  insert into invites (from_user, kind, to_user, tc_id, expires_at)
  select tc.trainer_id, 'client', person, tc.id, now() + interval '30 days'
    from trainer_clients tc
   where phone is not null and tc.client_phone = phone and tc.client_id is null and tc.status = 'active' and tc.trainer_id <> person
     and not exists (select 1 from invites i where i.tc_id = tc.id and i.to_user = person and i.status in ('pending', 'declined'))
$$;
revoke execute on function public.offer_care_links(uuid, text) from public, anon, authenticated;

create or replace function public.profiles_offer_care() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_norm is not null and new.phone_norm is distinct from coalesce(old.phone_norm, '') then
    perform public.offer_care_links(new.id, new.phone_norm);
  end if;
  return new;
end $$;
create or replace trigger profiles_offer_care after insert or update of phone on public.profiles
  for each row execute function public.profiles_offer_care();
revoke execute on function public.profiles_offer_care() from public, anon, authenticated;

create or replace function public.tc_offer_care() returns trigger
language plpgsql security definer set search_path = public as $$
declare p uuid;
begin
  if new.client_id is null and new.client_phone is not null then
    select id into p from profiles where phone_norm = new.client_phone limit 1;
    if p is not null then perform public.offer_care_links(p, new.client_phone); end if;
  end if;
  return new;
end $$;
create or replace trigger tc_offer_care after insert or update of client_phone on public.trainer_clients
  for each row execute function public.tc_offer_care();
revoke execute on function public.tc_offer_care() from public, anon, authenticated;

create or replace function public.answer_invite(i uuid, accept boolean)
returns json language plpgsql security definer set search_path = public as $$
declare inv invites;
begin
  select * into inv from invites where id = i and to_user = auth.uid() for update;
  if inv.id is null then raise exception 'invite not found'; end if;
  if inv.status <> 'pending' then raise exception 'invite already answered'; end if;
  if inv.expires_at <= now() then
    update invites set status = 'expired' where id = i;
    raise exception 'invite expired';
  end if;
  if accept then
    if inv.kind = 'client' and inv.tc_id is not null then
      -- someone recorded for this person before they had the app: the record becomes theirs
      update trainer_clients set client_id = auth.uid() where id = inv.tc_id and client_id is null;
    elsif inv.kind = 'client' then
      insert into trainer_clients(trainer_id, client_id, gym_id) values (inv.from_user, auth.uid(), inv.gym_id)
      on conflict do nothing;
    end if;
    update invites set status = 'accepted', accepted_by = auth.uid() where id = i;
  else
    update invites set status = 'declined' where id = i;
  end if;
  return json_build_object('status', case when accept then 'accepted' else 'declined' end);
end $$;

revoke execute on function public.create_group(text, text), public.join_group(text), public.group_people(uuid), public.group_feed(uuid, int),
  public.group_days(uuid), public.nudge(uuid, uuid), public.my_nudges() from public, anon;
grant execute on function public.create_group(text, text), public.join_group(text), public.group_people(uuid), public.group_feed(uuid, int),
  public.group_days(uuid), public.nudge(uuid, uuid), public.my_nudges() to authenticated;
