-- Progress photos: the person decides whether their trainer can see them (switch on the body page).
-- Gym owners never see them (before, any private data was open to the gym owner of a member).
alter table public.profiles add column if not exists share_photos boolean not null default true;

create or replace function private.can_see_photos(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select person = auth.uid()
      or private.is_super_admin()
      or (private.is_trainer_of(person) and coalesce((select share_photos from profiles where id = person), false))
$$;
revoke execute on function private.can_see_photos(uuid) from public, anon;
grant execute on function private.can_see_photos(uuid) to authenticated;

alter policy read_photos on public.progress_photos using (private.can_see_photos(user_id));
-- the private bucket only holds progress photos (<user_id>/<file>)
alter policy "private read" on storage.objects
  using (bucket_id = 'private' and private.can_see_photos(((storage.foldername(name))[1])::uuid));
