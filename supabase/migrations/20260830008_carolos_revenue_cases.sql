-- CarolOS 008 | payments, performance, cases, relationships, brand intelligence.
--
-- Barter value never inflates cash revenue: they are separate columns and the
-- analytics read them separately.

create table if not exists public.payment (
  id               uuid primary key default gen_random_uuid(),
  collaboration_id uuid references public.collaboration (id) on delete cascade,
  opportunity_id   uuid references public.opportunity (id) on delete set null,
  brand_id         uuid not null references public.brand (id) on delete cascade,
  kind             text not null default 'cash'
                     check (kind in ('cash', 'reimbursement', 'barter', 'usage_license')),
  amount_cents     bigint not null default 0 check (amount_cents >= 0),
  currency         text not null default 'EUR',
  due_at           date,
  invoice_ref      text not null default '',
  paid_at          date,
  status           text not null default 'due' check (status in ('due', 'invoiced', 'paid', 'written_off')),
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists payment_status_idx on public.payment (status, due_at nulls last);
create index if not exists payment_brand_idx  on public.payment (brand_id);

drop trigger if exists payment_touch on public.payment;
create trigger payment_touch before update on public.payment
  for each row execute function public.touch_updated_at();

create table if not exists public.performance_snapshot (
  id               uuid primary key default gen_random_uuid(),
  collaboration_id uuid references public.collaboration (id) on delete cascade,
  content_asset_id uuid references public.content_asset (id) on delete set null,
  brand_id         uuid not null references public.brand (id) on delete cascade,
  period_start     date,
  period_end       date,
  metrics          jsonb not null default '{}'::jsonb,
  qualitative      text not null default '',
  source           text not null default 'brand',
  confidence       real check (confidence between 0 and 1),
  received_at      timestamptz not null default now()
);

create index if not exists performance_brand_idx on public.performance_snapshot (brand_id, received_at desc);

create table if not exists public.case_study (
  id               uuid primary key default gen_random_uuid(),
  collaboration_id uuid references public.collaboration (id) on delete cascade,
  brand_id         uuid not null references public.brand (id) on delete cascade,
  title            text not null default '',
  challenge        text not null default '',
  hypothesis       text not null default '',
  execution        text not null default '',
  result           text not null default '',
  missing_metrics  text[] not null default '{}',
  capability_tags  text[] not null default '{}',
  permission       text not null default 'unknown'
                     check (permission in ('unknown', 'requested', 'granted', 'denied')),
  visibility       text not null default 'private' check (visibility in ('private', 'public')),
  published_at     timestamptz,
  media_item_ids   uuid[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists case_study_brand_idx on public.case_study (brand_id, created_at desc);

drop trigger if exists case_study_touch on public.case_study;
create trigger case_study_touch before update on public.case_study
  for each row execute function public.touch_updated_at();

-- Materialized relationship health. Derived, refreshed by the reducer, never
-- the source of truth for money.
create table if not exists public.relationship (
  brand_id            uuid primary key references public.brand (id) on delete cascade,
  first_contact_at    timestamptz,
  last_interaction_at timestamptz,
  last_job_at         timestamptz,
  total_cash_cents    bigint not null default 0,
  total_barter_cents  bigint not null default 0,
  collaborations_count integer not null default 0,
  opportunities_count integer not null default 0,
  won_count           integer not null default 0,
  lost_count          integer not null default 0,
  satisfaction        smallint check (satisfaction between 0 and 5),
  responsiveness      smallint check (responsiveness between 0 and 5),
  next_touch_at       date,
  upsell_ideas        jsonb not null default '[]'::jsonb,
  updated_at          timestamptz not null default now()
);

drop trigger if exists relationship_touch on public.relationship;
create trigger relationship_touch before update on public.relationship
  for each row execute function public.touch_updated_at();

-- Evidence-backed research. Every non-obvious claim keeps its source.
create table if not exists public.brand_research_snapshot (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brand (id) on delete cascade,
  ai_run_id     uuid references public.ai_run (id) on delete set null,
  dossier       jsonb not null default '{}'::jsonb,
  evidence      jsonb not null default '[]'::jsonb,
  fit_score     smallint check (fit_score between 0 and 100),
  fit_breakdown jsonb,
  policy_version text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists brand_research_idx on public.brand_research_snapshot (brand_id, created_at desc);

create table if not exists public.creative_hypothesis (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references public.brand (id) on delete cascade,
  opportunity_id uuid references public.opportunity (id) on delete set null,
  product_id     uuid references public.product (id) on delete set null,
  ai_run_id      uuid references public.ai_run (id) on delete set null,
  title          text not null,
  funnel_role    text check (funnel_role in ('DISCOVERY', 'CONSIDERATION', 'DECISION')),
  friction       text not null default '',
  hook           text not null default '',
  core_message   text not null default '',
  demonstration  text not null default '',
  cta            text not null default '',
  emotion        text not null default '',
  capabilities   text[] not null default '{}',
  status         text not null default 'proposed'
                   check (status in ('proposed', 'selected', 'produced', 'discarded')),
  created_at     timestamptz not null default now()
);

create index if not exists creative_hypothesis_brand_idx on public.creative_hypothesis (brand_id, status);

alter table public.payment                enable row level security;
alter table public.performance_snapshot   enable row level security;
alter table public.case_study             enable row level security;
alter table public.relationship           enable row level security;
alter table public.brand_research_snapshot enable row level security;
alter table public.creative_hypothesis    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['payment', 'performance_snapshot', 'case_study', 'relationship',
                           'brand_research_snapshot', 'creative_hypothesis'] loop
    execute format('drop policy if exists "carolos user manages %1$s" on public.%1$I', t);
    execute format(
      'create policy "carolos user manages %1$s" on public.%1$I for all to authenticated
         using (public.is_carolos_user()) with check (public.is_carolos_user())', t);
  end loop;
end $$;
