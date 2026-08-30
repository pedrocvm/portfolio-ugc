-- CarolOS 002 | CRM core: brand extensions, identities, contacts, opportunities.
--
-- Additive only. Every legacy brand column survives untouched; the new columns
-- carry the model forward. brand.stage stops being the whole commercial life of
-- a relationship — that moves to opportunity — but it is not dropped here.

alter table public.brand
  add column if not exists normalized_name    text,
  add column if not exists domain             text,
  add column if not exists website_url        text,
  add column if not exists country_code       text,
  add column if not exists category_primary   text,
  add column if not exists category_tags      text[] not null default '{}',
  add column if not exists interest_level     smallint check (interest_level between 0 and 5),
  add column if not exists fit_score          smallint check (fit_score between 0 and 100),
  add column if not exists fit_band           text check (fit_band in ('A', 'B', 'C', 'low', 'ignore')),
  add column if not exists fit_policy_version text,
  add column if not exists fit_breakdown      jsonb,
  add column if not exists fit_override       jsonb,
  add column if not exists status             text not null default 'active'
    check (status in ('active', 'nurture', 'blocked', 'archived')),
  add column if not exists source             text,
  add column if not exists last_activity_at   timestamptz,
  add column if not exists dossier            jsonb,
  add column if not exists dossier_at         timestamptz;

comment on column public.brand.stage is
  'LEGACY. Superseded by opportunity.stage. Kept for backward compatibility during cutover.';
comment on column public.brand.next_step is
  'LEGACY. Superseded by action_item. Kept for backward compatibility during cutover.';

create index if not exists brand_normalized_name_idx on public.brand (normalized_name);
create index if not exists brand_domain_idx          on public.brand (domain) where domain is not null;
create index if not exists brand_activity_idx        on public.brand (last_activity_at desc nulls last);
create index if not exists brand_fit_idx             on public.brand (fit_score desc nulls last);

-- One business, many handles. Deduplication happens on provider identity, never
-- on name similarity alone.
create table if not exists public.brand_identity (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brand (id) on delete cascade,
  provider    text not null check (provider in
                ('domain', 'email_domain', 'instagram', 'tiktok', 'linkedin', 'youtube', 'external')),
  external_id text not null,
  url         text,
  is_primary  boolean not null default false,
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists brand_identity_brand_idx on public.brand_identity (brand_id);

create table if not exists public.contact (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid not null references public.brand (id) on delete cascade,
  name                  text not null default '',
  role                  text not null default '',
  email                 text,
  phone                 text,
  social_handle         text,
  preferred_channel     text check (preferred_channel in ('email', 'instagram', 'whatsapp', 'call', 'other')),
  language              text,
  relationship_strength smallint check (relationship_strength between 0 and 5),
  source                text,
  notes                 text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists contact_email_key on public.contact (lower(email)) where email is not null;
create index if not exists contact_brand_idx on public.contact (brand_id);

drop trigger if exists contact_touch on public.contact;
create trigger contact_touch before update on public.contact
  for each row execute function public.touch_updated_at();

-- A brand exists independently of any negotiation, and can carry many
-- opportunities over its lifetime.
create table if not exists public.opportunity (
  id                           uuid primary key default gen_random_uuid(),
  brand_id                     uuid not null references public.brand (id) on delete cascade,
  primary_contact_id           uuid references public.contact (id) on delete set null,
  title                        text not null default '',
  stage                        text not null default 'discovered' check (stage in
                                 ('discovered', 'qualified', 'outreach', 'replied',
                                  'commercial_qualification', 'proposal', 'negotiation',
                                  'won', 'lost', 'nurture')),
  commercial_model             text not null default 'unclear' check (commercial_model in
                                 ('paid', 'barter', 'reimbursement', 'hybrid', 'influencer',
                                  'affiliate', 'spec', 'unclear')),
  priority                     text not null default 'B' check (priority in ('A', 'B', 'C')),
  source                       text,
  product_name                 text not null default '',
  expected_cash_cents          bigint check (expected_cash_cents >= 0),
  barter_value_to_carol_cents  bigint check (barter_value_to_carol_cents >= 0),
  currency                     text not null default 'EUR',
  next_action_text             text not null default '',
  next_action_due_at           timestamptz,
  waiting_until                timestamptz,
  waiting_reason               text,
  loss_reason                  text,
  won_at                       timestamptz,
  lost_at                      timestamptz,
  last_activity_at             timestamptz,
  legacy_brand_stage           text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create index if not exists opportunity_brand_idx    on public.opportunity (brand_id);
create index if not exists opportunity_stage_idx    on public.opportunity (stage, last_activity_at desc nulls last);
create index if not exists opportunity_due_idx      on public.opportunity (next_action_due_at)
  where next_action_due_at is not null;

drop trigger if exists opportunity_touch on public.opportunity;
create trigger opportunity_touch before update on public.opportunity
  for each row execute function public.touch_updated_at();

-- Products live under a brand. P0 keeps opportunity.product_name as a
-- convenience field; this table is the normalized home from P1 onward.
create table if not exists public.product (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references public.brand (id) on delete cascade,
  name              text not null,
  sku               text,
  kind              text not null default 'physical' check (kind in ('physical', 'saas', 'app', 'digital', 'service')),
  category          text,
  retail_price_cents bigint check (retail_price_cents >= 0),
  currency          text not null default 'EUR',
  url               text,
  demo_potential    smallint check (demo_potential between 0 and 5),
  carol_interest    smallint check (carol_interest between 0 and 5),
  carol_would_buy   boolean,
  owned_already     boolean not null default false,
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists product_brand_idx on public.product (brand_id);

drop trigger if exists product_touch on public.product;
create trigger product_touch before update on public.product
  for each row execute function public.touch_updated_at();

alter table public.brand_identity enable row level security;
alter table public.contact         enable row level security;
alter table public.opportunity     enable row level security;
alter table public.product         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['brand_identity', 'contact', 'opportunity', 'product'] loop
    execute format('drop policy if exists "carolos user manages %1$s" on public.%1$I', t);
    execute format(
      'create policy "carolos user manages %1$s" on public.%1$I for all to authenticated
         using (public.is_carolos_user()) with check (public.is_carolos_user())', t);
  end loop;
end $$;
