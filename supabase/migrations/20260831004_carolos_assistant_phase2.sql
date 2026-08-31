-- Carol AI, segunda camada: anexos, insights proactivos e o lugar dos vectores.

-- ── Anexos ────────────────────────────────────────────────────────────────
-- Um ficheiro pode servir só esta conversa, ou passar a fonte de verdade. São
-- coisas diferentes: um print de uma DM não é conhecimento institucional.
create table if not exists public.assistant_attachment (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.assistant_thread (id) on delete cascade,
  message_id   uuid references public.assistant_message (id) on delete set null,
  kind         text not null check (kind in ('image', 'pdf', 'text')),
  media_type   text not null,
  file_name    text not null default '',
  byte_size    integer not null default 0,
  storage_path text not null,
  -- 'chat' vive e morre com a conversa; 'knowledge' foi promovido a fonte.
  mode         text not null default 'chat' check (mode in ('chat', 'knowledge')),
  knowledge_source_id uuid references public.knowledge_source (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists assistant_attachment_thread_idx
  on public.assistant_attachment (thread_id, created_at);

-- ── Insights proactivos ───────────────────────────────────────────────────
-- O assistente não pode existir só quando lhe perguntam. A chave de
-- deduplicação é o que impede o mesmo aviso de aparecer todos os dias.
create table if not exists public.assistant_insight (
  id          uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_user (id) on delete cascade,
  kind        text not null,
  severity    text not null default 'info' check (severity in ('info', 'warn', 'urgent')),
  title       text not null,
  detail      text not null default '',
  href        text,
  brand_id       uuid references public.brand (id) on delete cascade,
  opportunity_id uuid references public.opportunity (id) on delete cascade,
  dedupe_key  text not null,
  status      text not null default 'open' check (status in ('open', 'seen', 'dismissed', 'resolved')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (app_user_id, dedupe_key)
);

create index if not exists assistant_insight_open_idx
  on public.assistant_insight (app_user_id, severity, created_at desc)
  where status = 'open';

-- ── Vectores ──────────────────────────────────────────────────────────────
-- A coluna existe e o índice também. Fica vazia até haver um fornecedor de
-- embeddings: a Anthropic não tem API de embeddings, e meter um segundo
-- serviço pago só para isto seria pagar por estética. O FTS em português
-- resolve o que há hoje, e a coluna evita uma migração no dia em que não
-- resolver. 1536 dimensões é o formato mais comum entre fornecedores.
create extension if not exists vector;

alter table public.knowledge_chunk
  add column if not exists embedding vector(1536),
  add column if not exists embedding_model text;

create index if not exists knowledge_chunk_embedding_idx
  on public.knowledge_chunk using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

alter table public.assistant_attachment enable row level security;
alter table public.assistant_insight    enable row level security;

create policy "carolos user manages assistant_attachment" on public.assistant_attachment
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());
create policy "carolos user manages assistant_insight" on public.assistant_insight
  for all to authenticated using (is_carolos_user()) with check (is_carolos_user());

create trigger assistant_insight_touch before update on public.assistant_insight
  for each row execute function public.touch_updated_at();

-- Balde privado para o que ela larga no chat. Separado do `media`, que é
-- público e é o portfólio: um print de uma negociação não vive ao lado de um
-- vídeo publicado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assistant', 'assistant', false, 10485760,
        array['image/png','image/jpeg','image/webp','image/gif','application/pdf',
              'text/plain','text/markdown','text/csv'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "carolos user reads assistant files" on storage.objects
  for select to authenticated using (bucket_id = 'assistant' and is_carolos_user());
create policy "carolos user writes assistant files" on storage.objects
  for insert to authenticated with check (bucket_id = 'assistant' and is_carolos_user());
create policy "carolos user deletes assistant files" on storage.objects
  for delete to authenticated using (bucket_id = 'assistant' and is_carolos_user());
