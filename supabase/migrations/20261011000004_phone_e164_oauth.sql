-- International phone numbers (E.164, e.g. +66812345678) and names from Google / LINE sign-in.

-- Local numbers typed at a counter ("081-234-5678") become +66812345678 using the gym's country.
create or replace function public.norm_phone(p text, cc text default '66') returns text
language sql immutable set search_path = '' as $$
  select case
    when p is null or regexp_replace(p, '\D', '', 'g') = '' then null
    when btrim(p) like '+%' then '+' || regexp_replace(p, '\D', '', 'g')
    when regexp_replace(p, '\D', '', 'g') like '00%' then '+' || substr(regexp_replace(p, '\D', '', 'g'), 3)
    when regexp_replace(p, '\D', '', 'g') like '0%' then '+' || coalesce(nullif(cc, ''), '66') || substr(regexp_replace(p, '\D', '', 'g'), 2)
    else '+' || coalesce(nullif(cc, ''), '66') || regexp_replace(p, '\D', '', 'g')
  end
$$;

alter table public.gyms add column if not exists country_code text not null default '66';  -- dialing code, no plus

-- profiles: same column, new formula (Postgres 17: set expression keeps the column and its unique index)
alter table public.profiles alter column phone_norm set expression as (public.norm_phone(phone));

-- members: becomes a normal column filled by a trigger, using the gym's country
alter table public.members alter column phone_norm drop expression;
create or replace function public.members_set_phone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.phone_norm := public.norm_phone(new.phone, (select country_code from gyms where id = new.gym_id));
  return new;
end $$;
create trigger members_phone before insert or update of phone, gym_id on public.members
  for each row execute function public.members_set_phone();
update public.members set phone = phone;
revoke execute on function public.members_set_phone() from public, anon, authenticated;

-- the profile trigger re-runs member linking when the phone changes (phone_norm is generated, so watch phone)
-- (profiles_link_members already fires on "update of phone")

-- names and phone from Google / LINE / phone sign-in
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, display_name, phone, email)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'display_name', ''),
                   nullif(new.raw_user_meta_data->>'full_name', ''),
                   nullif(new.raw_user_meta_data->>'name', ''),
                   nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                   ''),
          case when coalesce(new.phone, '') <> '' then '+' || regexp_replace(new.phone, '\D', '', 'g')
               else nullif(new.raw_user_meta_data->>'phone', '') end,
          nullif(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
