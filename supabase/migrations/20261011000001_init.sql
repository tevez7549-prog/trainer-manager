-- Trainer Manager · initial schema (v1)
-- Target: Supabase (Postgres 15+). Run once on an empty project.
-- Privacy rules (decided 10 Oct 2026):
--   * Body photos, measurements, food and workouts: visible to the person, their active trainer,
--     the owner of a gym they belong to, and super admins. Never to other trainers, admins or operators.
--   * Trainers only see their own trainees.
--   * Everyone consents to PDPA; no age-based rules.

create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- 1. People
-- =====================================================================
create sequence public.profile_uid_seq start 100001;

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  uid             bigint not null unique default nextval('public.profile_uid_seq'),
  display_name    text not null default '',
  phone           text,
  phone_norm      text generated always as (nullif(regexp_replace(coalesce(phone,''), '\D', '', 'g'), '')) stored,
  email           text,
  birth_date      date,
  sex             text check (sex in ('male','female','other')),
  height_cm       numeric(5,1),
  is_super_admin  boolean not null default false,
  status          text not null default 'active' check (status in ('active','suspended')),
  dev_note        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index profiles_phone_uq on public.profiles(phone_norm) where phone_norm is not null;
create unique index profiles_email_uq on public.profiles(lower(email)) where email is not null;

-- Paid modes: everyone is a user; trainer and gym are extra modes with their own plan.
create table public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  kind               text not null check (kind in ('user','trainer','gym')),
  gym_id             uuid,                       -- set for kind = 'gym'
  status             text not null default 'trial' check (status in ('trial','active','expired','cancelled')),
  trial_ends_at      date,
  current_period_end date,
  created_at         timestamptz not null default now()
);
create index on public.subscriptions(user_id);

create table public.consents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  doc          text not null default 'pdpa',
  version      text not null,
  accepted_at  timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index on public.consents(user_id);

-- =====================================================================
-- 2. Gyms
-- =====================================================================
create table public.gyms (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  branch           text,
  address          text,
  lat              double precision,
  lng              double precision,
  phone            text,
  open_hours       jsonb,                         -- {"mon":["06:00","22:00"], ...}
  closed_weekdays  smallint[] not null default '{}', -- 0 = Sunday ... 6 = Saturday
  walkin_price     numeric(10,2) not null default 0,
  is_public        boolean not null default true,  -- shown in "find gym near me"
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);
alter table public.subscriptions add constraint subscriptions_gym_fk foreign key (gym_id) references public.gyms(id) on delete cascade;

create table public.gym_staff (
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('owner','admin','operator','trainer')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (gym_id, user_id)
);
create index on public.gym_staff(user_id);

