-- CarolOS 005 | AI run audit and recommendations.
--
-- Every model call is a row. A recommendation that cannot name its prompt
-- version, its policy version and its evidence is not allowed to influence a
-- commercial decision.

create table if not exists public.ai_run (
  id                uuid primary key default gen_random_uuid(),
  task_type         text not null,
  entity_type       text,
  entity_id         uuid,
  model_provider    text not null default '',
  model_name        text not null default '',
  model_tier        text check (model_tier in ('fast', 'reasoning')),
  prompt_version    text not null default '',
  policy_versions   jsonb not null default '{}'::jsonb,
  input_hash        text,
  structured_output jsonb,
  confidence        real check (confidence between 0 and 1),
  evidence_refs     jsonb not null default '[]'::jsonb,
  status            text not null default 'success' check (status in ('success', 'error', 'review')),
  human_decision    text not null default 'none'
                      check (human_decision in ('none', 'accepted', 'edited', 'rejected')),
  human_override    jsonb,
  latency_ms        integer,
  usage_metadata    jsonb,
  error_code        text,
  error_summary     text,
  created_at        timestamptz not null default now(),
  decided_at        timestamptz
);

create index if not exists ai_run_entity_idx on public.ai_run (entity_type, entity_id, created_at desc);
create index if not exists ai_run_task_idx   on public.ai_run (task_type, created_at desc);
create index if not exists ai_run_hash_idx   on public.ai_run (task_type, input_hash) where input_hash is not null;

-- The actionable half of an AI run: what CarolOS proposes Carol should do.
create table if not exists public.ai_recommendation (
  id             uuid primary key default gen_random_uuid(),
  ai_run_id      uuid references public.ai_run (id) on delete set null,
  opportunity_id uuid references public.opportunity (id) on delete cascade,
  brand_id       uuid references public.brand (id) on delete cascade,
  kind           text not null check (kind in
                   ('next_action', 'reply_draft', 'negotiation', 'pricing', 'barter',
                    'upsell', 'renewal', 'creative', 'dossier', 'brief')),
  action         text not null default '',
  summary        text not null default '',
  reason         text not null default '',
  payload        jsonb not null default '{}'::jsonb,
  risk           text not null default 'none' check (risk in ('none', 'low', 'medium', 'high')),
  confidence     real check (confidence between 0 and 1),
  requires_approval boolean not null default true,
  status         text not null default 'pending'
                   check (status in ('pending', 'accepted', 'edited', 'rejected', 'superseded')),
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists ai_recommendation_opp_idx on public.ai_recommendation (opportunity_id, status, created_at desc);

alter table public.action_item
  add constraint action_item_recommendation_fk
  foreign key (recommendation_id) references public.ai_recommendation (id) on delete set null
  not valid;

alter table public.ai_run            enable row level security;
alter table public.ai_recommendation enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ai_run', 'ai_recommendation'] loop
    execute format('drop policy if exists "carolos user manages %1$s" on public.%1$I', t);
    execute format(
      'create policy "carolos user manages %1$s" on public.%1$I for all to authenticated
         using (public.is_carolos_user()) with check (public.is_carolos_user())', t);
  end loop;
end $$;
