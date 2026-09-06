-- CarolOS · Content Intelligence: Feed + Stories
--
-- O que a base passa a saber:
--
-- 1. **Uma leitura atual para todo o Feed.** Só se media dentro das janelas
--    (1h…30d), por isso uma publicação de 2024 nunca tinha métrica nenhuma da
--    API. `latest` é a leitura mais recente, seja qual for a idade — e diz a
--    idade. Não é «30 dias»; é «hoje».
-- 2. **Stories têm janelas próprias** (1h, 6h, 12h, 23h): expiram em 24 h e
--    a última leitura possível é antes disso.
-- 3. **Um Story que deixou de aparecer em `me/stories` fica marcado como
--    expirado**, com a hora. Não desaparece: é história.
-- 4. **Sequências de Stories** são uma tabela, agrupadas por regra
--    determinística e corrigíveis à mão (`locked`).
-- 5. **Auditoria por peça** (formato, tema, gancho) com origem e confiança —
--    nunca sem dizer de onde veio.
--
-- E o horário do Content Brain, que ficou definido a 05/09 e nunca aplicado:
-- volta aqui, com os mesmos trabalhos. Definir não é agendar — quem agenda é
-- «Ligar o agendador» em Definições, ou `select public.carolos_apply_schedule()`.

/* ── Snapshots: janelas de story e a leitura atual ────────────────────────── */

alter table public.instagram_media_snapshot drop constraint if exists instagram_media_snapshot_snapshot_kind_check;
alter table public.instagram_media_snapshot
  add constraint instagram_media_snapshot_snapshot_kind_check
  check (snapshot_kind in ('t1h', 't6h', 't12h', 't23h', 't24h', 't72h', 't7d', 't30d', 'latest'));

/* ── Mídia: expiração de stories, sequência e auditoria ───────────────────── */

alter table public.instagram_media
  add column if not exists last_seen_active_at timestamptz,
  add column if not exists expired_at          timestamptz,
  add column if not exists sequence_id         uuid,
  add column if not exists audit               jsonb not null default '{}'::jsonb,
  add column if not exists audit_source        text check (audit_source in ('ai_caption', 'carol', 'story_link')),
  add column if not exists audited_at          timestamptz;

create index if not exists instagram_media_stories_idx
  on public.instagram_media (account_id, published_at desc)
  where media_product_type = 'STORY';

/* ── Sequências de Stories ────────────────────────────────────────────────── */

create table if not exists public.instagram_story_sequence (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.instagram_account (id) on delete cascade,
  started_at     timestamptz not null,
  ended_at       timestamptz not null,
  story_count    integer not null default 0,
  label          text not null default '',
  -- [{ tag, source: 'carol' | 'ai', confidence }]
  tags           jsonb not null default '[]'::jsonb,
  -- Derivadas dos snapshots; recalculadas a cada sync. Nunca «retenção real».
  metrics        jsonb not null default '{}'::jsonb,
  method         text not null default 'deterministic' check (method in ('deterministic', 'manual')),
  -- Verdadeiro quando ela corrigiu o agrupamento: a regra não volta a mexer.
  locked         boolean not null default false,
  policy_version text not null default 'CAROL_STORY_SEQUENCE_V1',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (account_id, started_at)
);

drop trigger if exists instagram_story_sequence_touch on public.instagram_story_sequence;
create trigger instagram_story_sequence_touch before update on public.instagram_story_sequence
  for each row execute function public.touch_updated_at();

alter table public.instagram_media drop constraint if exists instagram_media_sequence_fk;
alter table public.instagram_media
  add constraint instagram_media_sequence_fk
  foreign key (sequence_id) references public.instagram_story_sequence (id) on delete set null;

alter table public.instagram_story_sequence enable row level security;
drop policy if exists "carolos user manages instagram_story_sequence" on public.instagram_story_sequence;
create policy "carolos user manages instagram_story_sequence" on public.instagram_story_sequence
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

/* ── Horário ──────────────────────────────────────────────────────────────── */

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
    -- Stories expiram em 24 h e a janela mais curta é 1 h: de 30 em 30 min
    -- nenhum fica por registar, e o volume — uma conta — cabe no rate limit.
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
