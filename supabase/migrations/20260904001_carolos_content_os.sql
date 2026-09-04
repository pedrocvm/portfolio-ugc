-- Carol Content OS: a mentoria aplicada, não arquivada.
--
-- A sessão de mentoria de 01/09/2026 ensinou regras — três ganchos, herói e
-- vilão, Reels Test para público frio, B-roll de 5 a 7 segundos, documentar a
-- jornada, feedback de marca como prova social. Nada disto vive num prompt: a
-- estrutura vive em `modules/creator/mentor-playbook.ts`, e estas tabelas são
-- onde o que o motor decide fica gravado com o rasto de porque decidiu.
--
-- Nenhuma delas é um formulário para a Carol preencher. Os ganchos entram
-- quando uma ideia é salva; o desempenho entra por print; os aprendizados
-- derivam-se; a prova social nasce de um evento ou de um texto colado.

-- ── A ideia passa a saber a função, o modo, os ganchos e a história ────────
alter table public.creator_content_idea
  add column if not exists content_function text
    check (content_function in ('attract_connect','educate_retain','convert')),
  add column if not exists editorial_modes jsonb not null default '[]'::jsonb,
  add column if not exists hooks jsonb not null default '{}'::jsonb,
  add column if not exists story jsonb not null default '{}'::jsonb,
  add column if not exists reels_test jsonb not null default '{}'::jsonb,
  add column if not exists decision_trace jsonb not null default '{}'::jsonb,
  add column if not exists language text not null default 'pt-BR',
  -- Onde a peça vive: o feed normal, o Reels Test, a experiência em inglês, a
  -- série Braga Real, a prova de ofício de edição, a jornada.
  add column if not exists track text not null default 'main'
    check (track in ('main','reels_test','english','braga_real','capcut','journey')),
  add column if not exists broll_asset_ids uuid[] not null default '{}',
  -- Uma variante legítima sabe de que peça veio.
  add column if not exists parent_idea_id uuid references public.creator_content_idea (id) on delete set null,
  add column if not exists playbook_version text;

create index if not exists creator_content_idea_track_idx
  on public.creator_content_idea (track, status, plan_date desc);

-- ── Desempenho: o que o print diz ─────────────────────────────────────────
alter table public.content_performance
  add column if not exists reach integer,
  add column if not exists non_follower_reach integer,
  add column if not exists avg_watch_pct numeric,
  add column if not exists plateau_at integer,
  add column if not exists promoted_to_feed boolean not null default false,
  add column if not exists screenshot_path text,
  add column if not exists notes text not null default '';

alter table public.content_performance drop constraint if exists content_performance_source_check;
alter table public.content_performance
  add constraint content_performance_source_check check (source in ('manual','api','screenshot'));

create index if not exists content_performance_idea_idx
  on public.content_performance (idea_id, measured_at desc);

-- ── Séries: Braga Real leva lugares ──────────────────────────────────────────
alter table public.content_series
  add column if not exists kind text not null default 'generic' check (kind in ('generic','braga_real')),
  add column if not exists places jsonb not null default '[]'::jsonb,
  add column if not exists pillar text;

-- ── Experiências: hipótese, o que testamos, resultado, aprendizado ─────────
create table if not exists public.content_experiment (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  label         text not null,
  hypothesis    text not null default '',
  what_we_test  text not null default '',
  status        text not null default 'planned' check (status in ('planned','running','measured','learned','paused')),
  idea_ids      uuid[] not null default '{}',
  sample_size   integer not null default 0,
  result        text,
  learning      text,
  repeat        text,
  started_at    timestamptz,
  ended_at      timestamptz,
  source        text not null default 'mentor_session',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (kind)
);

-- ── Aprendizados: uma frase, a prova, o tamanho da amostra, a confiança ───
create table if not exists public.content_learning (
  id            uuid primary key default gen_random_uuid(),
  statement     text not null,
  evidence      jsonb not null default '{}'::jsonb,
  sample_size   integer not null default 0,
  confidence    text not null default 'low' check (confidence in ('low','medium','high')),
  kind          text not null default 'OBSERVED_CAROL_SIGNAL',
  dedupe_key    text not null,
  active        boolean not null default true,
  derived_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (dedupe_key)
);

-- ── Ganchos: guardados quando a ideia nasce, avaliados quando há números ──
create table if not exists public.hook_library (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid references public.creator_content_idea (id) on delete cascade,
  channel       text not null check (channel in ('visual','written','spoken')),
  hook          text not null,
  written_type  text check (written_type in ('identification','experience','emotion','teaching','update')),
  platform      text not null default 'instagram',
  topic         text not null default '',
  format        text not null default '',
  performance   jsonb not null default '{}'::jsonb,
  reuse_pattern text not null default '',
  created_at    timestamptz not null default now(),
  unique (idea_id, channel)
);

create index if not exists hook_library_type_idx on public.hook_library (channel, written_type);

-- ── B-roll: a pasta de takes do cotidiano, como banco ──────────────────────
create table if not exists public.broll_asset (
  id            uuid primary key default gen_random_uuid(),
  storage_path  text,
  title         text not null default '',
  tags          jsonb not null default '[]'::jsonb,
  duration_seconds integer,
  source        text not null default 'upload' check (source in ('upload','collaboration','capture','note')),
  collaboration_id uuid references public.collaboration (id) on delete set null,
  notes         text not null default '',
  used_count    integer not null default 0,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ── Prova social: feedback de marca, com permissão antes de sair ───────────
create table if not exists public.social_proof (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid references public.brand (id) on delete set null,
  brand_name    text not null default '',
  feedback      text not null default '',
  source        text not null default 'manual'
    check (source in ('manual','email','event','mentor_session','screenshot')),
  screenshot_path text,
  permission    text not null default 'unknown' check (permission in ('unknown','requested','granted','denied')),
  context       text not null default '',
  occurred_at   timestamptz,
  usable_for_portfolio boolean not null default false,
  usable_for_social    boolean not null default false,
  content_idea_id uuid references public.creator_content_idea (id) on delete set null,
  dedupe_key    text,
  created_at    timestamptz not null default now(),
  unique (dedupe_key)
);

-- ── RLS: o mesmo desenho do resto ──────────────────────────────────────────
alter table public.content_experiment enable row level security;
alter table public.content_learning   enable row level security;
alter table public.hook_library       enable row level security;
alter table public.broll_asset        enable row level security;
alter table public.social_proof       enable row level security;

drop policy if exists "carolos user manages content_experiment" on public.content_experiment;
create policy "carolos user manages content_experiment" on public.content_experiment
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages content_learning" on public.content_learning;
create policy "carolos user manages content_learning" on public.content_learning
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages hook_library" on public.hook_library;
create policy "carolos user manages hook_library" on public.hook_library
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages broll_asset" on public.broll_asset;
create policy "carolos user manages broll_asset" on public.broll_asset
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

drop policy if exists "carolos user manages social_proof" on public.social_proof;
create policy "carolos user manages social_proof" on public.social_proof
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

-- ── A mentoria como fonte de conhecimento ──────────────────────────────────
-- Uma sessão de mentoria não é «source_of_truth»: tem autoridade alta sobre
-- estratégia e nenhuma sobre o algoritmo. O tipo é o que deixa distingui-las.
alter table public.knowledge_source drop constraint if exists knowledge_source_source_type_check;
alter table public.knowledge_source
  add constraint knowledge_source_source_type_check check (source_type in (
    'source_of_truth','portfolio','business_memory','uploaded_document','email','instagram',
    'brief','contract','proposal','mentor_session','other'
  ));
