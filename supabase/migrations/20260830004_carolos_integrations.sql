-- CarolOS 004 | integration connections, ingested source material, job runs.
--
-- Tokens are encrypted before they reach this table and are never selectable by
-- the browser client: the RLS policies below deliberately exclude the token
-- columns from any anon path, and application reads use the service role only.

create table if not exists public.integration_connection (
  id                      uuid primary key default gen_random_uuid(),
  provider                text not null check (provider in ('google_gmail', 'instagram', 'manual')),
  app_user_id             uuid not null references public.app_user (id) on delete cascade,
  account_identifier      text not null default '',
  status                  text not null default 'connected'
                            check (status in ('connected', 'error', 'revoked', 'paused')),
  scopes                  text[] not null default '{}',
  encrypted_refresh_token text,
  encrypted_access_token  text,
  token_expires_at        timestamptz,
  cursor                  text,
  last_sync_at            timestamptz,
  last_success_at         timestamptz,
  last_error_code         text,
  last_error_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (provider, app_user_id)
);

drop trigger if exists integration_connection_touch on public.integration_connection;
create trigger integration_connection_touch before update on public.integration_connection
  for each row execute function public.touch_updated_at();

create table if not exists public.source_thread (
  id                        uuid primary key default gen_random_uuid(),
  provider                  text not null check (provider in ('gmail', 'instagram', 'whatsapp', 'manual', 'other')),
  external_thread_id        text not null,
  brand_id                  uuid references public.brand (id) on delete set null,
  contact_id                uuid references public.contact (id) on delete set null,
  opportunity_id            uuid references public.opportunity (id) on delete set null,
  subject                   text not null default '',
  participants              text[] not null default '{}',
  last_message_at           timestamptz,
  message_count             integer not null default 0,
  sync_cursor               text,
  classification            text not null default 'review'
                              check (classification in ('commercial', 'irrelevant', 'review')),
  classification_confidence real check (classification_confidence between 0 and 1),
  classification_reason     text not null default '',
  summary                   text not null default '',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (provider, external_thread_id)
);

create index if not exists source_thread_brand_idx on public.source_thread (brand_id);
create index if not exists source_thread_triage_idx on public.source_thread (classification, last_message_at desc);

drop trigger if exists source_thread_touch on public.source_thread;
create trigger source_thread_touch before update on public.source_thread
  for each row execute function public.touch_updated_at();

create table if not exists public.source_message (
  id                  uuid primary key default gen_random_uuid(),
  thread_id           uuid not null references public.source_thread (id) on delete cascade,
  provider            text not null,
  external_message_id text not null,
  direction           text not null check (direction in ('inbound', 'outbound')),
  sent_at             timestamptz not null,
  from_address        text not null default '',
  from_name           text not null default '',
  to_addresses        text[] not null default '{}',
  subject             text not null default '',
  body_text           text not null default '',
  body_hash           text not null default '',
  snippet             text not null default '',
  raw_ref             text,
  processed_at        timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (provider, external_message_id)
);

create index if not exists source_message_thread_idx  on public.source_message (thread_id, sent_at);
create index if not exists source_message_pending_idx on public.source_message (processed_at, sent_at)
  where processed_at is null;

-- Quick Capture: whatever Carol can paste or share in under ten seconds.
create table if not exists public.capture_item (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('url', 'text', 'screenshot', 'profile', 'product', 'conversation', 'brief')),
  raw_input      text not null default '',
  storage_path   text,
  note           text not null default '',
  status         text not null default 'pending'
                   check (status in ('pending', 'processed', 'applied', 'discarded', 'failed')),
  extracted      jsonb,
  confidence     real check (confidence between 0 and 1),
  brand_id       uuid references public.brand (id) on delete set null,
  contact_id     uuid references public.contact (id) on delete set null,
  opportunity_id uuid references public.opportunity (id) on delete set null,
  error_summary  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists capture_item_status_idx on public.capture_item (status, created_at desc);

drop trigger if exists capture_item_touch on public.capture_item;
create trigger capture_item_touch before update on public.capture_item
  for each row execute function public.touch_updated_at();

create table if not exists public.job_run (
  id              uuid primary key default gen_random_uuid(),
  job_type        text not null,
  idempotency_key text unique,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running' check (status in ('running', 'success', 'error', 'skipped')),
  attempt         smallint not null default 1,
  cursor_before   text,
  cursor_after    text,
  items_processed integer not null default 0,
  detail          jsonb not null default '{}'::jsonb,
  error_code      text,
  error_summary   text
);

create index if not exists job_run_recent_idx on public.job_run (job_type, started_at desc);

alter table public.integration_connection enable row level security;
alter table public.source_thread          enable row level security;
alter table public.source_message         enable row level security;
alter table public.capture_item           enable row level security;
alter table public.job_run                enable row level security;

-- Threads, messages, captures and job history are readable/writable by the
-- authenticated operator. integration_connection is deliberately NOT: tokens
-- live there, so it is reachable only through the server-side service role.
do $$
declare t text;
begin
  foreach t in array array['source_thread', 'source_message', 'capture_item', 'job_run'] loop
    execute format('drop policy if exists "carolos user manages %1$s" on public.%1$I', t);
    execute format(
      'create policy "carolos user manages %1$s" on public.%1$I for all to authenticated
         using (public.is_carolos_user()) with check (public.is_carolos_user())', t);
  end loop;
end $$;

-- No policy on integration_connection: RLS enabled with zero policies denies
-- every non-service-role request, which is exactly the intent for token storage.
