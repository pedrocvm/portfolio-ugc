-- CarolOS mínimo: apenas Conteúdo + site público.
--
-- O CRM deixou de fazer parte do produto. Esta migração não apaga histórico,
-- mas tira do relógio qualquer trabalho que só existia para inbox, prospecção,
-- marcas, dinheiro ou operação comercial.

do $$
declare
  j record;
begin
  for j in
    select jobname
    from cron.job
    where jobname like 'carolos-%'
      and jobname not in (
        'carolos-instagram-sync',
        'carolos-instagram-token',
        'carolos-content-community',
        'carolos-content-learning',
        'carolos-content-audit',
        'carolos-content-week',
        'carolos-reconcile'
      )
  loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

create or replace function public.carolos_apply_schedule()
returns table (job_name text, schedule text)
language plpgsql
security definer
set search_path = public, cron, extensions
as $$
declare
  v_jobs constant text[][] := array[
    ['carolos-instagram-sync',    '*/30 * * * *', 'instagram-sync'],
    ['carolos-instagram-token',   '2 6 * * *',    'instagram-token'],
    ['carolos-content-community', '50 6 * * *',   'content-community'],
    ['carolos-content-learning',  '2 7 * * *',    'content-learning'],
    ['carolos-content-audit',     '4 7 * * *',    'content-audit'],
    ['carolos-content-week',      '6 7 * * 1',    'content-week']
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
    where j.jobname in (
      'carolos-instagram-sync',
      'carolos-instagram-token',
      'carolos-content-community',
      'carolos-content-learning',
      'carolos-content-audit',
      'carolos-content-week',
      'carolos-reconcile'
    )
    order by j.jobname;
end;
$$;

revoke execute on function public.carolos_apply_schedule() from anon, authenticated, public;

-- O deploy que contém os seis jobs já precisa existir antes desta migration.
-- Aplicada nessa ordem, a própria migration deixa o relógio no estado novo.
select * from public.carolos_apply_schedule();
