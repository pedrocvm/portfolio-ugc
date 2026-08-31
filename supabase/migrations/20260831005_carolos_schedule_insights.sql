-- Os avisos proactivos entram no horário.
--
-- Uma vez por dia às 06:55 UTC, depois do upsell: assim o motor de avisos lê o
-- estado já actualizado dessa manhã em vez do de ontem. A deduplicação por
-- chave garante que correr outra vez não duplica nada.
--
-- Só muda a lista de trabalhos; o resto da função é o que já lá estava.
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
    ['carolos-upsell',          '50 6 * * *',      'upsell'],
    ['carolos-insights',        '55 6 * * *',      'insights']
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
