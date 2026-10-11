-- Member codes count per gym (each gym starts at M-0001) and never get cut off after 9999.
alter table public.gyms add column if not exists member_seq int not null default 0;

-- start each gym's counter after its highest existing number
update public.gyms g set member_seq = coalesce((
  select max(nullif(regexp_replace(m.code, '\D', '', 'g'), '')::int) from public.members m where m.gym_id = g.id), 0);

alter table public.members alter column code drop default;

create or replace function public.members_set_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.code is null or btrim(new.code) = '' then
    update gyms set member_seq = member_seq + 1 where id = new.gym_id returning member_seq into n;
    new.code := 'M-' || lpad(n::text, greatest(4, length(n::text)), '0');
  end if;
  return new;
end $$;
create trigger members_code before insert on public.members
  for each row execute function public.members_set_code();
revoke execute on function public.members_set_code() from public, anon, authenticated;
