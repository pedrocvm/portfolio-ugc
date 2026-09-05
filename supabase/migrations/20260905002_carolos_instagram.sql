-- CarolOS · Instagram Intelligence
--
-- Ingestão contínua da conta @carolxqueiroz, para o desempenho deixar de ser
-- uma auditoria manual.
--
-- Regras que o schema faz cumprir, não só o código:
--
-- 1. **Nenhuma coluna métrica tem `default 0`.** Uma métrica que a API não
--    devolveu fica NULL. O `raw_metrics` guarda nome, valor bruto, unidade,
--    disponibilidade e versão da API, para a interpretação nunca depender de
--    uma unidade adivinhada.
-- 2. **Os dois IDs conhecidos são campos distintos.** `/me` devolve `id`
--    (app-scoped) e `user_id` (a conta). Não são intermutáveis e cada um
--    guarda o endpoint de origem.
-- 3. **Trial Reel é fato humano.** A API não o distingue; `trial_status`
--    começa `unknown` e só muda com confirmação dela.
-- 4. **Snapshot é único por janela.** `unique (media_id, snapshot_kind)` é o
--    que torna o trabalho idempotente sem lógica no runner.

/* ── Conta ────────────────────────────────────────────────────────────────── */

create table if not exists public.instagram_account (
  id                  uuid primary key default gen_random_uuid(),
  app_user_id         uuid not null references public.app_user (id) on delete cascade,

  -- `/me` → `user_id`. É o id da conta do Instagram.
  ig_account_id       text not null,
  ig_account_id_source text not null default 'me.user_id',
  -- `/me` → `id`. App-scoped, diferente do de cima. Nunca assumir equivalência.
  ig_me_id            text,
  ig_me_id_source     text not null default 'me.id',

  username            text not null,
  account_type        text,
  media_count         integer,
  followers_count     integer,
  follows_count       integer,

  scopes              text[] not null default '{}',
  api_version         text not null default 'v26.0',

  status              text not null default 'connected'
                      check (status in ('connected', 'expiring', 'expired', 'revoked', 'error')),
  connected_at        timestamptz not null default now(),
  last_sync_at        timestamptz,
  last_success_at     timestamptz,
  last_error_code     text,
  last_error_at       timestamptz,
  /** Cursor da última página lida, para o sync ser incremental. */
  media_cursor        text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (app_user_id, ig_account_id)
);

drop trigger if exists instagram_account_touch on public.instagram_account;
create trigger instagram_account_touch before update on public.instagram_account
  for each row execute function public.touch_updated_at();

/* ── Mídia ────────────────────────────────────────────────────────────────── */

create table if not exists public.instagram_media (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.instagram_account (id) on delete cascade,
  external_media_id  text not null,

  media_type         text not null default 'UNKNOWN',
  media_product_type text not null default 'UNKNOWN',
  permalink          text,
  caption            text not null default '',
  published_at       timestamptz not null,
  -- URL transitória da Meta. Guardada por conveniência, nunca como storage.
  thumbnail_url      text,
  is_shared_to_feed  boolean,

  -- Contagens do endpoint de mídia. NULL quando não pedidas.
  comments_count     integer,
  like_count         integer,

  -- Trial Reel: a API não distingue. Fato humano até prova em contrário.
  trial_status       text not null default 'unknown' check (trial_status in ('unknown', 'yes', 'no')),
  trial_status_source text check (trial_status_source in ('api', 'carol_confirmation', 'imported_audit')),
  trial_confirmed_at timestamptz,
  -- Perguntada uma vez. «Não lembro» deixa isto preenchido e não volta a interromper.
  trial_prompted_at  timestamptz,
  promoted_to_feed   text not null default 'unknown' check (promoted_to_feed in ('unknown', 'yes', 'no')),

  content_idea_id    uuid references public.creator_content_idea (id) on delete set null,
  story_id           uuid references public.creator_story (id) on delete set null,
  link_confidence    numeric(4, 3),
  link_source        text check (link_source in ('exact', 'confident', 'carol_confirmation', 'manual')),
  link_prompted_at   timestamptz,

  source             text not null default 'api' check (source in ('api', 'chrome_audit_t0', 'manual')),
  observed_at        timestamptz not null default now(),
  first_seen_at      timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (account_id, external_media_id)
);

create index if not exists instagram_media_recent_idx on public.instagram_media (account_id, published_at desc);
create index if not exists instagram_media_unlinked_idx on public.instagram_media (account_id, published_at desc)
  where content_idea_id is null and story_id is null;
create index if not exists instagram_media_trial_idx on public.instagram_media (trial_status)
  where trial_status = 'unknown' and trial_prompted_at is null;

drop trigger if exists instagram_media_touch on public.instagram_media;
create trigger instagram_media_touch before update on public.instagram_media
  for each row execute function public.touch_updated_at();

/* ── Snapshots ────────────────────────────────────────────────────────────── */

