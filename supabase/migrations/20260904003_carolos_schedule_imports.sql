-- Os lotes de marcas coladas entram no horário.
--
-- A tela continua o lote enquanto ela a tiver aberta: o vigia no layout
-- pergunta de cinco em cinco segundos e retoma quando o trabalhador anterior
-- chega ao fim do tempo do pedido. Se ela fechar o browser com vinte e cinco
-- marcas por pesquisar, não há quem continue — e é isso que este trabalho
-- resolve.
--
-- De dez em dez minutos, e não uma vez por dia: um lote é trabalho que ela
-- pediu agora e está à espera, não uma rotina de madrugada. Entre as 6h e as
-- 22h, porque nenhum lote começa de noite.
--
-- Retomar é seguro: cada marca é reclamada antes de ser trabalhada, por isso
-- dois trabalhadores nunca pesquisam a mesma duas vezes.
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
    ['carolos-imports',         '*/10 6-22 * * *', 'imports'],
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
