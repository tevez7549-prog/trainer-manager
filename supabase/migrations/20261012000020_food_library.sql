-- Food library (~12.8k items from the user's nutrition set): names tidied, serving unit + other serving sizes,
-- searched on the server (trigram index) instead of loading everything into the app.
create extension if not exists pg_trgm with schema extensions;

alter table public.foods
  add column if not exists category text,
  add column if not exists group_name text,
  add column if not exists unit text,                       -- per-item foods (serving_g = 0): what "1" is, e.g. จาน
  add column if not exists servings jsonb not null default '[]',  -- weight foods: [[label, grams]], per-item: [[label, multiplier]]
  add column if not exists source text;
create unique index if not exists foods_source_name_uq on public.foods (source, lower(name_th)) where source is not null;
create index if not exists foods_name_trgm on public.foods using gin (name_th extensions.gin_trgm_ops);

-- Every typed word must appear; names that start with the first word, Thai names and shorter names come first.
create or replace function public.search_foods(q text, lim int default 20)
returns setof public.foods language sql stable set search_path = public, extensions as $$
  with w as (select array_remove(regexp_split_to_array(lower(trim(q)), '\s+'), '') a)
  select f.* from public.foods f, w
  where coalesce(array_length(w.a, 1), 0) > 0
    and (select bool_and(lower(f.name_th) like '%' || x || '%') from unnest(w.a) x)
  order by (lower(f.name_th) like w.a[1] || '%') desc,
           (f.name_th ~ '[ก-๙]') desc,
           (f.created_by is not null) desc,
           length(f.name_th)
  limit least(greatest(lim, 1), 50)
$$;
grant execute on function public.search_foods(text, int) to authenticated;

create or replace function private.import_foods(d jsonb, src text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.foods (name_th, serving_g, kcal, protein_g, carb_g, fat_g, category, group_name, unit, servings, source)
  select x->>'n', coalesce((x->>'g')::numeric, 0), (x->>'k')::numeric, coalesce((x->>'p')::numeric, 0), coalesce((x->>'cb')::numeric, 0),
         coalesce((x->>'f')::numeric, 0), x->>'c', x->>'m', x->>'u', coalesce(x->'s', '[]'::jsonb), src
  from jsonb_array_elements(d) x
  on conflict (source, lower(name_th)) where source is not null do update set
    serving_g = excluded.serving_g, kcal = excluded.kcal, protein_g = excluded.protein_g, carb_g = excluded.carb_g, fat_g = excluded.fat_g,
    category = excluded.category, group_name = excluded.group_name, unit = excluded.unit, servings = excluded.servings;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.import_foods(jsonb, text) from public, anon, authenticated;
