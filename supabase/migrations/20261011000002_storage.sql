-- Private photo storage (body photos, meal photos). Files live at private/<user_id>/<file>.
-- Who can open a file = same rule as the tables: the person, their trainer, their gym owner, super admin.
insert into storage.buckets (id, name, public) values ('private', 'private', false) on conflict (id) do nothing;

create policy "private read" on storage.objects for select to authenticated
  using (bucket_id = 'private' and public.can_see_private(((storage.foldername(name))[1])::uuid));

create policy "private upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'private' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "private delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'private' and (storage.foldername(name))[1] = auth.uid()::text);
