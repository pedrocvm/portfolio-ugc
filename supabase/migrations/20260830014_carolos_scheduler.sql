-- CarolOS 014 | o agendador passa do Vercel para o Supabase.
--
-- Porquê: o plano Hobby da Vercel só permite um cron por dia, e o CarolOS
-- precisa de sincronizar o Gmail a cada quinze minutos para uma resposta de
-- marca não ficar uma tarde inteira à espera. Degradar a frequência para caber
-- no plano seria estragar o produto para poupar configuração.
--
-- O desenho é: pg_cron dispara → pg_net faz o POST autenticado → o endpoint do
-- CarolOS corre o trabalho e confirma de volta. A Vercel continua a alojar a
-- aplicação; o relógio é que muda de sítio.
--
-- O segredo nunca aparece aqui em texto: vive no Vault e é lido dentro de uma
-- função SECURITY DEFINER que nem o `authenticated` pode chamar.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Registo de disparos ───────────────────────────────────────────────────
-- `job_run` já diz o que o trabalho fez do lado da aplicação. Esta tabela diz
-- outra coisa, que nenhuma das duas pontas sabe sozinha: se a chamada chegou
-- sequer a acontecer. Um cron que dispara para o vazio é o pior dos casos —
-- silencioso e invisível.
create table if not exists public.cron_dispatch (
  id              uuid primary key default gen_random_uuid(),
  job_type        text not null,
  request_id      bigint,
  dispatched_at   timestamptz not null default now(),
  confirmed_at    timestamptz,
  status          text not null default 'sent'
                    check (status in ('sent', 'ok', 'failed', 'timeout', 'skipped', 'unconfigured')),
  status_code     integer,
  processed_count integer,
  error           text
);

create index if not exists cron_dispatch_job_idx on public.cron_dispatch (job_type, dispatched_at desc);
create index if not exists cron_dispatch_open_idx on public.cron_dispatch (status, dispatched_at)
  where status = 'sent';

alter table public.cron_dispatch enable row level security;

drop policy if exists "carolos user reads cron_dispatch" on public.cron_dispatch;
create policy "carolos user reads cron_dispatch" on public.cron_dispatch
  for select to authenticated using (public.is_carolos_user());

-- ── Segredo no Vault ──────────────────────────────────────────────────────
-- Escrito pela aplicação a partir de CRON_SECRET, nunca por SQL escrito à mão.
create or replace function public.carolos_set_cron_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_id uuid;
begin
  if coalesce(p_secret, '') = '' then
    raise exception 'o segredo não pode ser vazio';
  end if;

  select id into v_id from vault.secrets where name = 'carolos_cron_secret';

  if v_id is null then
    perform vault.create_secret(
      p_secret,
      'carolos_cron_secret',
      'Bearer usado pelo pg_cron para chamar /api/jobs/*. Espelha CRON_SECRET.'
    );
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;

revoke execute on function public.carolos_set_cron_secret(text) from anon, authenticated, public;
grant execute on function public.carolos_set_cron_secret(text) to service_role;

