-- A prospecção diária entra no horário.
--
-- 06:10 UTC — 07:10 em Lisboa no verão, 06:10 no inverno. Corre antes do resto
-- da manhã de propósito: quando ela abrir o CarolOS, as marcas do dia já lá
-- estão, e os avisos das 06:55 já as contam.
create or replace function public.carolos_apply_schedule()
returns table (job_name text, schedule text)
language plpgsql
security definer
set search_path = public, cron, extensions
as $$
declare
  v_jobs constant text[][] := array[
    ['carolos-gmail-sync',      '*/15 6-21 * * *', 'gmail-sync'],
    ['carolos-process-pending', '7,37 * * * *',    'process-pending'],
    ['carolos-followups',       '12 * * * *',      'followups'],
    ['carolos-plan',            '22 * * * *',      'plan'],
    ['carolos-rights',          '40 6 * * *',      'rights'],
    ['carolos-metrics',         '45 6 * * *',      'metrics'],
    ['carolos-upsell',          '50 6 * * *',      'upsell'],
    ['carolos-insights',        '55 6 * * *',      'insights'],
    ['carolos-outreach',        '10 6 * * *',      'outreach']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_jobs, 1) loop
    perform cron.unschedule(v_jobs[i][1])
      where exists (select 1 from cron.job j where j.jobname = v_jobs[i][1]);
    perform cron.schedule(
      v_jobs[i][1], v_jobs[i][2],
      format('select public.carolos_dispatch_job(%L)', v_jobs[i][3])
    );
  end loop;

  perform cron.unschedule('carolos-reconcile')
    where exists (select 1 from cron.job j where j.jobname = 'carolos-reconcile');
  perform cron.schedule('carolos-reconcile', '*/5 * * * *',
    'select public.carolos_reconcile_dispatches()');

  return query
    select j.jobname::text, j.schedule::text
    from cron.job j where j.jobname like 'carolos-%' order by j.jobname;
end;
$$;

revoke execute on function public.carolos_apply_schedule() from anon, authenticated, public;
grant execute on function public.carolos_apply_schedule() to service_role;
