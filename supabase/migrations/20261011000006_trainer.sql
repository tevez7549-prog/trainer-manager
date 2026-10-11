-- Trainer features (11 Oct 2026): trainees without the app, invites by UID, marking sessions.

-- 1. A trainer can keep a trainee who has no app account and no gym record (name + phone only)
alter table public.trainer_clients add column if not exists client_name text;
alter table public.trainer_clients add column if not exists client_phone text;
alter table public.trainer_clients drop constraint if exists trainer_clients_check;
alter table public.trainer_clients add constraint trainer_clients_who
  check (client_id is not null or member_id is not null or coalesce(btrim(client_name), '') <> '');

-- the trainer and trainee see the link directly (a brand-new row is not yet visible to the helper function,
-- so "insert ... returning" failed for trainers)
create policy read_own_tc on public.trainer_clients for select to authenticated
  using (trainer_id = auth.uid() or client_id = auth.uid());

-- 2. Invite an app user to be my trainee. They must accept before I can see anything of theirs.
create or replace function public.invite_client(client_uid bigint)
returns json language plpgsql security definer set search_path = public as $$
declare p profiles; i invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into p from profiles where uid = client_uid;
  if p.id is null then raise exception 'uid not found' using errcode = 'P0002'; end if;
  if p.id = auth.uid() then raise exception 'cannot invite yourself'; end if;
  if exists (select 1 from trainer_clients where trainer_id = auth.uid() and client_id = p.id and status = 'active') then
    raise exception 'already your trainee';
  end if;
  update invites set status = 'revoked'
   where from_user = auth.uid() and to_user = p.id and kind = 'client' and status = 'pending';
  insert into invites(from_user, kind, to_user) values (auth.uid(), 'client', p.id) returning * into i;
  return json_build_object('id', i.id, 'uid', p.uid, 'display_name', p.display_name);
end $$;

-- invites waiting for me, with the sender's name (I can't read their profile until I accept)
create or replace function public.my_invites()
returns table(id uuid, kind text, from_name text, from_uid bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.kind, p.display_name, p.uid, i.created_at
    from invites i join profiles p on p.id = i.from_user
   where i.to_user = auth.uid() and i.status = 'pending' and i.expires_at > now()
   order by i.created_at desc
$$;

-- invites I sent that are still waiting
create or replace function public.my_sent_invites()
returns table(id uuid, kind text, to_name text, to_uid bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.kind, p.display_name, p.uid, i.created_at
    from invites i join profiles p on p.id = i.to_user
   where i.from_user = auth.uid() and i.status = 'pending' and i.expires_at > now()
   order by i.created_at desc
$$;

create or replace function public.answer_invite(i uuid, accept boolean)
returns json language plpgsql security definer set search_path = public as $$
declare inv invites;
begin
  select * into inv from invites where id = i and to_user = auth.uid() for update;
  if inv.id is null then raise exception 'invite not found'; end if;
  if inv.status <> 'pending' then raise exception 'invite already answered'; end if;
  if inv.expires_at <= now() then
    update invites set status = 'expired' where id = i;
    raise exception 'invite expired';
  end if;
  if accept then
    if inv.kind = 'client' then
      insert into trainer_clients(trainer_id, client_id, gym_id) values (inv.from_user, auth.uid(), inv.gym_id)
      on conflict do nothing;
    end if;
    update invites set status = 'accepted', accepted_by = auth.uid() where id = i;
  else
    update invites set status = 'declined' where id = i;
  end if;
  return json_build_object('status', case when accept then 'accepted' else 'declined' end);
end $$;

-- 3. Trainer marks a session: came (uses 1 session) / no-show (uses 1 only if deduct) / cancelled / back to scheduled.
--    Changing your mind gives the session back, so the ledger always matches the appointment.
create or replace function public.mark_appointment(a uuid, new_status text, deduct boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare ap appointments; used int; pk uuid; take boolean; left_now int;
begin
  select * into ap from appointments where id = a for update;
  if ap.id is null then raise exception 'appointment not found'; end if;
  if not (private.can_manage_tc(ap.trainer_client_id) or private.is_super_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if new_status not in ('scheduled', 'done', 'noshow', 'cancelled') then raise exception 'bad status'; end if;
  take := new_status = 'done' or (new_status = 'noshow' and coalesce(deduct, false));
  select coalesce(-sum(delta), 0) into used from pt_package_ledger where appointment_id = a;

  if used > 0 and not take then
    insert into pt_package_ledger(package_id, delta, kind, reason, appointment_id, by_user)
    select package_id, -sum(delta), 'adjust', 'แก้การเช็กชื่อ คืนครั้ง', a, auth.uid()
      from pt_package_ledger where appointment_id = a group by package_id having sum(delta) <> 0;
  elsif used = 0 and take then
    select p.id into pk from pt_package_status p
     where p.trainer_client_id = ap.trainer_client_id and p.sessions_left > 0
     order by p.start_date, p.created_at limit 1;
    if pk is not null then
      insert into pt_package_ledger(package_id, delta, kind, appointment_id, by_user)
      values (pk, -1, case when new_status = 'done' then 'session' else 'noshow' end, a, auth.uid());
    end if;
  end if;

  update appointments set
    status = new_status,
    started_at = case when new_status in ('done', 'noshow') then coalesce(started_at, now()) else null end,
    ended_at = case when new_status = 'done' then coalesce(ended_at, now()) else null end
  where id = a;

  select coalesce(sum(sessions_left), 0) into left_now from pt_package_status
   where trainer_client_id = ap.trainer_client_id and sessions_left > 0;
  return json_build_object('status', new_status,
                           'deducted', take and (used > 0 or pk is not null),
                           'no_package', take and used = 0 and pk is null,
                           'sessions_left', left_now);
end $$;

revoke execute on function public.invite_client(bigint) from public, anon;
revoke execute on function public.my_invites() from public, anon;
revoke execute on function public.my_sent_invites() from public, anon;
revoke execute on function public.answer_invite(uuid, boolean) from public, anon;
revoke execute on function public.mark_appointment(uuid, text, boolean) from public, anon;
grant execute on function public.invite_client(bigint) to authenticated;
grant execute on function public.my_invites() to authenticated;
grant execute on function public.my_sent_invites() to authenticated;
grant execute on function public.answer_invite(uuid, boolean) to authenticated;
grant execute on function public.mark_appointment(uuid, text, boolean) to authenticated;
