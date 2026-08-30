-- CarolOS 006 | versioned commercial policy, quotes and rights licences.
--
-- Pricing is deterministic. The policy is data, the engine is code, and the LLM
-- never sees a blank cheque: it receives the computed options and phrases them.
-- A rule Carol has not decided yet is stored as absent, not as a guess.

create table if not exists public.pricing_policy (
  id             uuid primary key default gen_random_uuid(),
  version        text not null unique,
  status         text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  currency       text not null default 'EUR',
  markets        text[] not null default '{}',
  effective_from date,
  effective_to   date,
  rules          jsonb not null default '{}'::jsonb,
  notes          text not null default '',
  created_by     uuid references public.app_user (id) on delete set null,
  approved_by    uuid references public.app_user (id) on delete set null,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Exactly one active policy at a time; history stays retired, never deleted.
create unique index if not exists pricing_policy_single_active
  on public.pricing_policy ((status)) where status = 'active';

drop trigger if exists pricing_policy_touch on public.pricing_policy;
create trigger pricing_policy_touch before update on public.pricing_policy
  for each row execute function public.touch_updated_at();

-- A sent quote must remain reproducible after the policy changes.
create table if not exists public.quote (
  id                    uuid primary key default gen_random_uuid(),
  opportunity_id        uuid not null references public.opportunity (id) on delete cascade,
  brand_id              uuid references public.brand (id) on delete cascade,
  pricing_policy_version text not null,
  version               smallint not null default 1,
  status                text not null default 'draft'
                          check (status in ('draft', 'approved', 'sent', 'accepted', 'rejected', 'superseded')),
  input_scope           jsonb not null default '{}'::jsonb,
  line_items            jsonb not null default '[]'::jsonb,
  rights_snapshot       jsonb not null default '{}'::jsonb,
  base_cents            bigint not null default 0,
  adjustments_cents     bigint not null default 0,
  recommended_cents     bigint not null default 0,
  minimum_cents         bigint,
  final_cents           bigint,
  currency              text not null default 'EUR',
  unresolved            text[] not null default '{}',
  below_floor           boolean not null default false,
  override_reason       text,
  approved_by           uuid references public.app_user (id) on delete set null,
  approved_at           timestamptz,
  sent_at               timestamptz,
  document_id           uuid,
  superseded_by         uuid references public.quote (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists quote_opportunity_idx on public.quote (opportunity_id, version desc);

drop trigger if exists quote_touch on public.quote;
create trigger quote_touch before update on public.quote
  for each row execute function public.touch_updated_at();

-- A sent quote is history. Editing one creates a new version instead.
create or replace function public.quote_freeze_sent()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('sent', 'accepted', 'rejected')
     and (new.line_items is distinct from old.line_items
       or new.base_cents is distinct from old.base_cents
       or new.recommended_cents is distinct from old.recommended_cents
       or new.final_cents is distinct from old.final_cents
       or new.rights_snapshot is distinct from old.rights_snapshot
       or new.pricing_policy_version is distinct from old.pricing_policy_version) then
    raise exception 'quote % is already sent; create a new version instead of mutating history', old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists quote_freeze on public.quote;
create trigger quote_freeze before update on public.quote
  for each row execute function public.quote_freeze_sent();

-- Production and licence are separate concepts. Perpetuity is never assumed.
create table if not exists public.rights_license (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid not null references public.brand (id) on delete cascade,
  opportunity_id       uuid references public.opportunity (id) on delete set null,
  collaboration_id     uuid,
  content_asset_id     uuid,
  quote_id             uuid references public.quote (id) on delete set null,
  document_id          uuid,
  organic_allowed      boolean not null default true,
  paid_allowed         boolean not null default false,
  platforms            text[] not null default '{}',
  territories          text[] not null default '{}',
  start_at             date,
  end_at               date,
  duration_days        integer check (duration_days > 0),
  whitelisting         boolean not null default false,
  exclusivity          boolean not null default false,
  exclusivity_scope    text,
  exclusivity_end_at   date,
  raw_footage          boolean not null default false,
  editing_permissions  text not null default '',
  portfolio_permission boolean,
  third_party_usage    boolean not null default false,
  fee_cents            bigint check (fee_cents >= 0),
  currency             text not null default 'EUR',
  status               text not null default 'active'
                         check (status in ('draft', 'active', 'expired', 'renewed', 'cancelled')),
  renewed_into_id      uuid references public.rights_license (id) on delete set null,
  notes                text not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists rights_license_expiry_idx on public.rights_license (status, end_at)
  where end_at is not null;
create index if not exists rights_license_brand_idx  on public.rights_license (brand_id);

drop trigger if exists rights_license_touch on public.rights_license;
create trigger rights_license_touch before update on public.rights_license
  for each row execute function public.touch_updated_at();

alter table public.pricing_policy  enable row level security;
alter table public.quote           enable row level security;
alter table public.rights_license  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pricing_policy', 'quote', 'rights_license'] loop
    execute format('drop policy if exists "carolos user manages %1$s" on public.%1$I', t);
    execute format(
      'create policy "carolos user manages %1$s" on public.%1$I for all to authenticated
         using (public.is_carolos_user()) with check (public.is_carolos_user())', t);
  end loop;
end $$;

-- Seed: v1 draft. Only the AllMatters figures are documented facts, and they are
-- recorded as one historical reference — never as a general table. Everything
-- Carol has not decided is absent so the engine reports "policy unresolved"
-- instead of inventing a number.
insert into public.pricing_policy (version, status, currency, markets, rules, notes)
values (
  'v1-draft',
  'draft',
  'EUR',
  array['PT', 'EU'],
  jsonb_build_object(
    'base', jsonb_build_object(
      'single_video_cents', null::jsonb,
      'unresolved_reason', 'Carol has not defined a general base rate. AllMatters 130 EUR was one negotiation, not a table.'
    ),
    'packages', jsonb_build_object(
      'creative_pack_3', null::jsonb,
      'performance_pack_5', null::jsonb,
      'variation_pack', null::jsonb,
      'monthly_retainer', null::jsonb
    ),
    'minimum_project_floor_cents', null::jsonb,
    'paid_usage', jsonb_build_object(
      'model', 'percent_of_base',
      'terms', jsonb_build_object('30d', null::jsonb, '3m', null::jsonb, '6m', null::jsonb, '12m', null::jsonb),
      'unresolved_reason', 'Only 3m (+50%) and 6m (+70%) exist, and only inside the AllMatters negotiation.'
    ),
    'raw_footage', null::jsonb,
    'whitelisting', null::jsonb,
    'exclusivity', null::jsonb,
    'buyout_perpetual', jsonb_build_object('allowed', false, 'reason', 'Never granted by default; human decision only.'),
    'rush', null::jsonb,
    'revisions_included', null::jsonb,
    'payment_terms', null::jsonb,
    'historical_reference', jsonb_build_object(
      'allmatters_2026_08', jsonb_build_object(
        'base_cents', 13000,
        'paid_usage_3m_pct', 50,
        'paid_usage_3m_total_cents', 19500,
        'paid_usage_6m_pct', 70,
        'paid_usage_6m_total_cents', 22100,
        'note', 'Historical evidence from one negotiation. Not authorization to generalize.'
      )
    )
  ),
  'Draft policy. Every null is an open business decision: the engine must surface it as unresolved and refuse to invent a value.'
)
on conflict (version) do nothing;
