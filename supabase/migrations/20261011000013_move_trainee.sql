-- Owner / manager moves a gym trainee to another trainer.
-- Sessions left and future appointments go with the trainee; past sessions stay credited to the old trainer.
create or replace function public.move_trainee(tc uuid, new_trainer uuid)
returns json language plpgsql security definer set search_path = public as $$
declare t trainer_clients; target uuid; moved int;
begin
  select * into t from trainer_clients where id = tc and status = 'active';
  if t.id is null then raise exception 'trainee not found'; end if;
  if t.gym_id is null or not private.has_gym_role(t.gym_id, array['owner','admin']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if new_trainer = t.trainer_id then raise exception 'same trainer'; end if;
  if not exists (select 1 from gym_staff where gym_id = t.gym_id and user_id = new_trainer and active and role in ('owner','admin','trainer')) then
    raise exception 'trainer not in this gym';
  end if;

  -- the new trainer may already train this person: merge into that link
  select id into target from trainer_clients
   where trainer_id = new_trainer and status = 'active' and id <> t.id
     and ((t.member_id is not null and member_id = t.member_id) or (t.client_id is not null and client_id = t.client_id))
   limit 1;

  if target is null then
    update trainer_clients set trainer_id = new_trainer where id = t.id;
    target := t.id;
  else
    update pt_packages set trainer_client_id = target where trainer_client_id = t.id;
    update appointments set trainer_client_id = target where trainer_client_id = t.id;
    update trainer_clients set status = 'removed', removed_at = now() where id = t.id;
  end if;

  update appointments set trainer_id = new_trainer
   where trainer_client_id = target and status = 'scheduled' and starts_at >= now();
  get diagnostics moved = row_count;

  insert into audit_log(actor_id, gym_id, action, target, target_id, detail)
  values (auth.uid(), t.gym_id, 'move_trainee', 'trainer_clients', target::text,
          jsonb_build_object('from', t.trainer_id, 'to', new_trainer, 'future_appointments', moved, 'merged', target <> t.id));
  return json_build_object('trainer_client_id', target, 'future_appointments', moved);
end $$;
revoke execute on function public.move_trainee(uuid, uuid) from public, anon;
grant execute on function public.move_trainee(uuid, uuid) to authenticated;
