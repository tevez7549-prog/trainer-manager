-- Super Admin can do anything a gym owner can (selling, freezing, holidays) from the back office.
create or replace function private.has_gym_role(g uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_super_admin()
      or exists (select 1 from gym_staff s where s.gym_id = g and s.user_id = auth.uid() and s.active and s.role = any(roles))
$$;
