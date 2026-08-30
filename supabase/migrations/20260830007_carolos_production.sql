-- CarolOS 007 | production: collaborations, briefs, deliverables, content assets.
--
-- A won opportunity becomes a collaboration only on explicit acceptance.
-- Enthusiasm is not acceptance.

create table if not exists public.collaboration (
  id                  uuid primary key default gen_random_uuid(),
  opportunity_id      uuid not null unique references public.opportunity (id) on delete cascade,
  brand_id            uuid not null references public.brand (id) on delete cascade,
  product_id          uuid references public.product (id) on delete set null,
  title               text not null default '',
  status              text not null default 'accepted' check (status in
                        ('accepted', 'awaiting_terms', 'awaiting_product', 'awaiting_brief',
                         'production_ready', 'in_production', 'delivered', 'in_revision',
                         'approved', 'closed', 'cancelled')),
  compensation_model  text not null default 'unclear' check (compensation_model in
                        ('paid', 'barter', 'reimbursement', 'hybrid', 'unpaid', 'unclear')),
  accepted_at         timestamptz,
  deadline_at         date,
  -- logistics: physical shipping or digital access, never plaintext credentials
  logistics_kind      text check (logistics_kind in ('physical', 'digital', 'none')),
  shipped_at          date,
  received_at         date,
  tracking_ref        text,
  access_status       text check (access_status in ('required', 'requested', 'granted', 'ready')),
  access_note         text not null default '',
  revisions_included  smallint,
  payment_gate        text not null default 'unresolved'
                        check (payment_gate in ('unresolved', 'none', 'deposit', 'full_upfront', 'on_delivery')),
  gate_blockers       text[] not null default '{}',
  closed_at           timestamptz,
  notes               text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists collaboration_status_idx on public.collaboration (status, deadline_at nulls last);
create index if not exists collaboration_brand_idx  on public.collaboration (brand_id);

drop trigger if exists collaboration_touch on public.collaboration;
create trigger collaboration_touch before update on public.collaboration
  for each row execute function public.touch_updated_at();

create table if not exists public.brief (
  id               uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.collaboration (id) on delete cascade,
  opportunity_id   uuid references public.opportunity (id) on delete set null,
  source_kind      text not null default 'text' check (source_kind in ('email', 'pdf', 'text', 'document', 'capture')),
  source_ref       text,
  raw_text         text not null default '',
  parsed           jsonb not null default '{}'::jsonb,
  gaps             text[] not null default '{}',
  risk_flags       jsonb not null default '[]'::jsonb,
  questions        text[] not null default '{}',
  status           text not null default 'parsed'
                     check (status in ('parsed', 'incomplete', 'validated', 'superseded')),
  ai_run_id        uuid references public.ai_run (id) on delete set null,
  version          smallint not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists brief_collaboration_idx on public.brief (collaboration_id, version desc);

drop trigger if exists brief_touch on public.brief;
create trigger brief_touch before update on public.brief
  for each row execute function public.touch_updated_at();

-- Content is a creative hypothesis with a funnel role, not just a file.
create table if not exists public.content_asset (
  id               uuid primary key default gen_random_uuid(),
  collaboration_id uuid references public.collaboration (id) on delete cascade,
  brand_id         uuid references public.brand (id) on delete cascade,
  product_id       uuid references public.product (id) on delete set null,
  title            text not null default '',
  hypothesis       text not null default '',
  funnel_role      text check (funnel_role in ('DISCOVERY', 'CONSIDERATION', 'DECISION')),
  format           text not null default '',
  hook             text not null default '',
  core_message     text not null default '',
  cta              text not null default '',
  emotion          text not null default '',
  capabilities     text[] not null default '{}',
  language         text not null default 'pt-BR',
  script           text not null default '',
  shot_list        jsonb not null default '[]'::jsonb,
  status           text not null default 'concept' check (status in
                     ('concept', 'script', 'script_approved', 'shooting', 'editing',
                      'delivered', 'revision', 'approved', 'archived')),
  media_item_id    uuid references public.media_item (id) on delete set null,
  portfolio_permission boolean,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists content_asset_collab_idx on public.content_asset (collaboration_id);
create index if not exists content_asset_brand_idx  on public.content_asset (brand_id, status);

drop trigger if exists content_asset_touch on public.content_asset;
create trigger content_asset_touch before update on public.content_asset
  for each row execute function public.touch_updated_at();

create table if not exists public.deliverable (
  id               uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.collaboration (id) on delete cascade,
  content_asset_id uuid references public.content_asset (id) on delete set null,
  version          smallint not null default 1,
  asset_url        text not null default '',
  storage_path     text,
  delivered_at     timestamptz,
  recipient        text not null default '',
  channel          text not null default '',
  feedback         text not null default '',
  feedback_class   text check (feedback_class in ('in_scope', 'subjective', 'brief_change', 'new_deliverable')),
  approval_status  text not null default 'pending'
                     check (approval_status in ('pending', 'revision_requested', 'approved')),
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (collaboration_id, content_asset_id, version)
);

drop trigger if exists deliverable_touch on public.deliverable;
create trigger deliverable_touch before update on public.deliverable
  for each row execute function public.touch_updated_at();

-- Late FKs now that the referenced tables exist.
alter table public.activity_event drop constraint if exists activity_event_collaboration_fk;
alter table public.activity_event
  add constraint activity_event_collaboration_fk
  foreign key (collaboration_id) references public.collaboration (id) on delete cascade not valid;

alter table public.action_item drop constraint if exists action_item_collaboration_fk;
alter table public.action_item
  add constraint action_item_collaboration_fk
  foreign key (collaboration_id) references public.collaboration (id) on delete cascade not valid;

alter table public.rights_license drop constraint if exists rights_license_collaboration_fk;
alter table public.rights_license
  add constraint rights_license_collaboration_fk
  foreign key (collaboration_id) references public.collaboration (id) on delete set null not valid;

alter table public.rights_license drop constraint if exists rights_license_content_fk;
alter table public.rights_license
  add constraint rights_license_content_fk
  foreign key (content_asset_id) references public.content_asset (id) on delete set null not valid;

alter table public.collaboration enable row level security;
alter table public.brief         enable row level security;
alter table public.content_asset enable row level security;
alter table public.deliverable   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['collaboration', 'brief', 'content_asset', 'deliverable'] loop
    execute format('drop policy if exists "carolos user manages %1$s" on public.%1$I', t);
    execute format(
      'create policy "carolos user manages %1$s" on public.%1$I for all to authenticated
         using (public.is_carolos_user()) with check (public.is_carolos_user())', t);
  end loop;
end $$;
