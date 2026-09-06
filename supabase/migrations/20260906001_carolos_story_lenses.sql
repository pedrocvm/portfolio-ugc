-- CarolOS · Story Lenses
--
-- Entre o pilar e a história real faltava um degrau. «Esta semana estamos
-- trabalhando Atração, me conte uma situação real» é verdadeiro e é abstrato
-- demais: ela não sabe onde procurar na própria memória.
--
-- A lente é a direção da busca. Não é ideia, não é história, e não contém
-- acontecimento nenhum — por isso a **definição** vive em código, versionada
-- (`modules/content-brain/lenses.ts`). O que entra na base é só o que é dela:
-- quanto usou, o que produziu, e o que ela disse que não combina.
--
-- Append-only. Nenhuma migração anterior é editada, e `creator_story` continua
-- a funcionar exatamente como antes: `story_lens_id` fica NULL nas histórias
-- que já existem, e isso é um estado válido. Não há backfill inventado.

/* ── A lente na história de origem ────────────────────────────────────────── */

alter table public.creator_story
  add column if not exists story_lens_id      text,
  add column if not exists story_lens_version text,
  -- `selected` = ela escolheu a direção antes de se lembrar.
  -- `inferred` = ela chegou já sabendo o que contar e o sistema classificou
  --              depois. Nunca se apresenta uma inferência como escolha dela.
  add column if not exists story_lens_source  text;

alter table public.creator_story drop constraint if exists creator_story_lens_source_check;
alter table public.creator_story
  add constraint creator_story_lens_source_check
  check (story_lens_source is null or story_lens_source in ('selected', 'inferred'));

-- Uma lente registada tem de dizer de onde veio. Sem isto, meses depois já
-- ninguém sabe se aquela lente foi a porta de entrada ou um palpite.
alter table public.creator_story drop constraint if exists creator_story_lens_needs_source;
alter table public.creator_story
  add constraint creator_story_lens_needs_source
  check (story_lens_id is null or story_lens_source is not null);

create index if not exists creator_story_lens_idx
  on public.creator_story (story_lens_id, captured_at desc)
  where story_lens_id is not null;

/* ── O estado por lente ───────────────────────────────────────────────────── */

create table if not exists public.story_lens_state (
  id              uuid primary key default gen_random_uuid(),
  app_user_id     uuid not null references public.app_user (id) on delete cascade,
  lens_id         text not null,
  library_version text not null,

  times_shown     integer not null default 0,
  times_selected  integer not null default 0,
  -- Histórias reais que nasceram por esta porta. É a métrica que importa:
  -- uma lente muito clicada e sem histórias não é uma lente boa.
  stories_found   integer not null default 0,
  content_derived integer not null default 0,
  -- Quantas vezes ela abriu e não se lembrou de nada.
  dismissed_count integer not null default 0,

  preference      text not null default 'none'
                  check (preference in ('liked', 'not_for_carol', 'later', 'none')),
  -- Uma nota dela sobre o caminho. Nunca gerada.
  note            text,

  last_shown_at   timestamptz,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (app_user_id, lens_id)
);

create index if not exists story_lens_state_pref_idx
  on public.story_lens_state (app_user_id, preference);

drop trigger if exists story_lens_state_touch on public.story_lens_state;
create trigger story_lens_state_touch before update on public.story_lens_state
  for each row execute function public.touch_updated_at();

/* ── Telemetria do próprio fluxo ──────────────────────────────────────────── */

-- Isto não é para a Carol ver. É para se conseguir responder a «esta camada
-- está mesmo a ajudar a encontrar histórias, ou só a acrescentar um clique?».
create table if not exists public.story_lens_event (
  id          uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_user (id) on delete cascade,
  lens_id     text,
  pillar      text,
  kind        text not null check (kind in
              ('lens_shown', 'lens_selected', 'lens_skipped', 'lens_dismissed',
               'story_started', 'story_confirmed', 'story_discarded', 'content_derived')),
  story_id    uuid references public.creator_story (id) on delete set null,
  detail      jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists story_lens_event_recent_idx
  on public.story_lens_event (app_user_id, occurred_at desc);
create index if not exists story_lens_event_lens_idx
  on public.story_lens_event (lens_id, kind, occurred_at desc);

/* ── RLS ──────────────────────────────────────────────────────────────────── */

alter table public.story_lens_state enable row level security;
alter table public.story_lens_event enable row level security;

drop policy if exists "carolos user manages story_lens_state" on public.story_lens_state;
create policy "carolos user manages story_lens_state" on public.story_lens_state
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

drop policy if exists "carolos user manages story_lens_event" on public.story_lens_event;
create policy "carolos user manages story_lens_event" on public.story_lens_event
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());
