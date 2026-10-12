-- Real exercise library (876 moves from the user's set, based on the open free-exercise-db):
-- English name + Thai how-to, muscle, equipment, level, animated picture under /ex/<slug>.webp on the web app.
create extension if not exists pg_net with schema extensions;

alter table public.exercises
  add column if not exists slug text unique,
  add column if not exists muscle text,
  add column if not exists muscles2 text[] not null default '{}',
  add column if not exists equipment text,
  add column if not exists level text,
  add column if not exists category text,
  add column if not exists force text,
  add column if not exists mechanic text,
  add column if not exists how_to_en text,
  add column if not exists how_to_th text;
create index if not exists exercises_muscle_idx on public.exercises (muscle);

-- One-off server jobs (e.g. translating the library) prove themselves with a token only the database knows.
create table if not exists private.job_tokens (name text primary key, token text not null, created_at timestamptz not null default now());

-- Load / refresh the library from the JSON list ({id,name,muscle,muscles2,equipment,level,category,force,mechanic,steps,media}).
create or replace function private.import_exercises(d jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.exercises (slug, name_th, name_en, body_part, kind, media_url, how_to_en, muscle, muscles2, equipment, level, category, force, mechanic)
  select x->>'id', x->>'name', x->>'name',
    case when x->>'category' = 'stretching' then 'stretch'
         when x->>'category' = 'cardio' then 'cardio'
         when x->>'muscle' = 'chest' then 'chest'
         when x->>'muscle' in ('lats','middle back','lower back','traps') then 'back'
         when x->>'muscle' in ('quadriceps','hamstrings','calves','glutes','adductors','abductors') then 'legs'
         when x->>'muscle' in ('shoulders','neck') then 'shoulders'
         when x->>'muscle' in ('biceps','triceps','forearms') then 'arms'
         else 'core' end,
    case x->>'category' when 'stretching' then 'stretch' when 'cardio' then 'cardio' else 'strength' end,
    x->>'media',
    (select string_agg(s, E'\n' order by i) from jsonb_array_elements_text(x->'steps') with ordinality t(s, i)),
    x->>'muscle', coalesce((select array_agg(m) from jsonb_array_elements_text(x->'muscles2') m), '{}'),
    x->>'equipment', x->>'level', x->>'category', x->>'force', x->>'mechanic'
  from jsonb_array_elements(d) x
  on conflict (slug) do update set name_en = excluded.name_en, body_part = excluded.body_part, kind = excluded.kind,
    media_url = excluded.media_url, how_to_en = excluded.how_to_en, muscle = excluded.muscle, muscles2 = excluded.muscles2,
    equipment = excluded.equipment, level = excluded.level, category = excluded.category, force = excluded.force, mechanic = excluded.mechanic;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.import_exercises(jsonb) from public, anon, authenticated;
