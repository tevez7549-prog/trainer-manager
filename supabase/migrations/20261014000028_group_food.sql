-- Share food with a group: each member chooses per group (off by default). Members of the group then see,
-- for those who share, each day's totals against their own target, and what they ate.
alter table public.group_members add column if not exists share_food boolean not null default false;

create or replace function public.set_group_food_share(g uuid, share boolean)
returns void language sql security definer set search_path = public as $$
  update group_members set share_food = share where group_id = g and user_id = auth.uid()
$$;
revoke execute on function public.set_group_food_share(uuid, boolean) from public, anon;
grant execute on function public.set_group_food_share(uuid, boolean) to authenticated;

-- Daily totals (from..to, at most 31 days) for members who share, with their latest target
create or replace function public.group_food(g uuid, d_from date, d_to date)
returns table (user_id uuid, display_name text, day date, kcal numeric, protein_g numeric, carb_g numeric, fat_g numeric, items int,
               t_kcal int, t_protein int, t_carb int, t_fat int)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.display_name, ml.eaten_on,
         sum(i.kcal), sum(i.protein_g), sum(i.carb_g), sum(i.fat_g), count(i.id)::int,
         t.kcal, t.protein_g, t.carb_g, t.fat_g
    from group_members m
    join profiles p on p.id = m.user_id
    join meals ml on ml.user_id = m.user_id and ml.eaten_on between d_from and d_to
    join meal_items i on i.meal_id = ml.id
    left join lateral (select kcal, protein_g, carb_g, fat_g from nutrition_targets nt
                        where nt.user_id = m.user_id order by nt.created_at desc limit 1) t on true
   where m.group_id = g and m.share_food and private.in_group(g) and d_to - d_from <= 31
   group by m.user_id, p.display_name, ml.eaten_on, t.kcal, t.protein_g, t.carb_g, t.fat_g
$$;
revoke execute on function public.group_food(uuid, date, date) from public, anon;
grant execute on function public.group_food(uuid, date, date) to authenticated;

-- What one sharing member ate on a day
create or replace function public.group_food_items(g uuid, person uuid, d date)
returns table (meal text, name text, grams numeric, kcal numeric, protein_g numeric, carb_g numeric, fat_g numeric)
language sql stable security definer set search_path = public as $$
  select ml.name, i.name, i.grams, i.kcal, i.protein_g, i.carb_g, i.fat_g
    from group_members m
    join meals ml on ml.user_id = m.user_id and ml.eaten_on = d
    join meal_items i on i.meal_id = ml.id
   where m.group_id = g and m.user_id = person and m.share_food and private.in_group(g)
   order by ml.position, i.created_at
$$;
revoke execute on function public.group_food_items(uuid, uuid, date) from public, anon;
grant execute on function public.group_food_items(uuid, uuid, date) to authenticated;
