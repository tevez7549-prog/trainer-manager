-- Group classes (yoga, HIIT, body combat ...): one row per class time, and who is in it.
-- Repeating classes are written as separate rows (like PT appointments), so each date can be moved or cancelled on its own.
create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  coach_id uuid references public.gym_coaches(id) on delete set null,
  starts_at timestamptz not null,
  duration_min smallint not null default 60 check (duration_min between 15 and 240),
  capacity smallint check (capacity is null or capacity between 1 and 500),
  note text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  series_id uuid,                                    -- same id for a weekly series, to cancel the rest in one go
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists class_sessions_gym_time on public.class_sessions (gym_id, starts_at);

create table if not exists public.class_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  guest_name text,                                    -- someone who isn't a member (walk-in for the class)
  status text not null default 'booked' check (status in ('booked', 'attended', 'noshow')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (member_id is not null or length(trim(coalesce(guest_name, ''))) > 0),
  unique (session_id, member_id)
);
create index if not exists class_bookings_session on public.class_bookings (session_id);

alter table public.class_sessions enable row level security;
alter table public.class_bookings enable row level security;

-- gym staff run classes; the coach teaching it (with the app) and members of the gym can see the timetable
create policy staff_classes on public.class_sessions for all
  using (private.has_gym_role(gym_id, array['owner','admin','operator']))
  with check (private.has_gym_role(gym_id, array['owner','admin','operator']));
create policy read_classes on public.class_sessions for select using (
  private.has_gym_role(gym_id, array['trainer'])
  or exists (select 1 from public.gym_coaches c where c.id = class_sessions.coach_id and c.profile_id = auth.uid())
  or exists (select 1 from public.members m where m.gym_id = class_sessions.gym_id and m.profile_id = auth.uid()));
create policy super_admin_all on public.class_sessions for all using (private.is_super_admin()) with check (private.is_super_admin());

create policy staff_bookings on public.class_bookings for all
  using (exists (select 1 from public.class_sessions s where s.id = session_id and private.has_gym_role(s.gym_id, array['owner','admin','operator'])))
  with check (exists (select 1 from public.class_sessions s where s.id = session_id and private.has_gym_role(s.gym_id, array['owner','admin','operator'])));
create policy read_bookings on public.class_bookings for select using (
  exists (select 1 from public.members m where m.id = member_id and m.profile_id = auth.uid())
  or exists (select 1 from public.class_sessions s join public.gym_coaches c on c.id = s.coach_id where s.id = session_id and c.profile_id = auth.uid()));
create policy super_admin_all on public.class_bookings for all using (private.is_super_admin()) with check (private.is_super_admin());
