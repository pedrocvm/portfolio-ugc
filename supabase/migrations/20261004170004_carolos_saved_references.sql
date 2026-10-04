-- Referências do gerenciador de conteúdo. Não reativa nenhum job ou área antiga.
-- A coleta entrega arquivos diretamente a um bucket privado; nenhum download
-- de URL externa é executado por estas funções.

create table public.saved_reference_connection (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  collection_name text not null check (char_length(trim(collection_name)) between 1 and 100),
  enabled boolean not null default true,
  token_prefix text not null,
  poll_seconds integer not null default 300 check (poll_seconds >= 300),
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  last_error text check (char_length(last_error) <= 1000),
  created_by uuid references public.app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Não participa do Realtime e não tem acesso para anon/authenticated.
create table public.saved_reference_connection_secret (
  connection_id uuid primary key references public.saved_reference_connection(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

create table public.saved_reference_settings (
  singleton boolean primary key default true check (singleton),
  reality_notes text not null check (char_length(trim(reality_notes)) between 1 and 20000),
  updated_at timestamptz not null default now()
);

-- Só um hash fica após uma exclusão. Uma nova coleta não restaura conteúdo
-- que a Carol excluiu. Adicionar a mesma URL manualmente remove o bloqueio.
create table public.saved_reference_tombstone (
  source_hash text primary key check (source_hash ~ '^[0-9a-f]{64}$'),
  deleted_at timestamptz not null default now()
);

create function public.saved_reference_assets_valid(p_assets jsonb, p_id uuid)
returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare
  asset jsonb;
  total_size bigint := 0;
  asset_size bigint;
begin
  if jsonb_typeof(p_assets) is distinct from 'array' or jsonb_array_length(p_assets) > 10 then
    return false;
  end if;
  for asset in select value from jsonb_array_elements(p_assets) loop
    if jsonb_typeof(asset) is distinct from 'object'
      or jsonb_typeof(asset->'size') is distinct from 'number'
      or (asset->>'size') !~ '^[0-9]+$'
      or (asset->>'path') is null
      or (asset->>'mimeType') is null then
      return false;
    end if;
    asset_size := (asset->>'size')::bigint;
    if asset_size < 1 or asset_size > 52428800 then return false; end if;
    if (asset->>'path') !~ ('^' || p_id::text || '/[0-9]{1,2}-[0-9a-f-]{36}\.(mp4|mov|webm|jpg|png|webp|mp3|m4a|wav|ogg)$') then
      return false;
    end if;
    if (asset->>'mimeType') not in (
      'video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp',
      'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'
    ) then return false; end if;
    total_size := total_size + asset_size;
  end loop;
  return total_size <= 83886080;
end;
$$;

create table public.saved_reference (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique check (source_url ~ '^https://www\.instagram\.com/p/[A-Za-z0-9_-]{5,64}/$'),
  external_id text check (external_id ~ '^[0-9]{1,40}$'),
  collection_name text not null default 'Referências' check (char_length(trim(collection_name)) between 1 and 100),
  media_kind text not null default 'unknown' check (media_kind in ('reel', 'carousel', 'image', 'unknown')),
  creator_handle text not null default '' check (char_length(creator_handle) <= 100),
  title text not null default '' check (char_length(title) <= 200),
  caption text not null default '' check (char_length(caption) <= 30000),
  transcript text not null default '' check (char_length(transcript) <= 60000),
  transcript_source text check (transcript_source in ('manual', 'gemini')),
  transcript_status text not null default 'pending' check (transcript_status in ('pending', 'transcribed', 'silent', 'unavailable')),
  visual_description text not null default '' check (char_length(visual_description) <= 14000),
  on_screen_text text not null default '' check (char_length(on_screen_text) <= 20000),
  media_limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(media_limitations) = 'array'),
  notes text not null default '' check (char_length(notes) <= 6000),
  status text not null default 'queued' check (status in ('queued', 'processing', 'needs_input', 'ready', 'failed')),
  analysis jsonb check (analysis is null or jsonb_typeof(analysis) = 'object'),
  assets jsonb not null default '[]'::jsonb,
  pending_assets jsonb not null default '[]'::jsonb,
  upload_batch_id uuid,
  last_upload_batch_id uuid,
  uploaded_at timestamptz,
  processing_token uuid,
  processing_started_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text check (char_length(last_error) <= 1500),
  processed_at timestamptz,
  context_hash text check (context_hash ~ '^[0-9a-f]{64}$'),
  content_board_item_id uuid references public.content_board_item(id) on delete set null,
  connection_id uuid references public.saved_reference_connection(id) on delete set null,
  created_by uuid references public.app_user(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_reference_assets_check check (public.saved_reference_assets_valid(assets, id)),
  constraint saved_reference_pending_assets_check check (public.saved_reference_assets_valid(pending_assets, id)),
  constraint saved_reference_upload_batch_check check (
    (upload_batch_id is null and jsonb_array_length(pending_assets) = 0)
    or (upload_batch_id is not null and jsonb_array_length(pending_assets) > 0)
  )
);

create index saved_reference_created_idx on public.saved_reference(created_at desc);
create index saved_reference_work_idx on public.saved_reference(status, next_attempt_at, created_at)
  where status in ('queued', 'failed', 'processing');
create index saved_reference_connection_idx on public.saved_reference(connection_id);
create index saved_reference_board_idx on public.saved_reference(content_board_item_id);
create index saved_reference_creator_idx on public.saved_reference(created_by);
create index saved_reference_connection_creator_idx on public.saved_reference_connection(created_by);

alter table public.saved_reference enable row level security;
alter table public.saved_reference_connection enable row level security;
alter table public.saved_reference_settings enable row level security;
alter table public.saved_reference_connection_secret enable row level security;
alter table public.saved_reference_tombstone enable row level security;

grant select, insert, update, delete on public.saved_reference to authenticated;
grant select, update on public.saved_reference_connection to authenticated;
grant select, insert, update on public.saved_reference_settings to authenticated;
revoke all on public.saved_reference, public.saved_reference_connection, public.saved_reference_settings from anon;
revoke all on public.saved_reference_connection_secret, public.saved_reference_tombstone from public, anon, authenticated;
grant all on public.saved_reference, public.saved_reference_connection, public.saved_reference_settings,
  public.saved_reference_connection_secret, public.saved_reference_tombstone to service_role;

create policy "carolos user manages saved_reference" on public.saved_reference
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());
create policy "carolos user reads reference connection" on public.saved_reference_connection
  for select to authenticated using (public.is_carolos_user());
create policy "carolos user updates reference connection" on public.saved_reference_connection
  for update to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());
create policy "carolos user manages reference settings" on public.saved_reference_settings
  for all to authenticated using (public.is_carolos_user()) with check (public.is_carolos_user());

create trigger saved_reference_touch before update on public.saved_reference
  for each row execute function public.touch_updated_at();
create trigger saved_reference_connection_touch before update on public.saved_reference_connection
  for each row execute function public.touch_updated_at();
create trigger saved_reference_settings_touch before update on public.saved_reference_settings
  for each row execute function public.touch_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'saved-reference-media', 'saved-reference-media', false, 52428800,
  array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "carolos user reads reference media" on storage.objects
  for select to authenticated using (bucket_id = 'saved-reference-media' and public.is_carolos_user());
create policy "carolos user uploads reference media" on storage.objects
  for insert to authenticated with check (bucket_id = 'saved-reference-media' and public.is_carolos_user());
create policy "carolos user deletes reference media" on storage.objects
  for delete to authenticated using (bucket_id = 'saved-reference-media' and public.is_carolos_user());

-- Uma única escrita transacional substitui o token anterior. Não há janela
-- em que coleção e hash pertençam a configurações diferentes.
create function public.rotate_saved_reference_connection(
  p_collection_name text, p_token_hash text, p_token_prefix text, p_created_by uuid
) returns setof public.saved_reference_connection
language plpgsql security invoker set search_path = ''
as $$
declare
  connection public.saved_reference_connection;
begin
  if not exists(select 1 from public.app_user where id = p_created_by and active) then
    raise exception 'Usuário do CarolOS não encontrado.';
  end if;
  insert into public.saved_reference_connection(singleton, collection_name, token_prefix, created_by)
  values(true, trim(p_collection_name), p_token_prefix, p_created_by)
  on conflict(singleton) do update set
    collection_name = excluded.collection_name, token_prefix = excluded.token_prefix,
    enabled = true, last_seen_at = null, last_sync_at = null, last_error = null,
    created_by = excluded.created_by, updated_at = now()
  returning * into connection;
  insert into public.saved_reference_connection_secret(connection_id, token_hash)
  values(connection.id, p_token_hash)
  on conflict(connection_id) do update set token_hash = excluded.token_hash, updated_at = now();
  return next connection;
end;
$$;
revoke all on function public.rotate_saved_reference_connection(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.rotate_saved_reference_connection(text, text, text, uuid) to service_role;

-- A coleta e a exclusão usam o mesmo lock curto por URL. Uma coleta iniciada
-- antes de a Carol excluir a referência não pode restaurá-la depois.
create function public.insert_saved_reference(p_record jsonb)
returns setof public.saved_reference
language plpgsql security invoker set search_path = ''
as $$
declare
  source_url text := p_record->>'source_url';
begin
  perform pg_advisory_xact_lock(hashtextextended(source_url, 0));
  if exists(select 1 from public.saved_reference_tombstone
    where source_hash = encode(sha256(convert_to(source_url, 'UTF8')), 'hex')) then
    return;
  end if;
  if not exists(select 1 from public.saved_reference_connection
    where id = (p_record->>'connection_id')::uuid and enabled
      and collection_name = p_record->>'collection_name') then
    raise exception 'Essa conexão não pode importar a pasta informada.';
  end if;
  return query insert into public.saved_reference(
    id, source_url, external_id, collection_name, media_kind, creator_handle, title,
    caption, transcript, notes, transcript_source, transcript_status, published_at,
    assets, pending_assets, upload_batch_id, uploaded_at, connection_id, created_by
  ) values (
    (p_record->>'id')::uuid, source_url, p_record->>'external_id', p_record->>'collection_name',
    p_record->>'media_kind', p_record->>'creator_handle', p_record->>'title',
    p_record->>'caption', p_record->>'transcript', p_record->>'notes',
    p_record->>'transcript_source', p_record->>'transcript_status', (p_record->>'published_at')::timestamptz,
    p_record->'assets', p_record->'pending_assets', (p_record->>'upload_batch_id')::uuid,
    (p_record->>'uploaded_at')::timestamptz, (p_record->>'connection_id')::uuid,
    (p_record->>'created_by')::uuid
  ) returning *;
end;
$$;
revoke all on function public.insert_saved_reference(jsonb) from public, anon, authenticated;
grant execute on function public.insert_saved_reference(jsonb) to service_role;

create function public.delete_saved_reference(p_id uuid, p_source_url text)
returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_source_url, 0));
  perform 1 from public.saved_reference where id = p_id and source_url = p_source_url for update;
  if not found then return false; end if;
  insert into public.saved_reference_tombstone(source_hash)
  values(encode(sha256(convert_to(p_source_url, 'UTF8')), 'hex'))
  on conflict(source_hash) do update set deleted_at = now();
  delete from public.saved_reference where id = p_id and source_url = p_source_url;
  return true;
