-- Background job: translate the exercise library into Thai through the ex-translate edge function.
-- Every minute pg_cron sends 3 batches of 6 untranslated moves; it stops itself when everything is done.
-- The job token itself is inserted separately (not stored in the repo).
create extension if not exists pg_cron;

create or replace function public.job_token_ok(job text, tok text) returns boolean
language sql security definer set search_path = private as $$
  select exists (select 1 from private.job_tokens where name = job and token = tok and length(tok) >= 32)
$$;
revoke all on function public.job_token_ok(text, text) from public, anon, authenticated;
grant execute on function public.job_token_ok(text, text) to service_role;

create table if not exists private.ex_tr_sent (slug text primary key, at timestamptz not null default now());

create or replace function private.ex_translate_tick() returns int
language plpgsql security definer set search_path = public, private as $$
declare tok text; b text[]; n int := 0;
begin
  select token into tok from private.job_tokens where name = 'ex-translate';
  if tok is null then return 0; end if;
  if not exists (select 1 from exercises where slug is not null and how_to_th is null and how_to_en is not null) then
    perform cron.unschedule('ex-translate');
    return 0;
  end if;
  for i in 1..3 loop
    select array_agg(slug) into b from (
      select e.slug from exercises e
      left join private.ex_tr_sent s on s.slug = e.slug
      where e.slug is not null and e.how_to_th is null and e.how_to_en is not null
        and (s.at is null or s.at < now() - interval '5 minutes')
      order by e.slug limit 6) q;
    exit when b is null;
    insert into private.ex_tr_sent (slug) select unnest(b) on conflict (slug) do update set at = now();
    perform net.http_post(
      url := 'https://tfuafjdhxzlagclbnmws.supabase.co/functions/v1/ex-translate',
      body := jsonb_build_object('slugs', to_jsonb(b), 'token', tok),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 120000);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.ex_translate_tick() from public, anon, authenticated;
