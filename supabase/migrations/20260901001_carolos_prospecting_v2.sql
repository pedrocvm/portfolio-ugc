-- Prospecção v2: a busca manual passa a ser uma coisa diferente da automática,
-- e a localização e os canais deixam de viver dentro de texto corrido.

-- ── A corrida sabe o que foi pedido ──────────────────────────────────────────
alter table public.outreach_run
  add column if not exists raw_query      text,
  add column if not exists intent         jsonb not null default '{}'::jsonb,
  add column if not exists search_terms   jsonb not null default '[]'::jsonb,
  add column if not exists countries      jsonb not null default '[]'::jsonb,
  -- Quantas foram deitadas fora e porquê: sem isto não há como saber porque é
  -- que uma busca correu mal.
  add column if not exists rejected_irrelevant integer not null default 0,
  add column if not exists rejected_country    integer not null default 0,
  add column if not exists rejected_known      integer not null default 0;

-- ── A candidata sabe onde está e por onde se fala com ela ────────────────────
alter table public.outreach_candidate
  add column if not exists city              text,
  add column if not exists instagram         text,
  add column if not exists whatsapp          text,
  add column if not exists phone             text,
  add column if not exists linkedin          text,
  -- Origem e confiança por campo. A UI mostra só quando pedem, mas sem isto não
  -- há como distinguir um contacto visto no site de um deduzido.
  add column if not exists field_sources     jsonb not null default '{}'::jsonb,
  add column if not exists search_relevance  integer,
  add column if not exists ugc_opportunity   integer,
  -- Uma busca exploratória não tem de sujar o CRM: só o que ela guarda conta.
  add column if not exists saved             boolean not null default false,
  add column if not exists saved_at          timestamptz;

comment on column public.outreach_candidate.whatsapp is
  'Só com prova: link wa.me ou indicação explícita. Um telefone sem prova vai para phone.';
comment on column public.outreach_candidate.saved is
  'Resultado de busca vira candidata guardada só quando ela decide.';

-- ── O foco da busca automática, editável na própria tela ─────────────────────
create table if not exists public.outreach_focus (
  id           uuid primary key default gen_random_uuid(),
  app_user_id  uuid not null references public.app_user (id) on delete cascade,
  -- Nichos escolhidos por ela, que podem não estar na lista de origem.
  niches       jsonb not null default '[]'::jsonb,
  countries    jsonb not null default '["Portugal"]'::jsonb,
  per_day      integer not null default 20 check (per_day between 1 and 40),
  updated_at   timestamptz not null default now(),
  unique (app_user_id)
);

alter table public.outreach_focus enable row level security;

-- Igual ao resto do CarolOS: nada de anon, e o dono só vê o que é dele.
drop policy if exists outreach_focus_owner on public.outreach_focus;
create policy outreach_focus_owner on public.outreach_focus
  for all
  to authenticated
  using (app_user_id in (select id from public.app_user where auth_user_id = auth.uid()))
  with check (app_user_id in (select id from public.app_user where auth_user_id = auth.uid()));

create index if not exists outreach_candidate_saved_idx
  on public.outreach_candidate (saved, created_at desc);
create index if not exists outreach_run_kind_idx
  on public.outreach_run (kind, started_at desc);