create table public.gym_holidays (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  applied_at  timestamptz,                      -- when expiry dates were pushed back
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table public.membership_plans (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  name       text not null,                     -- 1 เดือน, 3 เดือน ...
  months     smallint not null default 0,
  days       smallint not null default 0,
  price      numeric(10,2) not null,
  active     boolean not null default true,
  sort       smallint not null default 0,
  created_at timestamptz not null default now(),
  check (months > 0 or days > 0)
);

-- A person's record inside one gym. Works with or without the app (profile_id null = no app).
create sequence public.member_code_seq start 1;
create table public.members (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  code        text not null default ('M-' || lpad(nextval('public.member_code_seq')::text, 4, '0')),
  name        text not null,
  phone       text,
  phone_norm  text generated always as (nullif(regexp_replace(coalesce(phone,''), '\D', '', 'g'), '')) stored,
  pt_only     boolean not null default false,   -- trains with PT only, no gym membership
  note        text,
  imported    boolean not null default false,   -- came from the Excel import
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (gym_id, code)
);
create unique index members_gym_phone_uq on public.members(gym_id, phone_norm) where phone_norm is not null;
create unique index members_gym_profile_uq on public.members(gym_id, profile_id) where profile_id is not null;

create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  plan_id     uuid references public.membership_plans(id) on delete set null,
  plan_name   text not null,                    -- snapshot, prices change later
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  price       numeric(10,2) not null default 0,
  pay_method  text check (pay_method in ('cash','transfer','qr','import','free')),
  sold_by     uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index on public.memberships(member_id, end_date desc);

create table public.member_freezes (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  reason      text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table public.checkins (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  kind        text not null default 'member' check (kind in ('member','pt')),
  checked_at  timestamptz not null default now(),
  by_staff    uuid references public.profiles(id),
  client_ref  uuid unique                       -- set by the counter when saved offline; stops double sync
);
create index on public.checkins(gym_id, checked_at desc);

create table public.walkins (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  at          timestamptz not null default now(),
  price       numeric(10,2) not null,
  pay_method  text not null default 'cash' check (pay_method in ('cash','transfer','qr')),
  note        text,                             -- e.g. "brought by outside trainer"
  by_staff    uuid references public.profiles(id),
  client_ref  uuid unique
);
create index on public.walkins(gym_id, at desc);

-- =====================================================================
-- 3. Trainers, trainees, PT packages, appointments
-- =====================================================================
create table public.trainer_profiles (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  bio              text,
  certifications   text,
  specialties      text[] not null default '{}',
  service_area     text,
  lat              double precision,
  lng              double precision,
  contact_line     text,
  contact_phone    text,
  contact_facebook text,
  contact_instagram text,
  default_duration smallint not null default 60 check (default_duration in (30,45,60,90)),
  is_public        boolean not null default false,
  updated_at       timestamptz not null default now()
);

-- "Friend" link between a trainer and a trainee. Removing it never deletes the trainee's account.
create table public.trainer_clients (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.profiles(id) on delete cascade,
  client_id   uuid references public.profiles(id) on delete cascade,  -- null = trainee without the app
  member_id   uuid references public.members(id) on delete set null,   -- gym record, if any
  gym_id      uuid references public.gyms(id) on delete set null,      -- null = freelance
  goal        text,
  status      text not null default 'active' check (status in ('active','removed')),
  created_at  timestamptz not null default now(),
  removed_at  timestamptz,
  check (client_id is not null or member_id is not null)
);
create unique index trainer_clients_active_uq on public.trainer_clients(trainer_id, client_id) where status = 'active' and client_id is not null;
create index on public.trainer_clients(client_id);
create index on public.trainer_clients(gym_id);

-- Price list per trainer (gym trainers: set by owner/admin; freelancers: set by themselves)
create table public.pt_prices (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.profiles(id) on delete cascade,
  gym_id      uuid references public.gyms(id) on delete cascade,
  sessions    smallint not null check (sessions > 0),
  months      smallint not null default 0,      -- 0 = no expiry
  price       numeric(10,2) not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.pt_packages (
  id                uuid primary key default gen_random_uuid(),
  trainer_client_id uuid not null references public.trainer_clients(id) on delete cascade,
  gym_id            uuid references public.gyms(id) on delete set null,
  label             text not null,              -- "20 ครั้ง / 3 เดือน"
  sessions_total    smallint not null check (sessions_total > 0),
  start_date        date not null default current_date,
  end_date          date,                       -- soft: still bookable after, shown as overdue
  price             numeric(10,2) not null default 0,
  sold_by           uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);
create index on public.pt_packages(trainer_client_id);

-- Every change to a package's sessions is a row here (audit trail). remaining = total + sum(delta).
create table public.pt_package_ledger (
  id             uuid primary key default gen_random_uuid(),
  package_id     uuid not null references public.pt_packages(id) on delete cascade,
  delta          smallint not null,              -- -1 = used one session, +2 = bonus ...
  kind           text not null check (kind in ('session','noshow','bonus','refund','adjust','extend','import')),
  extend_days    smallint,                       -- for kind = 'extend'
  reason         text,
  appointment_id uuid,
  by_user        uuid references public.profiles(id),
  at             timestamptz not null default now(),
  check (kind in ('session','noshow','import') or coalesce(reason,'') <> '')   -- manual edits need a reason
);
create index on public.pt_package_ledger(package_id);

create table public.trainer_availability (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.profiles(id) on delete cascade,
  gym_id      uuid references public.gyms(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null check (end_time > start_time)
);

create table public.trainer_leave (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.profiles(id) on delete cascade,
  start_at    timestamptz not null,
  end_at      timestamptz not null check (end_at > start_at),
  reason      text,
  created_at  timestamptz not null default now()
);

create table public.appointments (
  id                uuid primary key default gen_random_uuid(),
  trainer_id        uuid not null references public.profiles(id) on delete cascade,
  trainer_client_id uuid not null references public.trainer_clients(id) on delete cascade,
  gym_id            uuid references public.gyms(id) on delete set null,
  starts_at         timestamptz not null,
  duration_min      smallint not null default 60 check (duration_min in (30,45,60,90)),
  status            text not null default 'scheduled' check (status in ('scheduled','in_progress','done','noshow','cancelled')),
  program_id        uuid,
  note              text,
  started_at        timestamptz,                -- when the trainer pressed "start" (real time, may be late)
  ended_at          timestamptz,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);
create index on public.appointments(trainer_id, starts_at);
create index on public.appointments(trainer_client_id, starts_at);
create index on public.appointments(gym_id, starts_at);
alter table public.pt_package_ledger add constraint ledger_appt_fk foreign key (appointment_id) references public.appointments(id) on delete set null;

create table public.reschedule_requests (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments(id) on delete cascade,
  requested_by    uuid not null references public.profiles(id) on delete cascade,
  proposed_start  timestamptz not null,
  message         text,
  status          text not null default 'pending' check (status in ('pending','approved','declined','countered','withdrawn')),
  counter_start   timestamptz,
  decided_by      uuid references public.profiles(id),
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  from_user   uuid not null references public.profiles(id) on delete cascade,
  gym_id      uuid references public.gyms(id) on delete cascade,
  kind        text not null check (kind in ('client','trainer','staff','member')),
  role        text check (role in ('admin','operator','trainer')),
  to_user     uuid references public.profiles(id) on delete cascade,   -- set when invited by search / QR
  status      text not null default 'pending' check (status in ('pending','accepted','declined','revoked','expired')),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_by uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- 4. Training
-- =====================================================================
create table public.exercises (
  id          uuid primary key default gen_random_uuid(),
  name_th     text not null,
  name_en     text,
  body_part   text not null check (body_part in ('chest','back','legs','shoulders','arms','core','cardio','stretch')),
  kind        text not null default 'strength' check (kind in ('strength','cardio','stretch')),
  media_url   text,
  how_to      text,
  created_by  uuid references public.profiles(id) on delete cascade,  -- null = built-in library
  created_at  timestamptz not null default now()
);

create table public.programs (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  name              text not null,
  is_template       boolean not null default false,
  trainer_client_id uuid references public.trainer_clients(id) on delete cascade,  -- planned for a trainee
  planned_for       date,
  created_at        timestamptz not null default now()
);
alter table public.appointments add constraint appt_program_fk foreign key (program_id) references public.programs(id) on delete set null;

create table public.program_exercises (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references public.programs(id) on delete cascade,
  position     smallint not null,
  exercise_id  uuid not null references public.exercises(id),
  sets         smallint,
  reps         smallint,
  weight_kg    numeric(6,2),
  duration_sec integer,
  note         text
);

-- One training session: with a trainer (appointment_id set) or alone.
create table public.workouts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  trainer_id     uuid references public.profiles(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  title          text,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  note           text,
  created_by     uuid references public.profiles(id)
);
create index on public.workouts(user_id, started_at desc);

create table public.workout_sets (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references public.workouts(id) on delete cascade,
  exercise_id  uuid references public.exercises(id),
  exercise_name text not null,                   -- snapshot
  set_no       smallint not null,
  reps         smallint,
  weight_kg    numeric(6,2),
  duration_sec integer,
  distance_m   integer,
  done         boolean not null default true
);
create index on public.workout_sets(workout_id);

-- =====================================================================
-- 5. Food, targets, body
-- =====================================================================
create table public.foods (
  id          uuid primary key default gen_random_uuid(),
  name_th     text not null,
  serving_g   numeric(7,1) not null default 100,
  kcal        numeric(7,1) not null,
  protein_g   numeric(6,1) not null default 0,
  carb_g      numeric(6,1) not null default 0,
  fat_g       numeric(6,1) not null default 0,
  created_by  uuid references public.profiles(id) on delete cascade,  -- null = our Thai food database
  created_at  timestamptz not null default now()
);
create index on public.foods(name_th);

create table public.food_favorites (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  food_id  uuid not null references public.foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

create table public.meals (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.profiles(id) on delete cascade,
  eaten_on  date not null default current_date,
  name      text not null,                       -- มื้อเช้า / หลังเล่น ...
  position  smallint not null default 0,
  created_at timestamptz not null default now()
);
create index on public.meals(user_id, eaten_on);

create table public.meal_items (
  id          uuid primary key default gen_random_uuid(),
  meal_id     uuid not null references public.meals(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  food_id     uuid references public.foods(id) on delete set null,
  name        text not null,
  grams       numeric(7,1),
  kcal        numeric(7,1) not null default 0,
  protein_g   numeric(6,1) not null default 0,
  carb_g      numeric(6,1) not null default 0,
  fat_g       numeric(6,1) not null default 0,
  photo_path  text,                              -- storage: private/<user_id>/...
  from_ai     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.meal_items(meal_id);

create table public.meal_comments (
  id         uuid primary key default gen_random_uuid(),
  meal_id    uuid not null references public.meals(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,  -- owner of the meal
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- Every change of target is a new row = history with dates.
create table public.nutrition_targets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  set_by         uuid references public.profiles(id),
  goal           text check (goal in ('lose','maintain','gain')),
  style          text check (style in ('balanced','high_carb','low_carb','custom')),
  kcal           integer not null,
  protein_g      integer,
  carb_g         integer,
  fat_g          integer,
  target_weight  numeric(5,1),
  target_date    date,
  start_date     date not null default current_date,
  note           text,
  created_at     timestamptz not null default now()
);
create index on public.nutrition_targets(user_id, created_at desc);

create table public.body_measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  measured_on date not null default current_date,
  weight_kg   numeric(5,1),
  waist_cm    numeric(5,1),
  hip_cm      numeric(5,1),
  arm_cm      numeric(5,1),
  thigh_cm    numeric(5,1),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index on public.body_measurements(user_id, measured_on desc);

create table public.progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  taken_on     date not null default current_date,
  angle        text not null check (angle in ('front','side','back')),
  storage_path text not null,                    -- storage: private/<user_id>/...
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- 6. Audit
-- =====================================================================
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  gym_id      uuid references public.gyms(id) on delete set null,
  action      text not null,
  target      text,
  target_id   text,
  detail      jsonb,
  at          timestamptz not null default now()
);
create index on public.audit_log(gym_id, at desc);

-- =====================================================================
-- 7. Helper functions used by the privacy rules
-- =====================================================================
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_super_admin and p.status = 'active' from profiles p where p.id = auth.uid()), false)
$$;

-- caller's role in a gym, or null
create or replace function public.gym_role(g uuid) returns text
language sql stable security definer set search_path = public as $$
  select s.role from gym_staff s where s.gym_id = g and s.user_id = auth.uid() and s.active
$$;

create or replace function public.has_gym_role(g uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_staff s where s.gym_id = g and s.user_id = auth.uid() and s.active and s.role = any(roles))
$$;

-- caller is an active trainer of this person
create or replace function public.is_trainer_of(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_clients tc where tc.trainer_id = auth.uid() and tc.client_id = person and tc.status = 'active')
$$;

-- caller owns a gym that this person belongs to (as member, trainee or staff)
create or replace function public.is_gym_owner_of(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from gym_staff me
    where me.user_id = auth.uid() and me.active and me.role = 'owner'
      and (   exists (select 1 from members m where m.gym_id = me.gym_id and m.profile_id = person)
           or exists (select 1 from trainer_clients tc where tc.gym_id = me.gym_id and tc.client_id = person and tc.status = 'active')
           or exists (select 1 from gym_staff s where s.gym_id = me.gym_id and s.user_id = person))
  )
$$;

-- photos, body, food, workouts
create or replace function public.can_see_private(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select person = auth.uid() or public.is_super_admin() or public.is_trainer_of(person) or public.is_gym_owner_of(person)
$$;

-- name / phone / UID: wider than private data (counter staff need names)
create or replace function public.can_see_profile(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select person = auth.uid()
      or public.is_super_admin()
      or public.is_trainer_of(person)
      or exists (select 1 from trainer_clients tc where tc.client_id = auth.uid() and tc.trainer_id = person and tc.status = 'active')
      or exists (select 1 from trainer_profiles tp where tp.user_id = person and tp.is_public)
      or exists (select 1 from gym_staff me where me.user_id = auth.uid() and me.active and me.role in ('owner','admin','operator')
                 and (   exists (select 1 from members m where m.gym_id = me.gym_id and m.profile_id = person)
                      or exists (select 1 from gym_staff s where s.gym_id = me.gym_id and s.user_id = person)))
      or exists (select 1 from gym_staff me join gym_staff s on s.gym_id = me.gym_id
                 where me.user_id = auth.uid() and me.active and s.user_id = person)
$$;

-- trainee link the caller may act on as trainer or as gym owner/admin
create or replace function public.can_manage_tc(tc_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_clients tc
                 where tc.id = tc_id
                   and (tc.trainer_id = auth.uid()
                        or (tc.gym_id is not null and public.has_gym_role(tc.gym_id, array['owner','admin']))))
$$;

create or replace function public.can_read_tc(tc_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_clients tc
                 where tc.id = tc_id
                   and (tc.trainer_id = auth.uid() or tc.client_id = auth.uid()
                        or (tc.gym_id is not null and public.has_gym_role(tc.gym_id, array['owner','admin','operator']))))
$$;

-- =====================================================================
-- 8. Business functions
-- =====================================================================
-- End date for a membership: closed weekdays and holidays don't count.
create or replace function public.calc_end_date(g uuid, start_d date, months int, days int default 0) returns date
language plpgsql stable security definer set search_path = public as $$
declare
  base_end date := (start_d + make_interval(months => months, days => days))::date - 1;
  closed smallint[];
  extra int;
  d date;
begin
  select closed_weekdays into closed from gyms where id = g;
  closed := coalesce(closed, '{}');
  -- count closed days inside the paid period
  select count(*) into extra from generate_series(start_d, base_end, interval '1 day') s(day)
   where extract(dow from s.day)::smallint = any(closed)
      or exists (select 1 from gym_holidays h where h.gym_id = g and s.day::date between h.start_date and h.end_date);
  d := base_end;
  while extra > 0 loop
    d := d + 1;
    if not (extract(dow from d)::smallint = any(closed)
            or exists (select 1 from gym_holidays h where h.gym_id = g and d between h.start_date and h.end_date)) then
      extra := extra - 1;
    end if;
  end loop;
  return d;
end $$;

-- Renewal starts the day after the current end if still active, otherwise the chosen start.
create or replace function public.renewal_start(m uuid, chosen date default current_date) returns date
language sql stable security definer set search_path = public as $$
  select greatest(chosen, coalesce((select max(end_date) + 1 from memberships where member_id = m), chosen))
$$;

-- Push back every active membership and PT package when a holiday is added (call once per holiday).
create or replace function public.apply_holiday(h uuid) returns int
language plpgsql security definer set search_path = public as $$
declare hol gym_holidays; n int; open_days int; closed smallint[];
begin
  select * into hol from gym_holidays where id = h;
  if hol is null then raise exception 'holiday not found'; end if;
  if not (public.has_gym_role(hol.gym_id, array['owner','admin']) or public.is_super_admin()) then
    raise exception 'not allowed';
  end if;
  if hol.applied_at is not null then return 0; end if;
  -- only days the gym would otherwise be open
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

-- =====================================================================
-- 9. Views (respect the caller's privacy rules)
-- =====================================================================
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
       cur.end_date - current_date as days_left
from public.members m
left join lateral (select plan_name, end_date from public.memberships x where x.member_id = m.id order by end_date desc limit 1) cur on true
left join lateral (select end_date from public.member_freezes f where f.member_id = m.id and current_date between f.start_date and f.end_date order by end_date desc limit 1) fr on true;

create or replace view public.pt_package_status with (security_invoker = true) as
select p.*,
       p.sessions_total + coalesce((select sum(l.delta) from public.pt_package_ledger l where l.package_id = p.id and l.kind <> 'extend'), 0) as sessions_left,
       case when p.end_date is not null and p.end_date < current_date then current_date - p.end_date end as days_overdue
from public.pt_packages p;

-- =====================================================================
-- 10. Triggers
-- =====================================================================
-- New sign-up → profile row; link any gym member records with the same phone.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, display_name, phone, email)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,''), '@', 1), ''),
          coalesce(new.phone, new.raw_user_meta_data->>'phone'),
          new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.link_members_by_phone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_norm is not null then
    update members set profile_id = new.id
     where phone_norm = new.phone_norm and profile_id is null;
  end if;
  return new;
end $$;
create trigger profiles_link_members after insert or update of phone on public.profiles
  for each row execute function public.link_members_by_phone();

-- Only super admins may change super-admin flag, status, UID.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() and auth.uid() is not null then
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
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();

-- Creating a gym makes the creator its owner.
create or replace function public.gym_add_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into gym_staff(gym_id, user_id, role) values (new.id, new.created_by, 'owner') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger gyms_add_owner after insert on public.gyms
  for each row execute function public.gym_add_owner();

-- =====================================================================
-- 11. Row Level Security
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['profiles','subscriptions','consents','gyms','gym_staff','gym_holidays','membership_plans',
    'members','memberships','member_freezes','checkins','walkins','trainer_profiles','trainer_clients','pt_prices',
    'pt_packages','pt_package_ledger','trainer_availability','trainer_leave','appointments','reschedule_requests',
    'invites','exercises','programs','program_exercises','workouts','workout_sets','foods','food_favorites','meals',
    'meal_items','meal_comments','nutrition_targets','body_measurements','progress_photos','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy super_admin_all on public.%I for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin())', t);
  end loop;
end $$;

-- people
create policy read_profile on public.profiles for select to authenticated using (public.can_see_profile(id));
create policy update_own_profile on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy own_subscriptions on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or (gym_id is not null and public.has_gym_role(gym_id, array['owner'])));

create policy own_consents on public.consents for select to authenticated using (user_id = auth.uid());
create policy give_consent on public.consents for insert to authenticated with check (user_id = auth.uid());
create policy withdraw_consent on public.consents for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- gyms
create policy read_gym on public.gyms for select to authenticated using (is_public or public.gym_role(id) is not null);
create policy create_gym on public.gyms for insert to authenticated with check (created_by = auth.uid());
create policy edit_gym on public.gyms for update to authenticated using (public.has_gym_role(id, array['owner','admin'])) with check (public.has_gym_role(id, array['owner','admin']));

create policy read_staff on public.gym_staff for select to authenticated using (user_id = auth.uid() or public.gym_role(gym_id) is not null);
create policy owner_manages_staff on public.gym_staff for all to authenticated
  using (public.has_gym_role(gym_id, array['owner'])) with check (public.has_gym_role(gym_id, array['owner']));
create policy staff_can_leave on public.gym_staff for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and active = false);

create policy read_holidays on public.gym_holidays for select to authenticated using (public.gym_role(gym_id) is not null);
create policy manage_holidays on public.gym_holidays for all to authenticated
  using (public.has_gym_role(gym_id, array['owner','admin'])) with check (public.has_gym_role(gym_id, array['owner','admin']));

create policy read_plans on public.membership_plans for select to authenticated using (true);  -- prices shown on gym page
create policy manage_plans on public.membership_plans for all to authenticated
  using (public.has_gym_role(gym_id, array['owner','admin'])) with check (public.has_gym_role(gym_id, array['owner','admin']));

-- counter work: owner, admin, operator
create policy desk_members on public.members for select to authenticated
  using (public.has_gym_role(gym_id, array['owner','admin','operator']) or profile_id = auth.uid()
         or exists (select 1 from trainer_clients tc where tc.member_id = members.id and tc.trainer_id = auth.uid() and tc.status = 'active'));
create policy desk_add_member on public.members for insert to authenticated with check (public.has_gym_role(gym_id, array['owner','admin','operator']));
create policy desk_edit_member on public.members for update to authenticated
  using (public.has_gym_role(gym_id, array['owner','admin','operator'])) with check (public.has_gym_role(gym_id, array['owner','admin','operator']));
create policy delete_member on public.members for delete to authenticated using (public.has_gym_role(gym_id, array['owner','admin']));

create policy read_memberships on public.memberships for select to authenticated
  using (public.has_gym_role(gym_id, array['owner','admin','operator'])
         or exists (select 1 from members m where m.id = member_id and m.profile_id = auth.uid()));
create policy sell_membership on public.memberships for insert to authenticated with check (public.has_gym_role(gym_id, array['owner','admin','operator']));
create policy fix_membership on public.memberships for update to authenticated
  using (public.has_gym_role(gym_id, array['owner','admin'])) with check (public.has_gym_role(gym_id, array['owner','admin']));
create policy delete_membership on public.memberships for delete to authenticated using (public.has_gym_role(gym_id, array['owner','admin']));

create policy read_freezes on public.member_freezes for select to authenticated
  using (public.has_gym_role(gym_id, array['owner','admin','operator'])
         or exists (select 1 from members m where m.id = member_id and m.profile_id = auth.uid()));
create policy manage_freezes on public.member_freezes for all to authenticated
  using (public.has_gym_role(gym_id, array['owner','admin','operator'])) with check (public.has_gym_role(gym_id, array['owner','admin','operator']));

create policy read_checkins on public.checkins for select to authenticated
  using (public.has_gym_role(gym_id, array['owner','admin','operator'])
         or exists (select 1 from members m where m.id = member_id and m.profile_id = auth.uid()));
create policy do_checkin on public.checkins for insert to authenticated with check (public.has_gym_role(gym_id, array['owner','admin','operator']));
create policy undo_checkin on public.checkins for delete to authenticated using (public.has_gym_role(gym_id, array['owner','admin','operator']));

create policy desk_walkins on public.walkins for select to authenticated using (public.has_gym_role(gym_id, array['owner','admin','operator']));
create policy add_walkin on public.walkins for insert to authenticated with check (public.has_gym_role(gym_id, array['owner','admin','operator']));
create policy undo_walkin on public.walkins for delete to authenticated using (public.has_gym_role(gym_id, array['owner','admin','operator']));

-- trainers
create policy read_trainer_profile on public.trainer_profiles for select to authenticated
  using (is_public or user_id = auth.uid() or public.can_see_profile(user_id));
create policy own_trainer_profile on public.trainer_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy read_tc on public.trainer_clients for select to authenticated using (public.can_read_tc(id));
create policy add_tc on public.trainer_clients for insert to authenticated
  with check (trainer_id = auth.uid() or (gym_id is not null and public.has_gym_role(gym_id, array['owner','admin'])));
create policy edit_tc on public.trainer_clients for update to authenticated
  using (public.can_manage_tc(id)) with check (trainer_id = auth.uid() or (gym_id is not null and public.has_gym_role(gym_id, array['owner','admin'])));

create policy read_pt_prices on public.pt_prices for select to authenticated using (true);
create policy manage_pt_prices on public.pt_prices for all to authenticated
  using ((gym_id is null and trainer_id = auth.uid()) or (gym_id is not null and public.has_gym_role(gym_id, array['owner','admin'])))
  with check ((gym_id is null and trainer_id = auth.uid()) or (gym_id is not null and public.has_gym_role(gym_id, array['owner','admin'])));

create policy read_packages on public.pt_packages for select to authenticated using (public.can_read_tc(trainer_client_id));
create policy sell_package on public.pt_packages for insert to authenticated
  with check (public.can_manage_tc(trainer_client_id) or (gym_id is not null and public.has_gym_role(gym_id, array['operator'])));
create policy edit_package on public.pt_packages for update to authenticated
  using (public.can_manage_tc(trainer_client_id)) with check (public.can_manage_tc(trainer_client_id));

create policy read_ledger on public.pt_package_ledger for select to authenticated
  using (exists (select 1 from pt_packages p where p.id = package_id and public.can_read_tc(p.trainer_client_id)));
create policy write_ledger on public.pt_package_ledger for insert to authenticated
  with check (by_user = auth.uid() and exists (select 1 from pt_packages p where p.id = package_id and public.can_manage_tc(p.trainer_client_id)));
-- no update / delete on the ledger: it is the audit trail

create policy read_availability on public.trainer_availability for select to authenticated using (true);
create policy own_availability on public.trainer_availability for all to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

create policy read_leave on public.trainer_leave for select to authenticated
  using (trainer_id = auth.uid()
         or exists (select 1 from gym_staff s where s.user_id = trainer_leave.trainer_id and s.active and public.has_gym_role(s.gym_id, array['owner','admin','operator']))
         or exists (select 1 from trainer_clients tc where tc.trainer_id = trainer_leave.trainer_id and tc.client_id = auth.uid() and tc.status = 'active'));
create policy own_leave on public.trainer_leave for all to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

create policy read_appts on public.appointments for select to authenticated using (public.can_read_tc(trainer_client_id));
create policy manage_appts on public.appointments for all to authenticated
  using (public.can_manage_tc(trainer_client_id)) with check (public.can_manage_tc(trainer_client_id));

create policy read_resched on public.reschedule_requests for select to authenticated
  using (exists (select 1 from appointments a where a.id = appointment_id and public.can_read_tc(a.trainer_client_id)));
create policy ask_resched on public.reschedule_requests for insert to authenticated
  with check (requested_by = auth.uid() and exists (select 1 from appointments a where a.id = appointment_id and public.can_read_tc(a.trainer_client_id)));
create policy answer_resched on public.reschedule_requests for update to authenticated
  using (exists (select 1 from appointments a where a.id = appointment_id and (public.can_manage_tc(a.trainer_client_id) or requested_by = auth.uid())));

create policy read_invites on public.invites for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());
create policy send_invite on public.invites for insert to authenticated
  with check (from_user = auth.uid() and (gym_id is null or public.has_gym_role(gym_id, array['owner','admin','operator'])));
create policy update_invite on public.invites for update to authenticated using (from_user = auth.uid() or to_user = auth.uid());

-- training
create policy read_exercises on public.exercises for select to authenticated using (created_by is null or created_by = auth.uid()
         or exists (select 1 from trainer_clients tc where tc.trainer_id = exercises.created_by and tc.client_id = auth.uid() and tc.status = 'active'));
create policy own_exercises on public.exercises for all to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy read_programs on public.programs for select to authenticated
  using (owner_id = auth.uid() or (trainer_client_id is not null and public.can_read_tc(trainer_client_id)));
create policy own_programs on public.programs for all to authenticated
  using (owner_id = auth.uid() or (trainer_client_id is not null and public.can_manage_tc(trainer_client_id)))
  with check (owner_id = auth.uid() or (trainer_client_id is not null and public.can_manage_tc(trainer_client_id)));

create policy read_program_ex on public.program_exercises for select to authenticated
  using (exists (select 1 from programs p where p.id = program_id and (p.owner_id = auth.uid() or (p.trainer_client_id is not null and public.can_read_tc(p.trainer_client_id)))));
create policy write_program_ex on public.program_exercises for all to authenticated
  using (exists (select 1 from programs p where p.id = program_id and (p.owner_id = auth.uid() or (p.trainer_client_id is not null and public.can_manage_tc(p.trainer_client_id)))))
  with check (exists (select 1 from programs p where p.id = program_id and (p.owner_id = auth.uid() or (p.trainer_client_id is not null and public.can_manage_tc(p.trainer_client_id)))));

-- private data: the person + their trainer + their gym owner
create policy read_workouts on public.workouts for select to authenticated using (public.can_see_private(user_id));
create policy write_workouts on public.workouts for all to authenticated
  using (user_id = auth.uid() or public.is_trainer_of(user_id)) with check (user_id = auth.uid() or public.is_trainer_of(user_id));

create policy read_sets on public.workout_sets for select to authenticated
  using (exists (select 1 from workouts w where w.id = workout_id and public.can_see_private(w.user_id)));
create policy write_sets on public.workout_sets for all to authenticated
  using (exists (select 1 from workouts w where w.id = workout_id and (w.user_id = auth.uid() or public.is_trainer_of(w.user_id))))
  with check (exists (select 1 from workouts w where w.id = workout_id and (w.user_id = auth.uid() or public.is_trainer_of(w.user_id))));

create policy read_foods on public.foods for select to authenticated using (created_by is null or created_by = auth.uid());
create policy own_foods on public.foods for all to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy own_favorites on public.food_favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy read_meals on public.meals for select to authenticated using (public.can_see_private(user_id));
create policy own_meals on public.meals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy read_meal_items on public.meal_items for select to authenticated using (public.can_see_private(user_id));
create policy own_meal_items on public.meal_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy read_meal_comments on public.meal_comments for select to authenticated using (public.can_see_private(user_id));
create policy add_meal_comment on public.meal_comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_private(user_id));
create policy delete_own_comment on public.meal_comments for delete to authenticated using (author_id = auth.uid());

create policy read_targets on public.nutrition_targets for select to authenticated using (public.can_see_private(user_id));
create policy set_targets on public.nutrition_targets for insert to authenticated
  with check (set_by = auth.uid() and (user_id = auth.uid() or public.is_trainer_of(user_id)));

create policy read_body on public.body_measurements for select to authenticated using (public.can_see_private(user_id));
create policy write_body on public.body_measurements for all to authenticated
  using (user_id = auth.uid() or public.is_trainer_of(user_id)) with check (user_id = auth.uid() or public.is_trainer_of(user_id));

create policy read_photos on public.progress_photos for select to authenticated using (public.can_see_private(user_id));
create policy own_photos on public.progress_photos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy read_audit on public.audit_log for select to authenticated using (gym_id is not null and public.has_gym_role(gym_id, array['owner']));
create policy write_audit on public.audit_log for insert to authenticated with check (actor_id = auth.uid());
