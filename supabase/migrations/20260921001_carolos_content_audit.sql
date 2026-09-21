-- CarolOS · Auditoria do Instagram
--
-- A ingestão, os snapshots, as sequências de Stories e a escada de aprendizado
-- já existiam (`20260905002`, `20260907002`). O que faltava era a camada de
-- cima: transformar o que está medido em conclusões com prova, recomendações
-- que viram teste, e testes que viram decisão.
--
-- Cinco regras que o schema faz cumprir, não só o código:
--
-- 1. **Uma auditoria é um registo histórico, não uma vista.** `content_audit_run`
--    grava a janela analisada, as conclusões e a versão do motor que as
--    produziu. Se a fórmula mudar amanhã, sabe-se com que versão se concluiu.
-- 2. **Recomendação sem evidência não existe.** `evidence` é obrigatório e
--    `check` recusa um objeto vazio. Uma frase que não aponta para peças,
--    aprendizados ou testes não entra na tabela.
-- 3. **Idempotência por chave natural.** `unique (dedupe_key)` nas duas tabelas
--    novas: correr a auditoria duas vezes no mesmo dia não duplica nada.
-- 4. **`content_experiment` não nasce de novo.** A tabela já existia com a
--    unicidade em `kind`, e dois upserts em produção dependem dela. Mantém-se
--    intacta; o que entra são as colunas que faltavam para um teste ser mesmo
--    um teste — variável, braços, métrica principal e veredito.
-- 5. **Zero real continua sendo diferente de indisponível.** Nenhuma coluna
--    métrica nova tem `default 0`.

/* ── Conta: o que faltava no retrato diário ───────────────────────────────── */

-- `followers_count` já existia e é de onde sai o crescimento líquido derivado.
-- Estas três completam o retrato sem obrigar ninguém a ir à API outra vez.
alter table public.instagram_account_snapshot
  add column if not exists follows_count integer,
  add column if not exists media_count   integer,
  add column if not exists likes         bigint,
  add column if not exists comments      bigint,
  add column if not exists shares        bigint,
  add column if not exists saves         bigint,
  add column if not exists replies       bigint;

create index if not exists instagram_account_snapshot_recent_idx
  on public.instagram_account_snapshot (account_id, observed_on desc);

/* ── Auditoria ────────────────────────────────────────────────────────────── */

create table if not exists public.content_audit_run (
  id             uuid primary key default gen_random_uuid(),

  -- Idempotência: a mesma janela no mesmo dia é a mesma corrida.
  dedupe_key     text not null,

  period         text not null default '30d'
                 check (period in ('7d', '30d', '90d', 'all', 'custom')),
  /** `null` em «todo o histórico»: não há início. */
  window_from    timestamptz,
  window_to      timestamptz not null,
  /** A janela anterior usada para dizer «mudou». Nula quando não existe. */
  previous_from  timestamptz,
  previous_to    timestamptz,

  -- [{ key, bucket, text, sample, sampleSize, confidence, metric, comparator,
  --    evidence: { mediaIds, learningIds, experimentIds, sequenceIds } }]
  conclusions    jsonb not null default '[]'::jsonb,
  /** As chaves das conclusões, desnormalizadas, para o «o que é novo» não ter
   *  de abrir o jsonb inteiro da corrida anterior. */
  conclusion_keys text[] not null default '{}',
  /** A frase honesta sobre o que ainda não dá para dizer. */
  coverage       text not null default '',

  -- Contagens do que a corrida viu. Servem a observabilidade, não a tela.
  media_considered      integer not null default 0,
  comparable_media      integer not null default 0,
  recommendations_open  integer not null default 0,
  learnings_active      integer not null default 0,

  engine_version text not null,
  status         text not null default 'ok' check (status in ('ok', 'partial', 'failed')),
  failures       text[] not null default '{}',
  duration_ms    integer,

  created_at     timestamptz not null default now(),
  unique (dedupe_key)
);

create index if not exists content_audit_run_recent_idx on public.content_audit_run (created_at desc);
-- A tela e o «o que é novo» pedem sempre a última corrida DE UM PERÍODO.
create index if not exists content_audit_run_period_idx on public.content_audit_run (period, created_at desc);

/* ── Recomendações ────────────────────────────────────────────────────────── */

