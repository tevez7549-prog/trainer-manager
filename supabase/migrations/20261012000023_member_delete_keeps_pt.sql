-- Deleting a gym member used to fail when they had PT: their PT record lost its member link and had no name left.
-- Keep the member's name on the PT record so the history stays readable after the member is removed.
update public.trainer_clients tc set client_name = m.name
  from public.members m where tc.member_id = m.id and coalesce(btrim(tc.client_name), '') = '';

create or replace function public.members_keep_pt_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update trainer_clients set client_name = old.name
   where member_id = old.id and coalesce(btrim(client_name), '') = '';
  return old;
end $$;
create or replace trigger members_keep_pt_name before delete on public.members
  for each row execute function public.members_keep_pt_name();
revoke execute on function public.members_keep_pt_name() from public, anon, authenticated;
