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

-- profiles: rebuild the normalised column
drop index if exists public.profiles_phone_uq;
alter table public.profiles drop column phone_norm;
alter table public.profiles add column phone_norm text generated always as (public.norm_phone(phone)) stored;
create unique index profiles_phone_uq on public.profiles(phone_norm) where phone_norm is not null;

-- members: normalised with the gym's country, so it is set by a trigger
drop index if exists public.members_gym_phone_uq;
alter table public.members drop column phone_norm;
alter table public.members add column phone_norm text;
create or replace function public.members_set_phone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.phone_norm := public.norm_phone(new.phone, (select country_code from gyms where id = new.gym_id));
  return new;
end $$;
create trigger members_phone before insert or update of phone, gym_id on public.members
  for each row execute function public.members_set_phone();
update public.members set phone = phone;
create unique index members_gym_phone_uq on public.members(gym_id, phone_norm) where phone_norm is not null;
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
