-- Morning Autopilot: o trabalho todo feito antes de ela acordar.
--
-- O CarolOS já pensava. O que faltava era ter pensado ANTES — e guardar o
-- resultado num sítio que o Hoje consiga ler sem chamar um modelo. Todas as
-- tabelas aqui existem para isso: são o resultado do trabalho nocturno, não
-- formulários para alguém preencher.
--
-- Nenhuma delas guarda uma opinião sem a fonte de onde saiu. Uma referência
-- sem link não é referência, é uma alegação.

-- ── Referências criativas ────────────────────────────────────────────────────
-- Um vídeo real, visto num sítio real, com a análise do que o faz funcionar.
-- Serve duas coisas diferentes e por isso tem `purpose`: inspirar o que a Carol
-- gravaria PARA uma marca, ou o que ela gravaria PARA ELA.
create table if not exists public.creative_reference (
  id             uuid primary key default gen_random_uuid(),
  source_platform text not null
                   check (source_platform in ('instagram','tiktok','youtube','meta_ads','tiktok_creative_center','web','other')),
  source_url     text not null,
  -- Deduplicação por endereço normalizado. Duas corridas encontram o mesmo
  -- vídeo; não é para ficar duas vezes.
  url_hash       text not null,
  creator_handle text,
  brand_name     text,
  title          text not null default '',
  published_at   date,
  captured_at    timestamptz not null default now(),
  content_type   text,
  format         text not null default '',
  hook           text not null default '',
  duration_seconds integer,
  structure      text not null default '',
  editing_style  text not null default '',
  why_it_works   text not null default '',
  -- Indicadores só quando verificáveis. Um número que ninguém viu não entra.
  signals        jsonb not null default '[]'::jsonb,
  metrics        jsonb not null default '{}'::jsonb,
  freshness      text not null default 'unknown'
                   check (freshness in ('fresh','recent','aging','stale','unknown')),
  source_confidence text not null default 'unverified'
                   check (source_confidence in ('verified','reported','unverified')),
  purpose        text not null default 'brand' check (purpose in ('brand','creator')),
  ai_run_id      uuid references public.ai_run (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (url_hash)
);

create index if not exists creative_reference_purpose_idx
  on public.creative_reference (purpose, captured_at desc);

-- A ligação entre uma marca candidata e uma referência. A adaptação vive aqui,
-- não na referência: a mesma referência serve marcas diferentes de formas
-- diferentes.
create table if not exists public.candidate_reference (
  id             uuid primary key default gen_random_uuid(),
  outreach_candidate_id uuid not null references public.outreach_candidate (id) on delete cascade,
  creative_reference_id uuid not null references public.creative_reference (id) on delete cascade,
  rank           integer not null default 0,
  fit_reason     text not null default '',
  adaptation     text not null default '',
  do_not_copy    text not null default '',
  created_at     timestamptz not null default now(),
  unique (outreach_candidate_id, creative_reference_id)
);

create index if not exists candidate_reference_candidate_idx
  on public.candidate_reference (outreach_candidate_id, rank);

-- A candidata passa a saber o que a Carol gravaria para ela.
alter table public.outreach_candidate
  add column if not exists creative_angle    text,
  add column if not exists ready_idea        jsonb,
  add column if not exists references_state  text not null default 'pending'
                             check (references_state in ('pending','done','empty','failed','skipped')),
  add column if not exists references_at     timestamptz,
  add column if not exists references_note   text;

-- ── Tendências ───────────────────────────────────────────────────────────────
-- Uma tendência sem data de detecção é uma afirmação. Aqui tem.
create table if not exists public.creator_trend (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null default 'other'
                  check (platform in ('instagram','tiktok','youtube','capcut','multi','other')),
  title         text not null,
  kind          text not null default 'format'
                  check (kind in ('format','hook','editing','structure','series','audio','text','transition','pov','other')),
  description   text not null default '',
  why_trending  text not null default '',
  evidence      jsonb not null default '[]'::jsonb,
  source_url    text,
  published_at  date,
  detected_at   timestamptz not null default now(),
  freshness     text not null default 'unknown'
                  check (freshness in ('fresh','recent','aging','stale','unknown')),
  -- Encaixe na Carol: não é o mesmo que estar a subir.
  fit_score     integer,
  fit_reason    text not null default '',
  fit_verdict   text not null default 'skip' check (fit_verdict in ('adopt','adapt','skip')),
  adaptation    text not null default '',
  -- Deduplicação estável entre corridas.
  fingerprint   text not null,
  run_id        uuid,
  created_at    timestamptz not null default now(),
  unique (fingerprint)
);

create index if not exists creator_trend_detected_idx
  on public.creator_trend (detected_at desc);

-- ── Perfil de criadora ───────────────────────────────────────────────────────
-- O que é natural para a Carol e o que seria estranho. Uma linha por pessoa,
-- reescrita quando há material novo. `coverage` é a honestidade: se não se
-- conseguiu ver o perfil, isso diz-se em vez de se inventar um retrato.
create table if not exists public.creator_profile (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references public.app_user (id) on delete cascade,
  handle        text not null default '',
  dimensions    jsonb not null default '{}'::jsonb,
  topics        jsonb not null default '[]'::jsonb,
  successful_formats jsonb not null default '[]'::jsonb,
  avoided_formats    jsonb not null default '[]'::jsonb,
  evidence      jsonb not null default '[]'::jsonb,
  coverage      text not null default 'unknown'
                  check (coverage in ('observed','partial','unknown')),
  sample_size   integer not null default 0,
  ai_run_id     uuid references public.ai_run (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (app_user_id)
);

-- ── Séries ───────────────────────────────────────────────────────────────────
create table if not exists public.content_series (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  premise       text not null default '',
  structure     text not null default '',
  episodes      integer not null default 0,
  last_episode_at timestamptz,
  next_topics   jsonb not null default '[]'::jsonb,
  status        text not null default 'active' check (status in ('active','paused','ended')),
  created_at    timestamptz not null default now(),
  unique (name)
);

-- ── Marcos reais do negócio ─────────────────────────────────────────────────
-- Derivados de eventos, nunca escritos à mão. Sem evidência não nascem, porque
-- um marco inventado vira um vídeo a contar uma coisa que não aconteceu.
create table if not exists public.business_milestone (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  dedupe_key    text not null,
  occurred_at   timestamptz not null,
  brand_id      uuid references public.brand (id) on delete set null,
  summary       text not null,
  evidence      jsonb not null default '[]'::jsonb,
  used_for_content boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (dedupe_key)
);

-- ── Ideias de conteúdo próprio ──────────────────────────────────────────────
create table if not exists public.creator_content_idea (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references public.app_user (id) on delete cascade,
  plan_date     date not null,
  platform      text not null check (platform in ('instagram','tiktok')),
  status        text not null default 'ready'
                  check (status in ('ready','saved','recorded','published','archived','discarded')),
  pillar        text not null default '',
  objective     text not null default '',
  format        text not null default '',
  source_reason text not null default '',
  title         text not null default '',
  hook          text not null default '',
  alt_hooks     jsonb not null default '[]'::jsonb,
  script        text not null default '',
  shot_list     jsonb not null default '[]'::jsonb,
  b_roll        jsonb not null default '[]'::jsonb,
  on_screen_text jsonb not null default '[]'::jsonb,
  editing_plan  jsonb not null default '{}'::jsonb,
  caption       text not null default '',
  cta           text not null default '',
  cover_note    text not null default '',
  posting_notes text not null default '',
  duration_seconds integer,
  estimated_record_minutes integer,
  estimated_edit_minutes   integer,
  why_it_can_work text not null default '',
  authority_signal text not null default '',
  engagement_mechanism text not null default '',
  -- «Se um marketing manager vir isto, aumenta ou diminui a vontade de a
  -- contratar?» Guardado como sinal, não mostrado como número.
  brand_audience_effect text not null default 'neutral'
                  check (brand_audience_effect in ('up','neutral','down')),
  mentorship_signal boolean not null default false,
  quality       jsonb not null default '{}'::jsonb,
  reference_ids uuid[] not null default '{}',
  trend_ids     uuid[] not null default '{}',
  series_id     uuid references public.content_series (id) on delete set null,
  episode       integer,
  milestone_id  uuid references public.business_milestone (id) on delete set null,
  collaboration_id uuid references public.collaboration (id) on delete set null,
  -- Impede repetir o mesmo gancho ou o mesmo assunto semana após semana.
  fingerprint   text not null,
  -- Uma ideia nascida de uma tendência morre com ela.
  fresh_until   date,
  generated_at  timestamptz not null default now(),
  decided_at    timestamptz,
  ai_run_id     uuid references public.ai_run (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists creator_content_idea_plan_idx
  on public.creator_content_idea (plan_date desc, platform);
create index if not exists creator_content_idea_status_idx
  on public.creator_content_idea (status, generated_at desc);
create index if not exists creator_content_idea_fingerprint_idx
  on public.creator_content_idea (fingerprint);

-- ── Desempenho, quando existir ──────────────────────────────────────────────
-- O schema existe para poder responder às perguntas do futuro. Não se inventa
-- um número para o encher.
create table if not exists public.content_performance (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid references public.creator_content_idea (id) on delete cascade,
  platform      text not null,
  post_url      text,
  measured_at   timestamptz not null default now(),
  views         integer,
  watch_time_seconds integer,
  likes         integer,
  comments      integer,
  shares        integer,
  saves         integer,
  profile_visits integer,
  follows       integer,
  inbound_leads integer,
  source        text not null default 'manual' check (source in ('manual','api')),
  created_at    timestamptz not null default now()
);

-- ── Inteligência de email, preparada de madrugada ───────────────────────────
-- O bug conceptual que isto elimina: classificar a intenção olhando para a
-- última mensagem, mesmo quando a última mensagem é dela. Uma conversa tem
-- três relógios diferentes — o dela, o da marca, e o de quem está à espera de
-- quem — e só o terceiro decide se há trabalho.
create table if not exists public.thread_intel (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references public.source_thread (id) on delete cascade,
  opportunity_id uuid references public.opportunity (id) on delete set null,
  brand_id      uuid references public.brand (id) on delete set null,

  last_external_message_id uuid references public.source_message (id) on delete set null,
  last_carol_message_id    uuid references public.source_message (id) on delete set null,
  waiting_on    text not null default 'nobody' check (waiting_on in ('carol','brand','nobody')),
  waiting_since timestamptz,

  intent        text not null default 'UNCERTAIN',
  intent_confidence numeric,
  secondary_intents jsonb not null default '[]'::jsonb,

  who_wrote     text not null default '',
  what_they_want text not null default '',
  what_changed  text not null default '',
  what_is_missing text not null default '',
  risk          text not null default '',
  risk_level    text not null default 'none' check (risk_level in ('none','low','medium','high')),
  recommendation text not null default '',

  draft_subject text not null default '',
  draft_body    text not null default '',
  draft_language text not null default 'pt-PT',
  draft_state   text not null default 'none'
                  check (draft_state in ('none','ready','stale','failed','sent','skipped')),
  draft_reason  text not null default '',
  draft_run_id  uuid references public.ai_run (id) on delete set null,

  -- De que estado do mundo esta preparação saiu. Muda a conversa, fica velha.
  source_fingerprint text not null default '',
  prepared_at   timestamptz,
  failure       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (thread_id)
);

create index if not exists thread_intel_waiting_idx
  on public.thread_intel (waiting_on, waiting_since);

-- ── Memória de voz ──────────────────────────────────────────────────────────
-- Cada vez que ela corrige um rascunho, o sistema aprende. Hoje a correcção
-- era deitada fora. Aprende ESTILO — nunca política comercial.
create table if not exists public.voice_memory (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('reply','outreach','content')),
  language      text not null default 'pt-PT',
  ai_text       text not null default '',
  final_text    text not null default '',
  brand_id      uuid references public.brand (id) on delete set null,
  thread_id     uuid references public.source_thread (id) on delete set null,
  observations  jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists voice_memory_recent_idx
  on public.voice_memory (kind, created_at desc);

-- ── A manhã consolidada ─────────────────────────────────────────────────────
-- Uma linha por dia. É o que o Hoje lê: já decidido, já ordenado, já contado.
create table if not exists public.morning_brief (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references public.app_user (id) on delete cascade,
  brief_date    date not null,
  status        text not null default 'building'
                  check (status in ('building','ready','partial','failed')),
  -- O que o sistema fez enquanto ela dormia, contado por área.
  prepared      jsonb not null default '{}'::jsonb,
  -- O que NÃO conseguiu fazer, dito por palavras. Fingir que correu tudo bem é
  -- a forma mais rápida de perder a confiança dela.
  gaps          jsonb not null default '[]'::jsonb,
  decisions     jsonb not null default '[]'::jsonb,
  decision_count integer not null default 0,
  estimated_minutes integer,
  headline      text not null default '',
  opened_at     timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (app_user_id, brief_date)
);

-- ── RLS: o mesmo desenho do resto do CarolOS ────────────────────────────────
alter table public.creative_reference     enable row level security;
alter table public.candidate_reference    enable row level security;
alter table public.creator_trend          enable row level security;
alter table public.creator_profile        enable row level security;
alter table public.content_series         enable row level security;
alter table public.business_milestone     enable row level security;
alter table public.creator_content_idea   enable row level security;
alter table public.content_performance    enable row level security;
alter table public.thread_intel           enable row level security;
alter table public.voice_memory           enable row level security;
alter table public.morning_brief          enable row level security;

drop policy if exists "carolos user manages creative_reference" on public.creative_reference;
create policy "carolos user manages creative_reference" on public.creative_reference
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages candidate_reference" on public.candidate_reference;
create policy "carolos user manages candidate_reference" on public.candidate_reference
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages creator_trend" on public.creator_trend;
create policy "carolos user manages creator_trend" on public.creator_trend
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages creator_profile" on public.creator_profile;
create policy "carolos user manages creator_profile" on public.creator_profile
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages content_series" on public.content_series;
create policy "carolos user manages content_series" on public.content_series
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages business_milestone" on public.business_milestone;
create policy "carolos user manages business_milestone" on public.business_milestone
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages creator_content_idea" on public.creator_content_idea;
create policy "carolos user manages creator_content_idea" on public.creator_content_idea
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages content_performance" on public.content_performance;
create policy "carolos user manages content_performance" on public.content_performance
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages thread_intel" on public.thread_intel;
create policy "carolos user manages thread_intel" on public.thread_intel
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages voice_memory" on public.voice_memory;
create policy "carolos user manages voice_memory" on public.voice_memory
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages morning_brief" on public.morning_brief;
create policy "carolos user manages morning_brief" on public.morning_brief
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());
