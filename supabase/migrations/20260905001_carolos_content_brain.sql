-- CarolOS · Content Brain
--
-- Conteúdo passa a nascer de matéria-prima real confirmada. Esta migração
-- introduz `creator_story` e as tabelas à volta dela, e evolui as existentes
-- sem apagar nada.
--
-- Três decisões que ficam gravadas aqui:
--
-- 1. Colunas métricas continuam sem `default 0`. Indisponível é NULL.
-- 2. O pilar antigo não é reclassificado por palpite: passa a
--    `legacy_topic_tag` e o pilar funcional entra vazio até haver evidência.
-- 3. Uma ideia antiga gerada por IA nunca vira história real. Fica marcada
--    como `ai_idea_legacy` e não tem `story_id`.
--
-- Append-only. Nenhuma migração já aplicada é editada.

/* ── Matéria-prima ────────────────────────────────────────────────────────── */

create table if not exists public.creator_story (
  id                 uuid primary key default gen_random_uuid(),
  app_user_id        uuid not null references public.app_user (id) on delete cascade,

  title              text not null,
  summary            text not null default '',

  source_type        text not null default 'user_text'
                     check (source_type in ('user_audio', 'user_text', 'gmail_event',
                                            'opportunity_event', 'production_event',
                                            'metric_event', 'import')),
  occurred_at        timestamptz,
  captured_at        timestamptz not null default now(),

  -- Fatos ordenados, sem interpretação. `[{ "text": "...", "confirmed": true }]`
  factual_sequence   jsonb not null default '[]'::jsonb,
  uncertain_points   jsonb not null default '[]'::jsonb,

  -- Só a Carol escreve aqui, ou uma citação literal dela.
  carol_meaning      text,
  carol_quotes       jsonb not null default '[]'::jsonb,

  functional_pillar  text check (functional_pillar in
                     ('attraction_journey', 'information_retention',
                      'authority_conversion', 'connection_personal')),
  territories        text[] not null default '{}',

  privacy_level      text not null default 'restricted'
                     check (privacy_level in ('private', 'restricted', 'content_ok')),
  -- Falso por omissão de propósito: um evento inferido não é autorização.
  allowed_for_content boolean not null default false,

  fact_status        text not null default 'draft'
                     check (fact_status in ('draft', 'needs_confirmation', 'confirmed', 'rejected')),
  fact_confirmed_at  timestamptz,

  status             text not null default 'captured'
                     check (status in ('captured', 'needs_confirmation', 'confirmed', 'mapped',
                                       'structured', 'ready_to_record', 'recorded', 'published',
                                       'measured', 'archived', 'rejected')),

  -- Enquadramento escolhido por ela, e a estrutura construída em cima.
  frame_id           text,
  frame_label        text,
  frame_options      jsonb not null default '[]'::jsonb,
  structure          jsonb,

  series_id          uuid references public.content_series (id) on delete set null,

  -- Áudio bruto, em bucket privado. Apagado por trabalho depois da retenção.
  audio_path         text,
  audio_expires_at   timestamptz,
  transcript         text,

  source_refs        jsonb not null default '{}'::jsonb,
  provenance         jsonb not null default '{}'::jsonb,
  ai_run_id          uuid references public.ai_run (id) on delete set null,
  sot_version        text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- O invariant, também em SQL. Um caminho que contorne o domínio bate aqui.
  constraint creator_story_confirmed_needs_stamp
    check (fact_status <> 'confirmed' or fact_confirmed_at is not null),
  constraint creator_story_structured_needs_confirmation
    check (status not in ('structured', 'ready_to_record')
           or (fact_status = 'confirmed' and fact_confirmed_at is not null))
);

create index if not exists creator_story_queue_idx   on public.creator_story (status, captured_at desc);
create index if not exists creator_story_fact_idx    on public.creator_story (fact_status);
create index if not exists creator_story_pillar_idx  on public.creator_story (functional_pillar, status);
create index if not exists creator_story_series_idx  on public.creator_story (series_id);
create index if not exists creator_story_audio_idx   on public.creator_story (audio_expires_at)
  where audio_path is not null;

drop trigger if exists creator_story_touch on public.creator_story;
create trigger creator_story_touch before update on public.creator_story
  for each row execute function public.touch_updated_at();

/* ── História ↔ conteúdo ──────────────────────────────────────────────────── */

create table if not exists public.content_story_link (
  id              uuid primary key default gen_random_uuid(),
  story_id        uuid not null references public.creator_story (id) on delete cascade,
  content_idea_id uuid not null references public.creator_content_idea (id) on delete cascade,
  relation        text not null default 'primary' check (relation in ('primary', 'supporting', 'variant')),
  created_at      timestamptz not null default now(),
  unique (story_id, content_idea_id)
);

