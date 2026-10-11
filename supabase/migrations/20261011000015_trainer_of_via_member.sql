-- A trainer also counts as "trainer of" someone whose gym member record is linked to the PT,
-- even when the PT was sold before that person had the app.
create or replace function private.is_trainer_of(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_clients tc
                 left join members m on m.id = tc.member_id
                 where tc.trainer_id = auth.uid() and tc.status = 'active'
                   and (tc.client_id = person or m.profile_id = person))
$$;