create table if not exists public.content_recommendation (
  id             uuid primary key default gen_random_uuid(),

  -- A mesma recomendação sobre a mesma evidência não duplica entre corridas.
  dedupe_key     text not null,

  kind           text not null
                 check (kind in ('repeat_mechanism', 'test_variable', 'close_experiment',
                                 'watch_signal', 'link_context')),
  statement      text not null,
  /** Porquê. É a frase que abre «Ver evidências». */
  because        text not null default '',

  status         text not null default 'open'
                 check (status in ('open', 'executed', 'dismissed', 'superseded', 'invalid')),
  /** Porque é que deixou de estar aberta. Nunca se encerra em silêncio. */
  closed_because text,
  closed_at      timestamptz,

  sample_size    integer not null default 0,
  confidence     text not null default 'low' check (confidence in ('low', 'medium', 'high')),

  -- { mediaIds: [], learningIds: [], experimentIds: [], sequenceIds: [] }
  -- Uma recomendação sem nenhuma evidência rastreável não pode existir.
  evidence       jsonb not null default '{}'::jsonb,
  constraint content_recommendation_has_evidence check (
    jsonb_array_length(coalesce(evidence -> 'mediaIds', '[]'::jsonb)) > 0
    or jsonb_array_length(coalesce(evidence -> 'learningIds', '[]'::jsonb)) > 0
    or jsonb_array_length(coalesce(evidence -> 'experimentIds', '[]'::jsonb)) > 0
    or jsonb_array_length(coalesce(evidence -> 'sequenceIds', '[]'::jsonb)) > 0
  ),

  -- { hypothesis, variable, control, variant, primaryMetric, secondaryMetrics }
  -- Pré-preenchido para o «Criar teste» não abrir numa tela vazia.
  test_draft     jsonb,

  /** O teste que nasceu desta recomendação, quando ela carregou em «Criar teste». */
  experiment_id  uuid references public.content_experiment (id) on delete set null,
  /** A ideia ou história que nasceu daqui, quando virou conteúdo. */
  content_idea_id uuid references public.creator_content_idea (id) on delete set null,

  /** «Não foi útil». Só afeta prioridade e texto — nunca apaga histórico. */
  feedback       text check (feedback in ('useful', 'not_useful')),
  feedback_at    timestamptz,

  audit_run_id   uuid references public.content_audit_run (id) on delete set null,
  engine_version text not null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (dedupe_key)
);

create index if not exists content_recommendation_open_idx
  on public.content_recommendation (status, confidence desc, sample_size desc)
  where status = 'open';

drop trigger if exists content_recommendation_touch on public.content_recommendation;
create trigger content_recommendation_touch before update on public.content_recommendation
  for each row execute function public.touch_updated_at();

/* ── Testes: as colunas que faltavam ──────────────────────────────────────── */

-- A tabela fica como está. `unique (kind)` continua valendo — dois upserts em
-- produção (`content-os-service`) dependem dela, e um teste novo nasce com um
-- `kind` próprio e único em vez de forçar uma migração de constraint.
alter table public.content_experiment
  add column if not exists variable           text,
  add column if not exists control_label      text,
  add column if not exists variant_label      text,
  add column if not exists primary_metric     text,
  add column if not exists secondary_metrics  text[] not null default '{}',
  /** Maior é melhor? Falso para skip rate e afins. */
  add column if not exists higher_is_better   boolean not null default true,
  /** Os braços, por mídia. Um Reel de teste é isto — não uma inferência sobre
   *  `is_trial`, que a API não dá. */
  add column if not exists control_media_ids  uuid[] not null default '{}',
  add column if not exists variant_media_ids  uuid[] not null default '{}',
  /** De onde nasceu: a mentoria, uma recomendação, ou ela. */
  add column if not exists origin             text not null default 'mentor_session'
                 check (origin in ('mentor_session', 'recommendation', 'carol')),
  add column if not exists recommendation_id  uuid,
  /** { outcome, because, primary, secondary, supporting, contradicting,
   *    sampleSize, repeatWorth, policyVersion } */
  add column if not exists verdict            jsonb not null default '{}'::jsonb,
  add column if not exists evaluated_at       timestamptz,
  add column if not exists policy_version     text,
  add column if not exists learning_id        uuid references public.content_learning (id) on delete set null;

alter table public.content_experiment drop constraint if exists content_experiment_recommendation_fk;
alter table public.content_experiment
  add constraint content_experiment_recommendation_fk
  foreign key (recommendation_id) references public.content_recommendation (id) on delete set null;

create index if not exists content_experiment_running_idx
  on public.content_experiment (status, updated_at desc)
  where status in ('running', 'measured');

/* ── Mídia: o teste a que pertence ────────────────────────────────────────── */

-- A verdade sobre experimentos é do CarolOS, não da Meta. Uma mídia sabe de que
-- teste nasceu porque o CarolOS a ligou — por confirmação ou por associação de
-- alta confiança —, nunca porque `is_trial` existiu (não existe).
alter table public.instagram_media
  add column if not exists experiment_id  uuid references public.content_experiment (id) on delete set null,
  add column if not exists experiment_arm text check (experiment_arm in ('control', 'variant'));

create index if not exists instagram_media_experiment_idx
  on public.instagram_media (experiment_id)
  where experiment_id is not null;

/* ── RLS ──────────────────────────────────────────────────────────────────── */

alter table public.content_audit_run       enable row level security;
alter table public.content_recommendation  enable row level security;

drop policy if exists "carolos user reads content_audit_run" on public.content_audit_run;
create policy "carolos user reads content_audit_run" on public.content_audit_run
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user manages content_recommendation" on public.content_recommendation;
create policy "carolos user manages content_recommendation" on public.content_recommendation
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

/* ── Horário ──────────────────────────────────────────────────────────────── */

-- Mesma lista de `20260907002` mais um trabalho: a auditoria consolidada. Corre
-- depois do aprendizado (07:02) e antes do plano da semana (07:07), porque é
-- dela que saem as recomendações que o plano pode consultar.
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
    ['carolos-instagram-token',   '2 6 * * *',       'instagram-token'],
    ['carolos-content-learning',  '2 7 * * *',       'content-learning'],
    ['carolos-content-audit',     '4 7 * * *',       'content-audit'],
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