create table if not exists public.instagram_media_snapshot (
  id            uuid primary key default gen_random_uuid(),
  media_id      uuid not null references public.instagram_media (id) on delete cascade,
  snapshot_kind text not null check (snapshot_kind in ('t1h', 't6h', 't24h', 't72h', 't7d', 't30d')),
  captured_at   timestamptz not null default now(),
  /** Idade real da peça no momento da captura. Sem isto, comparar «24h» com
   *  «24h» seria comparar com o que o cron calhou. */
  age_seconds   integer not null,

  -- Nenhuma destas tem default. NULL significa indisponível.
  views              bigint,
  reach              bigint,
  likes              bigint,
  comments           bigint,
  saves              bigint,
  shares             bigint,
  total_interactions bigint,
  replies            bigint,
  navigation         bigint,
  profile_activity   bigint,
  follows            bigint,

  -- Tempo: bruto e unidade primeiro; os segundos são derivados.
  avg_watch_time_raw      bigint,
  avg_watch_time_seconds  numeric(12, 3),
  total_watch_time_raw    bigint,
  total_watch_time_seconds numeric(14, 3),

  /** Nome original, valor bruto, unidade, disponibilidade, versão e hora.
   *  É a fonte de verdade; as colunas acima são para indexar e ordenar. */
  raw_metrics   jsonb not null default '{}'::jsonb,
  api_version   text not null default 'v26.0',
  source        text not null default 'api' check (source in ('api', 'chrome_audit_t0', 'manual')),

  created_at    timestamptz not null default now(),
  unique (media_id, snapshot_kind)
);

create index if not exists instagram_media_snapshot_time_idx on public.instagram_media_snapshot (captured_at desc);
create index if not exists instagram_media_snapshot_kind_idx on public.instagram_media_snapshot (snapshot_kind, media_id);

/* ── Conta, diário ────────────────────────────────────────────────────────── */

create table if not exists public.instagram_account_snapshot (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.instagram_account (id) on delete cascade,
  observed_on   date not null,
  period        text not null default 'day' check (period in ('day', 'week', 'days_28', 'lifetime')),

  reach              bigint,
  views              bigint,
  accounts_engaged   bigint,
  total_interactions bigint,
  profile_link_taps  bigint,
  followers_count    integer,

  raw_metrics   jsonb not null default '{}'::jsonb,
  api_version   text not null default 'v26.0',
  source        text not null default 'api' check (source in ('api', 'chrome_audit_t0', 'manual')),
  created_at    timestamptz not null default now(),
  unique (account_id, observed_on, period)
);

/* ── Comentários (P1) ─────────────────────────────────────────────────────── */

create table if not exists public.instagram_comment (
  id                  uuid primary key default gen_random_uuid(),
  media_id            uuid not null references public.instagram_media (id) on delete cascade,
  external_comment_id text not null,
  parent_external_id  text,
  text                text not null default '',
  username            text,
  like_count          integer,
  commented_at        timestamptz,

  -- Classificação assíncrona, sempre separada do comentário original.
  quality             text check (quality in ('generic_praise', 'identification', 'question',
                                              'own_experience', 'purchase_intent',
                                              'professional', 'creator_to_creator', 'brand', 'other')),
  classified_at       timestamptz,
  ai_run_id           uuid references public.ai_run (id) on delete set null,

  ingested_at         timestamptz not null default now(),
  unique (media_id, external_comment_id)
);

create index if not exists instagram_comment_media_idx on public.instagram_comment (media_id, commented_at desc);

/* ── Webhooks (P1) ────────────────────────────────────────────────────────── */

create table if not exists public.instagram_webhook_event (
  id             uuid primary key default gen_random_uuid(),
  /** Id do evento quando a Meta o dá; senão o hash do corpo. É a chave de
   *  idempotência: o mesmo evento reentregue não é reprocessado. */
  dedupe_key     text not null unique,
  topic          text not null default 'unknown',
  field          text,
  payload        jsonb not null default '{}'::jsonb,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  status         text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error_summary  text
);

create index if not exists instagram_webhook_event_pending_idx
  on public.instagram_webhook_event (status, received_at)
  where status = 'received';

/* ── Baseline importada ───────────────────────────────────────────────────── */

-- A auditoria do Chrome entra como histórico com origem própria. Nunca se
-- mistura com dado da API, e o que ela não mediu continua a não estar medido.
create table if not exists public.instagram_baseline_import (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references public.app_user (id) on delete cascade,
  package_fingerprint text not null,
  source        text not null default 'chrome_audit_t0',
  observed_at   timestamptz not null,
  summary       jsonb not null default '{}'::jsonb,
  media_matched integer not null default 0,
  media_unmatched integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (app_user_id, package_fingerprint)
);

/* ── RLS ──────────────────────────────────────────────────────────────────── */

alter table public.instagram_account          enable row level security;
alter table public.instagram_media            enable row level security;
alter table public.instagram_media_snapshot   enable row level security;
alter table public.instagram_account_snapshot enable row level security;
alter table public.instagram_comment          enable row level security;
alter table public.instagram_webhook_event    enable row level security;
alter table public.instagram_baseline_import  enable row level security;

drop policy if exists "carolos user manages instagram_account" on public.instagram_account;
create policy "carolos user manages instagram_account" on public.instagram_account
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user manages instagram_media" on public.instagram_media;
create policy "carolos user manages instagram_media" on public.instagram_media
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user reads instagram_media_snapshot" on public.instagram_media_snapshot;
create policy "carolos user reads instagram_media_snapshot" on public.instagram_media_snapshot
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user reads instagram_account_snapshot" on public.instagram_account_snapshot;
create policy "carolos user reads instagram_account_snapshot" on public.instagram_account_snapshot
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user reads instagram_comment" on public.instagram_comment;
create policy "carolos user reads instagram_comment" on public.instagram_comment
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user manages instagram_baseline_import" on public.instagram_baseline_import;
create policy "carolos user manages instagram_baseline_import" on public.instagram_baseline_import
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

-- `instagram_webhook_event` fica com RLS e sem policy nenhuma, de propósito:
-- é o mesmo desenho de `integration_connection`. Só o service role escreve, o
-- corpo do webhook pode trazer dados de terceiros, e não há razão para o
-- browser lhe chegar.