-- ── Recuo depois de falhas ────────────────────────────────────────────────
-- Sem isto, um endpoint em baixo levava 96 chamadas por dia a bater na mesma
-- parede. O intervalo cresce com as falhas seguidas, e um 401 recua mais do
-- que um 503: um erro de autenticação é configuração, não uma indisposição
-- passageira, e insistir de cinco em cinco minutos não o resolve.
create or replace function public.carolos_should_dispatch(p_job text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_failures  integer := 0;
  v_last_at   timestamptz;
  v_last_code integer;
  v_cooldown  interval;
  r           record;
begin
  for r in
    select status, status_code, dispatched_at
    from public.cron_dispatch
    where job_type = p_job and status in ('ok', 'failed', 'timeout', 'unconfigured')
    order by dispatched_at desc
    limit 8
  loop
    exit when r.status = 'ok';
    v_failures := v_failures + 1;
    if v_last_at is null then
      v_last_at := r.dispatched_at;
      v_last_code := r.status_code;
    end if;
  end loop;

  if v_failures = 0 then
    return true;
  end if;

  v_cooldown := case
    -- Autenticação ou configuração: não se resolve a insistir.
    when v_last_code in (401, 403) then interval '1 hour'
    else make_interval(mins => least(5 * power(2, v_failures - 1)::int, 120))
  end;

  return now() - v_last_at >= v_cooldown;
end;
$$;

revoke execute on function public.carolos_should_dispatch(text) from anon, authenticated, public;

-- ── O disparo ─────────────────────────────────────────────────────────────
create or replace function public.carolos_dispatch_job(p_job text)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions, net
as $$
declare
  v_base       text;
  v_secret     text;
  v_dispatch   uuid;
  v_request_id bigint;
begin
  if not public.carolos_should_dispatch(p_job) then
    insert into public.cron_dispatch (job_type, status, error, confirmed_at)
    values (p_job, 'skipped', 'Em recuo depois de falhas seguidas.', now())
    returning id into v_dispatch;
    return v_dispatch;
  end if;

  select value ->> 'base_url' into v_base from public.app_setting where key = 'scheduler';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'carolos_cron_secret';

  if coalesce(v_base, '') = '' or coalesce(v_secret, '') = '' then
    insert into public.cron_dispatch (job_type, status, error, confirmed_at)
    values (
      p_job,
      'unconfigured',
      'Falta base_url em app_setting.scheduler ou o segredo carolos_cron_secret no Vault. Liga o agendador em Definições.',
      now()
    )
    returning id into v_dispatch;
    return v_dispatch;
  end if;

  -- A linha nasce antes da chamada e o seu id viaja no corpo: é assim que o
  -- endpoint consegue confirmar exactamente este disparo, em vez de se
  -- adivinhar a correspondência por proximidade de horas.
  insert into public.cron_dispatch (job_type) values (p_job) returning id into v_dispatch;

  select net.http_post(
    url := rtrim(v_base, '/') || '/api/jobs/' || p_job,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('dispatch_id', v_dispatch, 'source', 'pg_cron'),
    timeout_milliseconds := 150000
  ) into v_request_id;

  update public.cron_dispatch set request_id = v_request_id where id = v_dispatch;
  return v_dispatch;
end;
$$;

revoke execute on function public.carolos_dispatch_job(text) from anon, authenticated, public;
grant execute on function public.carolos_dispatch_job(text) to service_role;

-- ── Reconciliação ─────────────────────────────────────────────────────────
-- O caminho normal é o endpoint confirmar-se a si próprio. Esta função existe
-- para o caminho anormal: a resposta perdeu-se, a chamada nunca chegou, ou o
-- endpoint devolveu erro antes de conseguir escrever.
create or replace function public.carolos_reconcile_dispatches()
returns integer
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_count integer := 0;
  d       record;
  resp    record;
begin
  for d in
    select id, job_type, request_id, dispatched_at
    from public.cron_dispatch
    where status = 'sent' and dispatched_at < now() - interval '3 minutes'
    order by dispatched_at
    limit 200
  loop
    resp := null;

    if d.request_id is not null then
      select status_code, error_msg, timed_out
        into resp
        from net._http_response
       where id = d.request_id;
    end if;

    if resp.status_code is not null then
      update public.cron_dispatch
         set status = case when resp.status_code between 200 and 299 then 'ok' else 'failed' end,
             status_code = resp.status_code,
             error = nullif(resp.error_msg, ''),
             confirmed_at = now()
       where id = d.id;

    elsif resp.timed_out or d.dispatched_at < now() - interval '10 minutes' then
      -- O trabalho pode ter corrido à mesma e só a resposta se ter perdido. Se
      -- há um `job_run` deste tipo iniciado depois do disparo, conta como ida.
      if exists (
        select 1 from public.job_run j
        where j.job_type = d.job_type
          and j.started_at between d.dispatched_at and d.dispatched_at + interval '10 minutes'
      ) then
        update public.cron_dispatch
           set status = 'ok',
               error = 'Resposta perdida, mas o trabalho correu.',
               confirmed_at = now()
         where id = d.id;
      else
        update public.cron_dispatch
           set status = 'timeout',
               error = coalesce(nullif(resp.error_msg, ''), 'Sem resposta do endpoint.'),
               confirmed_at = now()
         where id = d.id;
      end if;
    else
      continue;
    end if;

    v_count := v_count + 1;
  end loop;

  -- Sete dias chega para investigar uma falha; mais do que isso é ruído.
  delete from public.cron_dispatch where dispatched_at < now() - interval '7 days';

  return v_count;
end;
$$;

revoke execute on function public.carolos_reconcile_dispatches() from anon, authenticated, public;
grant execute on function public.carolos_reconcile_dispatches() to service_role;

-- ── As frequências ────────────────────────────────────────────────────────
-- Tudo em UTC, que é o relógio do pg_cron. Lisboa anda entre UTC+0 e UTC+1, por
-- isso a janela de trabalho 07h–21h locais cobre-se com 06–21 UTC nos dois
-- lados do ano.
--
-- Os minutos são desencontrados de propósito: dois trabalhos a arrancar no
-- mesmo instante disputam a mesma função serverless sem ganharem nada com isso.
create or replace function public.carolos_apply_schedule()
returns table (job_name text, schedule text)
language plpgsql
security definer
set search_path = public, cron, extensions
as $$
declare
  v_jobs constant text[][] := array[
    -- [nome, expressão, trabalho]
    ['carolos-gmail-sync',      '*/15 6-21 * * *', 'gmail-sync'],
    ['carolos-process-pending', '7,37 * * * *',    'process-pending'],
    ['carolos-followups',       '12 * * * *',      'followups'],
    ['carolos-plan',            '22 * * * *',      'plan'],
    ['carolos-rights',          '40 6 * * *',      'rights'],
    ['carolos-metrics',         '45 6 * * *',      'metrics'],
    ['carolos-upsell',          '50 6 * * *',      'upsell']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_jobs, 1) loop
    perform cron.unschedule(v_jobs[i][1])
      where exists (select 1 from cron.job j where j.jobname = v_jobs[i][1]);

    perform cron.schedule(
      v_jobs[i][1],
      v_jobs[i][2],
      format('select public.carolos_dispatch_job(%L)', v_jobs[i][3])
    );
  end loop;

  perform cron.unschedule('carolos-reconcile')
    where exists (select 1 from cron.job j where j.jobname = 'carolos-reconcile');
  perform cron.schedule(
    'carolos-reconcile',
    '*/5 * * * *',
    'select public.carolos_reconcile_dispatches()'
  );

  return query
    select j.jobname::text, j.schedule::text
    from cron.job j
    where j.jobname like 'carolos-%'
    order by j.jobname;
end;
$$;

revoke execute on function public.carolos_apply_schedule() from anon, authenticated, public;
grant execute on function public.carolos_apply_schedule() to service_role;

create or replace function public.carolos_clear_schedule()
returns integer
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  v_count integer := 0;
  j       record;
begin
  for j in select jobname from cron.job where jobname like 'carolos-%' loop
    perform cron.unschedule(j.jobname);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.carolos_clear_schedule() from anon, authenticated, public;
grant execute on function public.carolos_clear_schedule() to service_role;

-- ── Leitura do estado, para o ecrã de Definições ──────────────────────────
create or replace function public.carolos_schedule_status()
returns table (
  job_name        text,
  schedule        text,
  active          boolean,
  last_dispatch   timestamptz,
  last_status     text,
  last_error      text,
  processed_count integer,
  failures_24h    bigint
)
language sql
stable
security definer
set search_path = public, cron
as $$
  select
    j.jobname::text,
    j.schedule::text,
    j.active,
    d.dispatched_at,
    d.status,
    d.error,
    d.processed_count,
    coalesce(f.failures, 0)
  from cron.job j
  left join lateral (
    select cd.dispatched_at, cd.status, cd.error, cd.processed_count
    from public.cron_dispatch cd
    where 'carolos-' || cd.job_type = j.jobname
       or (j.jobname = 'carolos-reconcile' and false)
    order by cd.dispatched_at desc
    limit 1
  ) d on true
  left join lateral (
    select count(*) as failures
    from public.cron_dispatch cd
    where 'carolos-' || cd.job_type = j.jobname
      and cd.status in ('failed', 'timeout', 'unconfigured')
      and cd.dispatched_at > now() - interval '24 hours'
  ) f on true
  where j.jobname like 'carolos-%'
  order by j.jobname;
$$;

revoke execute on function public.carolos_schedule_status() from anon, public;
grant execute on function public.carolos_schedule_status() to service_role;

-- Semente da configuração. O URL não é segredo e fica à vista; o Bearer vai
-- para o Vault quando a aplicação ligar o agendador.
insert into public.app_setting (key, value, description)
values (
  'scheduler',
  jsonb_build_object('base_url', null, 'configured_at', null),
  'Base do CarolOS que o pg_cron chama. O Bearer vive no Vault, nunca aqui.'
)
on conflict (key) do nothing;