create index if not exists content_story_link_idea_idx on public.content_story_link (content_idea_id);

/* ── Plano semanal ────────────────────────────────────────────────────────── */

create table if not exists public.content_week_plan (
  id              uuid primary key default gen_random_uuid(),
  app_user_id     uuid not null references public.app_user (id) on delete cascade,
  week_start      date not null,
  primary_pillar  text not null check (primary_pillar in
                  ('attraction_journey', 'information_retention',
                   'authority_conversion', 'connection_personal')),
  rationale       text not null default '',
  status          text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  gaps            jsonb not null default '[]'::jsonb,
  source_version  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (app_user_id, week_start)
);

drop trigger if exists content_week_plan_touch on public.content_week_plan;
create trigger content_week_plan_touch before update on public.content_week_plan
  for each row execute function public.touch_updated_at();

create table if not exists public.content_week_slot (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.content_week_plan (id) on delete cascade,
  slot_order      integer not null default 0,
  kind            text not null check (kind in ('story', 'content', 'map_pillar')),
  pillar          text,
  purpose         text not null default 'primary'
                  check (purpose in ('primary', 'complement', 'breather', 'commercial')),
  story_id        uuid references public.creator_story (id) on delete set null,
  content_idea_id uuid references public.creator_content_idea (id) on delete set null,
  reason          text not null default '',
  status          text not null default 'open' check (status in ('open', 'done', 'skipped')),
  created_at      timestamptz not null default now(),

  -- Um slot ou aponta para uma coisa que existe, ou é uma ação de mapear.
  -- Não existe slot com texto de história inventada.
  constraint content_week_slot_points_somewhere
    check ((kind = 'story'      and story_id is not null)
        or (kind = 'content'    and content_idea_id is not null)
        or (kind = 'map_pillar' and pillar is not null))
);

create index if not exists content_week_slot_plan_idx on public.content_week_slot (plan_id, slot_order);

/* ── Candidatos proativos ─────────────────────────────────────────────────── */

