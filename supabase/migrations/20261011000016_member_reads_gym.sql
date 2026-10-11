-- Members (and PT trainees) can see the name of the gym they belong to
create policy member_reads_gym on public.gyms for select to authenticated
  using (exists (select 1 from public.members m where m.gym_id = gyms.id and m.profile_id = auth.uid()));
