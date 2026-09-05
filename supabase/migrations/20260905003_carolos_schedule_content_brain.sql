-- O Content Brain entra no horário.
--
-- Cinco trabalhos novos, e a ordem importa:
--
--   token → sync → aprendizado → candidatos → limpeza
--
-- O aprendizado lê os snapshots que o sync acabou de tirar. Trocar a ordem
-- fá-lo ler os dados de ontem e chegar sempre um dia atrasado.
--
-- O sync corre de 30 em 30 minutos, não a cada 15: os Stories expiram em 24 h
-- e há sempre uma janela de snapshot aberta, mas o volume é uma conta com
-- vinte peças. De quinze em quinze seria gastar chamadas contra o rate limit
-- da Meta sem ganhar nada.
--
-- Não se criam seis crons por Reel. O `instagram-sync` varre a mídia publicada,
-- calcula que janelas estão abertas agora e tira só essas — e a unicidade
-- `(media_id, snapshot_kind)` garante que uma corrida repetida não duplica.
--
-- Definir não é agendar: quem executa esta função é o botão «Ligar o
-- agendador» em Definições, e só depois do deploy. Agendá-los antes punha a
-- produção a chamar `/api/jobs/instagram-sync` e a receber 404, porque o
-- `isJobName()` do código em produção ainda não conhece o nome.

create or replace function public.carolos_apply_schedule()
returns table (job_name text, schedule text)
language plpgsql
security definer
set search_path = public, cron, extensions
as $$
declare
  v_jobs constant text[][] := array[
    ['carolos-gmail-sync',        '*/15 6-21 * * *', 'gmail-sync'],
    ['carolos-process-pending',   '7,37 * * * *',    'process-pending'],
    ['carolos-followups',         '12 * * * *',      'followups'],
    ['carolos-plan',              '22 * * * *',      'plan'],
    ['carolos-imports',           '*/10 6-22 * * *', 'imports'],
    ['carolos-instagram-sync',    '*/30 * * * *',    'instagram-sync'],
    ['carolos-triage',            '5 6 * * *',       'triage'],
    ['carolos-outreach',          '10 6 * * *',      'outreach'],
    ['carolos-references',        '25 6 * * *',      'references'],
    ['carolos-trends',            '35 6 * * *',      'trends'],
    ['carolos-rights',            '40 6 * * *',      'rights'],
    ['carolos-metrics',           '45 6 * * *',      'metrics'],
    ['carolos-upsell',            '50 6 * * *',      'upsell'],
    ['carolos-insights',          '55 6 * * *',      'insights'],
    ['carolos-milestones',        '58 6 * * *',      'milestones'],
    -- A cadeia do Content Brain, na ordem das dependências.
    ['carolos-instagram-token',   '2 6 * * *',       'instagram-token'],
    ['carolos-content-learning',  '2 7 * * *',       'content-learning'],
    ['carolos-story-candidates',  '5 7 * * *',       'story-candidates'],
    ['carolos-audio-cleanup',     '30 4 * * *',      'audio-cleanup'],
    ['carolos-content',           '7 7 * * *',       'content-plan'],
    ['carolos-morning',           '10 7 * * *',      'morning']
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
