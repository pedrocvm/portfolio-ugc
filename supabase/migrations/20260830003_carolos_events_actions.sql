-- CarolOS 003 | the operational spine: events, actions, follow-ups.
--
-- activity_event is append-only in application behaviour. Every material state
-- change answers what happened, when, to whom, on which channel, proven by
-- which source, applied by which actor and interpreted by which policy.

create table if not exists public.activity_event (
  id                uuid primary key default gen_random_uuid(),
  event_type        text not null,
  occurred_at       timestamptz not null default now(),
  brand_id          uuid references public.brand (id) on delete cascade,
  contact_id        uuid references public.contact (id) on delete set null,
  opportunity_id    uuid references public.opportunity (id) on delete cascade,
  source_thread_id  uuid,
  source_message_id uuid,
  collaboration_id  uuid,
  actor_type        text not null default 'system'
                      check (actor_type in ('carol', 'operator', 'ai', 'system', 'brand')),
  actor_user_id     uuid references public.app_user (id) on delete set null,
  channel           text,
  summary           text not null default '',
  payload           jsonb not null default '{}'::jsonb,
  confidence        real check (confidence between 0 and 1),
  policy_version    text,
  dedupe_key        text unique,
  created_at        timestamptz not null default now()
);

create index if not exists activity_event_opportunity_idx on public.activity_event (opportunity_id, occurred_at desc);
create index if not exists activity_event_brand_idx       on public.activity_event (brand_id, occurred_at desc);
create index if not exists activity_event_type_idx        on public.activity_event (event_type, occurred_at desc);

-- Today reads from here. Card assembly is not UI logic.
create table if not exists public.action_item (
  id               uuid primary key default gen_random_uuid(),
  opportunity_id   uuid references public.opportunity (id) on delete cascade,
  brand_id         uuid references public.brand (id) on delete cascade,
  collaboration_id uuid,
  type             text not null check (type in
                     ('respond', 'follow_up', 'send_portfolio', 'ask_scope', 'send_rate',
                      'negotiate', 'create_proposal', 'start_production', 'request_brief',
                      'deliver', 'request_metrics', 'upsell', 'renew_rights', 'nurture',
                      'close', 'review', 'wait_expired', 'integration_fix', 'chase_payment')),
  title            text not null,
  reason           text not null default '',
  evidence         jsonb not null default '{}'::jsonb,
  risk             text not null default 'none' check (risk in ('none', 'low', 'medium', 'high')),
  due_at           timestamptz,
  priority_score   integer not null default 0,
  status           text not null default 'open' check (status in ('open', 'done', 'snoozed', 'cancelled')),
  snoozed_until    timestamptz,
  source_event_id  uuid references public.activity_event (id) on delete set null,
  recommendation_id uuid,
  requires_approval boolean not null default false,
  dedupe_key       text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists action_item_queue_idx on public.action_item (status, priority_score desc, due_at nulls last);
create index if not exists action_item_opp_idx   on public.action_item (opportunity_id, status);

drop trigger if exists action_item_touch on public.action_item;
create trigger action_item_touch before update on public.action_item
  for each row execute function public.touch_updated_at();

create table if not exists public.follow_up (
  id               uuid primary key default gen_random_uuid(),
  opportunity_id   uuid not null references public.opportunity (id) on delete cascade,
  brand_id         uuid references public.brand (id) on delete cascade,
  trigger_event_id uuid references public.activity_event (id) on delete set null,
  policy_version   text not null,
  sequence_index   smallint not null default 1,
  situation        text not null check (situation in
                     ('cold_outreach', 'material_requested', 'promised_date', 'after_call_or_proposal', 'nurture')),
  due_at           timestamptz not null,
  reason           text not null default '',
  status           text not null default 'scheduled'
                     check (status in ('scheduled', 'due', 'sent', 'cancelled', 'nurture', 'missed')),
  draft_text       text,
  sent_at          timestamptz,
  sent_message_id  uuid,
  cancelled_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists follow_up_due_idx on public.follow_up (status, due_at);
create index if not exists follow_up_opp_idx on public.follow_up (opportunity_id, status);

-- At most one live follow-up per opportunity: an inbound reply cancels the
-- stale one before a new one is scheduled, so duplicates are a bug, not a race.
create unique index if not exists follow_up_one_open_per_opportunity
  on public.follow_up (opportunity_id) where status in ('scheduled', 'due');

drop trigger if exists follow_up_touch on public.follow_up;
create trigger follow_up_touch before update on public.follow_up
  for each row execute function public.touch_updated_at();

alter table public.activity_event enable row level security;
alter table public.action_item    enable row level security;
alter table public.follow_up      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['activity_event', 'action_item', 'follow_up'] loop
    execute format('drop policy if exists "carolos user manages %1$s" on public.%1$I', t);
    execute format(
      'create policy "carolos user manages %1$s" on public.%1$I for all to authenticated
         using (public.is_carolos_user()) with check (public.is_carolos_user())', t);
  end loop;
end $$;
