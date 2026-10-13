-- InBody results read from the QR code on the printout. One row per test (the machine's own date and time).
-- The QR's ID field is the person's phone number at the gym; the app strips it before saving, `raw` starts at the height field.
create table if not exists public.body_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  measured_at timestamptz not null,
  source text not null default 'inbody' check (source in ('inbody')),
  model text,
  height_cm numeric, weight_kg numeric not null,
  smm_kg numeric,            -- skeletal muscle mass
  fat_kg numeric, pbf numeric, bmi numeric, score int,
  tbw_l numeric, protein_kg numeric, mineral_kg numeric, ffm_kg numeric,
  bmr int, whr numeric, visceral int,
  target_weight numeric, weight_ctrl numeric, fat_ctrl numeric, muscle_ctrl numeric,
  seg_lean jsonb, seg_fat jsonb,   -- {ra, la, tr, rl, ll: [kg, %]}
  raw text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, measured_at)
);
create index if not exists body_scans_user_time on public.body_scans (user_id, measured_at desc);

alter table public.body_scans enable row level security;
-- same rules as body_measurements: the person, people caring for them, and super admin
create policy read_scans on public.body_scans for select using (private.can_see_private(user_id));
create policy write_scans on public.body_scans for all
  using (user_id = auth.uid() or private.is_trainer_of(user_id))
  with check (user_id = auth.uid() or private.is_trainer_of(user_id));
create policy super_admin_all on public.body_scans for all using (private.is_super_admin()) with check (private.is_super_admin());