end;
$$;
revoke all on function public.delete_saved_reference(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_saved_reference(uuid, text) to service_role;

-- O UPDATE reavalia o predicado depois de adquirir o lock. Duas entregas não
-- processam a mesma linha. Um worker antigo não termina um lease mais recente.
create function public.claim_saved_reference(p_id uuid)
returns setof public.saved_reference
language plpgsql security invoker set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('carolos:saved-reference-workers', 0));
  if (select count(*) from public.saved_reference
    where status = 'processing' and processing_started_at >= now() - interval '10 minutes') >= 2 then
    return;
  end if;
  return query update public.saved_reference set
    status = 'processing', processing_token = gen_random_uuid(), processing_started_at = now(),
    attempts = attempts + 1, last_error = null, updated_at = now()
  where id = p_id
    and attempts < 3
    and uploaded_at is not null
    and upload_batch_id is null
    and (
      status = 'queued'
      or (status = 'failed' and next_attempt_at <= now())
      or (status = 'processing' and processing_started_at < now() - interval '10 minutes')
    )
  returning *;
end;
$$;
revoke all on function public.claim_saved_reference(uuid) from public, anon, authenticated;
grant execute on function public.claim_saved_reference(uuid) to service_role;

-- Invoker mantém RLS. O lock da referência faz um duplo clique devolver o
-- mesmo card. A origem e a zona acompanham o roteiro sem publicar nada.
create function public.create_saved_reference_draft(
  p_reference_id uuid, p_pillar_id uuid, p_subject text, p_zone text,
  p_format text, p_script text, p_scheduled_for date
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  reference public.saved_reference;
  item_id uuid;
  next_position integer;
begin
  if not public.is_carolos_user() then raise exception 'Sem acesso ao CarolOS.'; end if;
  if p_subject is null or char_length(trim(p_subject)) not between 1 and 240
    or p_format is null or char_length(trim(p_format)) not between 1 and 100
    or p_script is null or char_length(p_script) > 40000
    or p_zone is null or p_zone not in ('Z1', 'Z2', 'Z3', 'Z4')
    or p_scheduled_for is null then
    raise exception 'Revise o assunto, a zona, o formato, o roteiro e a data.';
  end if;
  select * into reference from public.saved_reference where id = p_reference_id for update;
  if not found then raise exception 'Referência não encontrada.'; end if;
  if reference.content_board_item_id is not null then return reference.content_board_item_id; end if;
  if not exists(select 1 from public.content_pillar where id = p_pillar_id and active) then
    raise exception 'Esse tema central não está ativo. Escolha outro.';
  end if;
  select coalesce(max(position), -1) + 1 into next_position
  from public.content_board_item where scheduled_for = p_scheduled_for and stage = 'idea';
  insert into public.content_board_item(pillar_id, subject, format, script, scheduled_for, stage, position)
  values(p_pillar_id, trim(p_subject), trim(p_format),
    'Zona ' || p_zone || E'\n\n' || p_script ||
      case when position(reference.source_url in p_script) > 0 then ''
      else E'\n\nReferência original\n' || reference.source_url end,
    p_scheduled_for, 'idea', next_position)
  returning id into item_id;
  update public.saved_reference set content_board_item_id = item_id, updated_at = now()
  where id = p_reference_id;
  return item_id;
end;
$$;
revoke all on function public.create_saved_reference_draft(uuid, uuid, text, text, text, text, date) from public, anon;
grant execute on function public.create_saved_reference_draft(uuid, uuid, text, text, text, text, date) to authenticated;

-- Só as tabelas de interface são publicadas. Token e tombstone continuam fora.
do $$
declare
  table_name text;
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['saved_reference', 'saved_reference_connection', 'saved_reference_settings'] loop
      if not exists(select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
