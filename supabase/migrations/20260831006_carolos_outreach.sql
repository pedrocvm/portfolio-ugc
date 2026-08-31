-- Daily Outreach Agent: o trabalho chato feito enquanto ela não está.
--
-- Reutiliza `brand`, `contact`, `opportunity`, `activity_event` e `follow_up`.
-- O que é novo é só o que a prospecção tem de próprio: a corrida, a candidata
-- com a sua pesquisa, a voz aprendida, e a lista de quem não se aborda.

create table if not exists public.outreach_run (
  id           uuid primary key default gen_random_uuid(),
  app_user_id  uuid not null references public.app_user (id) on delete cascade,
  -- O dia é a chave de idempotência: correr duas vezes não faz dois lotes.
  run_date     date not null,
  kind         text not null default 'daily' check (kind in ('daily', 'manual', 'targeted')),
  status       text not null default 'running'
                 check (status in ('running', 'success', 'partial', 'error', 'empty')),
  -- Que nichos e países esta corrida foi procurar, e porquê.
  strategy     jsonb not null default '{}'::jsonb,
  discovered   integer not null default 0,
  screened     integer not null default 0,
  researched   integer not null default 0,
  selected     integer not null default 0,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  -- Uma fonte que falha não perde o lote; fica registada aqui.
  partial_failures jsonb not null default '[]'::jsonb,
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  unique (app_user_id, run_date, kind)
);

create table if not exists public.outreach_candidate (
  id        uuid primary key default gen_random_uuid(),
  run_id    uuid not null references public.outreach_run (id) on delete cascade,
  -- A marca só é criada no CRM quando ela aprova. Antes disso é uma candidata.
  brand_id       uuid references public.brand (id) on delete set null,
  opportunity_id uuid references public.opportunity (id) on delete set null,

  name           text not null,
  normalized_name text not null,
  website        text,
  domain         text,
  country        text,
  niche_id       text,
  socials        jsonb not null default '{}'::jsonb,

  rank       integer not null default 0,
  fit_score  integer,
  fit_band   text,
  fit_breakdown jsonb,

  -- Pesquisa, com proveniência. Cada afirmação tem de poder ser conferida.
  product        text,
  why_fit        text not null default '',
  why_now        text not null default '',
  why_may_pay    text not null default '',
  risk           text not null default '',
  paid_media_signal text check (paid_media_signal in ('none', 'weak', 'medium', 'strong')),
  ugc_signal        text check (ugc_signal in ('none', 'product_only', 'influencers', 'ugc', 'creator_program')),
  creative_opportunity text not null default '',
  content_ideas  jsonb not null default '[]'::jsonb,
  red_flags      jsonb not null default '[]'::jsonb,
  sources        jsonb not null default '[]'::jsonb,
  researched_at  timestamptz,

  contact_name   text,
  contact_role   text,
  contact_email  text,
  email_confidence text check (email_confidence in ('verified', 'high', 'medium', 'low', 'unknown')),
  contact_source text,

  portfolio_match jsonb,
  language       text not null default 'pt',
  subject        text not null default '',
  body           text not null default '',
  -- O que a IA escreveu, para se poder comparar com o que ela enviou.
  ai_subject     text not null default '',
  ai_body        text not null default '',
  quality        jsonb,

  status    text not null default 'discovered'
              check (status in ('discovered', 'screened', 'researched', 'ready',
                                'needs_review', 'approved', 'edited', 'sent',
                                'skipped', 'rejected', 'failed')),
  reject_reason text,
  sent_at         timestamptz,
  gmail_message_id text,
  gmail_thread_id  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_candidate_run_idx on public.outreach_candidate (run_id, rank);
create index if not exists outreach_candidate_status_idx on public.outreach_candidate (status, created_at desc);
create index if not exists outreach_candidate_name_idx on public.outreach_candidate (normalized_name);

-- Quem não se aborda, e até quando.
create table if not exists public.outreach_suppression (
  id          uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_user (id) on delete cascade,
  normalized_name text not null,
  domain      text,
  brand_id    uuid references public.brand (id) on delete cascade,
  -- `never` é decisão dela; `until` é «boa marca, má altura».
  kind        text not null default 'never' check (kind in ('never', 'until')),
  until       timestamptz,
  reason      text not null default '',
  created_at  timestamptz not null default now(),
  unique (app_user_id, normalized_name)
);

create index if not exists outreach_suppression_domain_idx
  on public.outreach_suppression (domain) where domain is not null;

-- A voz dela, aprendida dos emails que já escreveu. Estruturada, não um resumo
-- solto: um parágrafo de LLM não se consegue comparar entre versões.
create table if not exists public.outreach_style_profile (
  id          uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_user (id) on delete cascade,
  language    text not null default 'pt',
  version     integer not null default 1,
  sample_count integer not null default 0,
  profile     jsonb not null default '{}'::jsonb,
  -- Padrões vistos entre o que a IA escreveu e o que ela enviou.
  edit_patterns jsonb not null default '[]'::jsonb,
  built_at    timestamptz not null default now(),
  unique (app_user_id, language, version)
);

alter table public.outreach_run           enable row level security;
alter table public.outreach_candidate     enable row level security;
alter table public.outreach_suppression   enable row level security;
alter table public.outreach_style_profile enable row level security;

create policy "carolos user manages outreach_run" on public.outreach_run
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());
create policy "carolos user manages outreach_candidate" on public.outreach_candidate
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());
create policy "carolos user manages outreach_suppression" on public.outreach_suppression
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());
create policy "carolos user manages outreach_style_profile" on public.outreach_style_profile
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

create trigger outreach_candidate_touch before update on public.outreach_candidate
  for each row execute function public.touch_updated_at();