create table if not exists public.content_story_candidate (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references public.app_user (id) on delete cascade,
  dedupe_key    text not null,
  source        text not null check (source in ('brand_reply', 'opportunity_stage',
                                                'production_milestone', 'payment',
                                                'social_proof', 'performance_milestone')),
  fact          text not null,
  question      text not null,
  occurred_at   timestamptz not null,
  brand_id      uuid references public.brand (id) on delete set null,
  brand_name    text,
  evidence_refs jsonb not null default '[]'::jsonb,
  status        text not null default 'open' check (status in ('open', 'saved', 'dismissed', 'private')),
  story_id      uuid references public.creator_story (id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (app_user_id, dedupe_key)
);

create index if not exists content_story_candidate_open_idx
  on public.content_story_candidate (status, occurred_at desc);

/* ── Evolução das tabelas existentes ──────────────────────────────────────── */

alter table public.creator_content_idea
  add column if not exists story_id          uuid references public.creator_story (id) on delete set null,
  add column if not exists functional_pillar text,
  add column if not exists legacy_topic_tag  text,
  add column if not exists territories       text[] not null default '{}',
  add column if not exists central_point     text,
  add column if not exists structure_json    jsonb,
  add column if not exists lifecycle         text not null default 'active',
  add column if not exists fact_source_version text,
  add column if not exists external_media_id text;

alter table public.creator_content_idea drop constraint if exists creator_content_idea_functional_pillar_check;
alter table public.creator_content_idea
  add constraint creator_content_idea_functional_pillar_check
  check (functional_pillar is null or functional_pillar in
         ('attraction_journey', 'information_retention', 'authority_conversion', 'connection_personal'));

alter table public.creator_content_idea drop constraint if exists creator_content_idea_lifecycle_check;
alter table public.creator_content_idea
  add constraint creator_content_idea_lifecycle_check
  check (lifecycle in ('active', 'ai_idea_legacy', 'archived'));

create index if not exists creator_content_idea_story_idx on public.creator_content_idea (story_id);
create index if not exists creator_content_idea_fpillar_idx on public.creator_content_idea (functional_pillar, status);

-- Backfill honesto: o pilar antigo era tema, e o tema não determina a função.
-- Move-se para `legacy_topic_tag` e o pilar funcional fica NULL até alguém —
-- ela, ou uma classificação com evidência — o preencher.
update public.creator_content_idea
   set legacy_topic_tag = pillar
 where legacy_topic_tag is null
   and pillar in ('A_SALA', 'TESTEI', 'CASA_A_DOIS', 'CORPO', 'LARGUEI_O_TURNO');

-- Ideias geradas por IA antes do Content Brain não são memória da Carol.
-- Ficam como artefacto histórico, sem `story_id`, e fora das sugestões.
update public.creator_content_idea
   set lifecycle = 'ai_idea_legacy'
 where lifecycle = 'active'
   and story_id is null
   and status in ('seed', 'rejected');

alter table public.content_series
  add column if not exists origin       text not null default 'manual',
  add column if not exists mechanism    text,
  add column if not exists arc          text,
  add column if not exists story_count  integer not null default 0,
  add column if not exists no_invented_episodes boolean not null default true;

alter table public.content_series drop constraint if exists content_series_origin_check;
alter table public.content_series
  add constraint content_series_origin_check
  check (origin in ('manual', 'real_story_cluster', 'legacy'));

alter table public.content_experiment
  add column if not exists ladder_state text not null default 'observation',
  add column if not exists mechanism    text,
  add column if not exists cohort       jsonb not null default '{}'::jsonb,
  add column if not exists evidence_ids text[] not null default '{}',
  add column if not exists policy_version text;

alter table public.content_experiment drop constraint if exists content_experiment_ladder_check;
alter table public.content_experiment
  add constraint content_experiment_ladder_check
  check (ladder_state in ('observation', 'signal', 'hypothesis', 'testing', 'validated', 'rejected'));

alter table public.content_learning
  add column if not exists ladder_state text not null default 'signal',
  add column if not exists mechanism    text,
  add column if not exists evidence_ids text[] not null default '{}',
  add column if not exists cohort       jsonb not null default '{}'::jsonb,
  add column if not exists metric_definition_version text,
  add column if not exists policy_version text,
  add column if not exists validated_at timestamptz,
  add column if not exists rejected_at  timestamptz;

alter table public.content_learning drop constraint if exists content_learning_ladder_check;
alter table public.content_learning
  add constraint content_learning_ladder_check
  check (ladder_state in ('observation', 'signal', 'hypothesis', 'testing', 'validated', 'rejected'));

alter table public.creator_profile
  add column if not exists creative_taste         jsonb not null default '{}'::jsonb,
  add column if not exists taste_version          text,
  add column if not exists allowed_personal_areas text[] not null default '{}',
  add column if not exists excluded_topics        text[] not null default '{}',
  add column if not exists preference_evidence    jsonb not null default '{}'::jsonb;

/* ── RLS ──────────────────────────────────────────────────────────────────── */

alter table public.creator_story           enable row level security;
alter table public.content_story_link      enable row level security;
alter table public.content_week_plan       enable row level security;
alter table public.content_week_slot       enable row level security;
alter table public.content_story_candidate enable row level security;

drop policy if exists "carolos user manages creator_story" on public.creator_story;
create policy "carolos user manages creator_story" on public.creator_story
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user manages content_story_link" on public.content_story_link;
create policy "carolos user manages content_story_link" on public.content_story_link
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user manages content_week_plan" on public.content_week_plan;
create policy "carolos user manages content_week_plan" on public.content_week_plan
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user manages content_week_slot" on public.content_week_slot;
create policy "carolos user manages content_week_slot" on public.content_week_slot
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user manages content_story_candidate" on public.content_story_candidate;
create policy "carolos user manages content_story_candidate" on public.content_story_candidate
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

/* ── Ações do Hoje ────────────────────────────────────────────────────────── */

-- O Content Brain precisa de tipos próprios em `action_item`. Sem isto o
-- `check` recusa a escrita e a decisão de conteúdo nunca chega ao Hoje.
alter table public.action_item drop constraint if exists action_item_type_check;
alter table public.action_item
  add constraint action_item_type_check
  check (type in ('respond', 'follow_up', 'send_portfolio', 'ask_scope', 'send_rate',
                  'negotiate', 'create_proposal', 'start_production', 'request_brief',
                  'deliver', 'request_metrics', 'upsell', 'renew_rights', 'nurture',
                  'close', 'review', 'wait_expired', 'integration_fix', 'chase_payment',
                  'content_map_story', 'content_develop_story', 'content_record_ready',
                  'content_confirm_trial', 'content_save_event', 'content_review_signal',
                  'content_link_media'));

/* ── Bucket privado para o áudio ──────────────────────────────────────────── */

insert into storage.buckets (id, name, public)
values ('story-audio', 'story-audio', false)
on conflict (id) do nothing;

drop policy if exists "carolos user reads story audio" on storage.objects;
create policy "carolos user reads story audio" on storage.objects
  for select to authenticated
  using (bucket_id = 'story-audio' and public.is_carolos_user());

drop policy if exists "carolos user writes story audio" on storage.objects;
create policy "carolos user writes story audio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'story-audio' and public.is_carolos_user());

drop policy if exists "carolos user deletes story audio" on storage.objects;
create policy "carolos user deletes story audio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'story-audio' and public.is_carolos_user());
