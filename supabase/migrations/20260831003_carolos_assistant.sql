-- Carol AI: conversas, execuções e memória durável.
--
-- Três coisas separadas de propósito:
--  · a conversa (thread/message) é o que a Carol vê e pode apagar;
--  · a execução (run/tool_call) é observabilidade, e não guarda raciocínio
--    interno — só o que aconteceu, quanto custou e o que falhou;
--  · a memória (business_memory) sobrevive às conversas, porque «não quero
--    trabalhar com haircare» não pode morrer quando ela fecha o chat.

create table if not exists public.assistant_thread (
  id           uuid primary key default gen_random_uuid(),
  app_user_id  uuid not null references public.app_user (id) on delete cascade,
  title        text not null default '',
  -- Em que ecrã a conversa começou. Guarda-se o id, nunca o conteúdo: o
  -- servidor volta a resolvê-lo a cada pedido, porque o browser não é fonte.
  context_type text check (context_type in ('brand', 'opportunity', 'document', 'collaboration', 'content', 'today', 'inbox', 'other')),
  context_id   uuid,
  -- Resumo para caber no contexto do modelo. Não substitui as mensagens.
  summary            text not null default '',
  summary_through_id uuid,
  summary_version    integer not null default 0,
  archived_at    timestamptz,
  last_message_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists assistant_thread_user_idx
  on public.assistant_thread (app_user_id, last_message_at desc nulls last)
  where archived_at is null;

create table if not exists public.assistant_message (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.assistant_thread (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant', 'tool')),
  content    text not null default '',
  -- As fontes que sustentam a resposta. Sem isto não há como mostrar de onde
  -- o assistente sabe o que diz, e uma afirmação sem origem é um palpite.
  sources    jsonb not null default '[]'::jsonb,
  status     text not null default 'complete' check (status in ('streaming', 'complete', 'error', 'cancelled')),
  error      text,
  model      text,
  prompt_version text,
  input_tokens   integer,
  output_tokens  integer,
  cached_tokens  integer,
  created_at timestamptz not null default now()
);

create index if not exists assistant_message_thread_idx
  on public.assistant_message (thread_id, created_at);

create table if not exists public.assistant_run (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.assistant_thread (id) on delete cascade,
  message_id  uuid references public.assistant_message (id) on delete set null,
  model       text not null default '',
  prompt_version text not null default '',
  gate        text check (gate in ('business_relevant', 'business_adjacent', 'off_topic', 'uncertain')),
  status      text not null default 'running' check (status in ('running', 'success', 'error', 'cancelled')),
  tool_rounds integer not null default 0,
  input_tokens  integer,
  output_tokens integer,
  cached_tokens integer,
  latency_ms  integer,
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists assistant_run_thread_idx on public.assistant_run (thread_id, started_at desc);

create table if not exists public.assistant_tool_call (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.assistant_run (id) on delete cascade,
  tool       text not null,
  -- Argumentos já validados pelo schema da ferramenta. Nunca segredos.
  arguments  jsonb not null default '{}'::jsonb,
  status     text not null default 'ok' check (status in ('ok', 'error', 'denied')),
  result_summary text not null default '',
  duration_ms integer,
  error      text,
  created_at timestamptz not null default now()
);

create index if not exists assistant_tool_call_run_idx on public.assistant_tool_call (run_id, created_at);

-- Memória durável: factos, preferências e decisões que valem para lá da
-- conversa onde foram ditos.
create table if not exists public.business_memory (
  id         uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_user (id) on delete cascade,
  type       text not null check (type in (
                'preference', 'goal', 'policy', 'pricing_decision', 'brand_preference',
                'content_preference', 'workflow', 'constraint', 'personal_business_context',
                'strategy', 'other')),
  subject    text not null default '',
  content    text not null,
  normalized_value jsonb,
  -- De onde veio, para se poder desfazer e para se poder duvidar.
  source     text not null default 'conversation',
  source_message_id uuid references public.assistant_message (id) on delete set null,
  confidence real check (confidence between 0 and 1),
  -- Uma memória proposta só conta depois de confirmada. Regra comercial nunca
  -- muda em silêncio: a proposta espera por uma pessoa.
  status     text not null default 'proposed' check (status in ('proposed', 'active', 'rejected', 'superseded')),
  effective_from timestamptz not null default now(),
  superseded_by  uuid references public.business_memory (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_memory_active_idx
  on public.business_memory (app_user_id, type, effective_from desc)
  where status = 'active';

-- Conhecimento documental: as fontes de verdade e o que se puder indexar.
create table if not exists public.knowledge_source (
  id          uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in (
                 'source_of_truth', 'portfolio', 'business_memory', 'uploaded_document',
                 'email', 'instagram', 'brief', 'contract', 'proposal', 'other')),
  title       text not null,
  -- Quem ganha quando duas fontes discordam. Maior é mais forte.
  authority   integer not null default 50 check (authority between 0 and 100),
  version     text not null default 'v1',
  effective_date date,
  status      text not null default 'active' check (status in ('active', 'superseded', 'draft')),
  storage_path text,
  checksum    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (source_type, title, version)
);

create table if not exists public.knowledge_chunk (
  id         uuid primary key default gen_random_uuid(),
  source_id  uuid not null references public.knowledge_source (id) on delete cascade,
  ordinal    integer not null default 0,
  heading    text not null default '',
  content    text not null,
  -- Pesquisa de texto integral do Postgres. Português para os acentos e os
  -- radicais; sem isto «direitos» não encontrava «direito».
  search     tsvector generated always as (
               to_tsvector('portuguese', coalesce(heading, '') || ' ' || coalesce(content, ''))
             ) stored,
  created_at timestamptz not null default now(),
  unique (source_id, ordinal)
);

create index if not exists knowledge_chunk_search_idx on public.knowledge_chunk using gin (search);

alter table public.assistant_thread     enable row level security;
alter table public.assistant_message    enable row level security;
alter table public.assistant_run        enable row level security;
alter table public.assistant_tool_call  enable row level security;
alter table public.business_memory      enable row level security;
alter table public.knowledge_source     enable row level security;
alter table public.knowledge_chunk      enable row level security;

create policy "carolos user manages assistant_thread" on public.assistant_thread
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());
create policy "carolos user manages assistant_message" on public.assistant_message
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());
create policy "carolos user manages assistant_run" on public.assistant_run
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());
create policy "carolos user manages assistant_tool_call" on public.assistant_tool_call
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());
create policy "carolos user manages business_memory" on public.business_memory
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());
create policy "carolos user manages knowledge_source" on public.knowledge_source
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());
create policy "carolos user manages knowledge_chunk" on public.knowledge_chunk
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

create trigger assistant_thread_touch before update on public.assistant_thread
  for each row execute function public.touch_updated_at();
create trigger business_memory_touch before update on public.business_memory
  for each row execute function public.touch_updated_at();
create trigger knowledge_source_touch before update on public.knowledge_source
  for each row execute function public.touch_updated_at();
