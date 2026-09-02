-- A manhã entra no horário, por ordem de dependência.
--
-- Não são cinco crons independentes a produzir cinco experiências soltas: é
-- uma cadeia. Cada trabalho corre depois daquilo de que precisa, e o último —
-- a consolidação — só marca a manhã como pronta quando o que era essencial já
-- correu ou já expirou.
--
--   06:05  triagem de email      precisa da sincronização das 06:00
--   06:10  prospecção            (já existia)
--   06:25  referências criativas precisa das marcas escolhidas às 06:10
--   06:35  tendências            independente
--   06:40  licenças              (já existia)
--   06:45  métricas              (já existia)
--   06:50  próxima oferta        (já existia)
--   06:55  o que precisa de atenção (já existia)
--   06:58  marcos do negócio     precisa do estado já actualizado
--   07:00  plano de conteúdo     precisa de tendências, perfil e marcos
--   07:10  consolidação da manhã precisa de tudo o resto
--
-- Os horários são UTC. Em Lisboa no verão isto é uma hora mais tarde, o que
-- põe a manhã pronta às 08:10 — antes de ela abrir o telemóvel.
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
    ['carolos-triage',          '5 6 * * *',       'triage'],
    ['carolos-outreach',        '10 6 * * *',      'outreach'],
    ['carolos-references',      '25 6 * * *',      'references'],
    ['carolos-trends',          '35 6 * * *',      'trends'],
    ['carolos-rights',          '40 6 * * *',      'rights'],
    ['carolos-metrics',         '45 6 * * *',      'metrics'],
    ['carolos-upsell',          '50 6 * * *',      'upsell'],
    ['carolos-insights',        '55 6 * * *',      'insights'],
    ['carolos-milestones',      '58 6 * * *',      'milestones'],
    ['carolos-content',         '0 7 * * *',       'content-plan'],
    ['carolos-morning',         '10 7 * * *',      'morning']
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
