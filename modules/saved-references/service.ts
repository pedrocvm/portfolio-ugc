import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { hasServiceRole, supabaseService } from '@/lib/supabase/service';
import { aiConfigured } from '@/modules/ai/gateway';
import { referenceMediaAvailable } from '@/modules/ai/reference-media';
import { DEFAULT_REFERENCE_REALITY } from '@/modules/content-brain/saved-reference-context';
import type { ContentPillar } from '@/modules/content-board/domain';
import {
  ASSET_MIMES, MAX_ASSETS, MAX_TOTAL_BYTES, POLL_SECONDS, REFERENCE_BUCKET,
  analysisSchema, assetSpecSchema, draftSchema, intakeSchema,
  type AssetSpec, type IntakeResult, type ReferenceConnection, type ReferenceDraft,
  type ReferenceScreen, type ReferenceSettings, type SavedReference, type StoredAsset,
  type UploadTarget,
} from './domain';
import {
  REFERENCE_PAGE_SIZE, referenceQuerySchema, referenceSearchFilter,
  type ParsedReferenceScreenQuery,
} from './query';

// As migrations recentes ainda não estão no snapshot de tipos gerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReferenceDb = SupabaseClient<any>;
const serviceDb = () => supabaseService() as unknown as ReferenceDb;
export const referenceSessionDb = async () => (await supabaseServer()) as unknown as ReferenceDb;

export const referencesEnabled = () => process.env.CAROLOS_REFERENCES_ENABLED !== 'false';
export const REFERENCE_SELECT = [
  'id', 'source_url', 'external_id', 'collection_name', 'media_kind', 'creator_handle', 'title',
  'caption', 'transcript', 'transcript_source', 'transcript_status', 'visual_description',
  'on_screen_text', 'notes', 'status', 'analysis', 'assets', 'last_error', 'attempts',
  'created_at', 'updated_at', 'published_at', 'processed_at', 'context_hash',
  'content_board_item_id', 'connection_id', 'uploaded_at', 'media_limitations',
  'pending_assets', 'upload_batch_id', 'last_upload_batch_id',
].join(',');
const CONNECTION_SELECT = 'id, collection_name, enabled, token_prefix, last_seen_at, last_sync_at, last_error, created_at, poll_seconds';
const MAX_AUTOMATIC_ATTEMPTS = 3;

type RawReference = {
  id: string; source_url: string; external_id: string | null; collection_name: string;
  media_kind: SavedReference['mediaKind']; creator_handle: string; title: string;
  caption: string; transcript: string; transcript_source: SavedReference['transcriptSource'];
  transcript_status: SavedReference['transcriptStatus']; visual_description: string;
  on_screen_text: string; media_limitations: string[]; notes: string; status: SavedReference['status'];
  analysis: unknown; assets: StoredAsset[]; pending_assets: StoredAsset[]; last_error: string | null;
  attempts: number; created_at: string; updated_at: string; published_at: string | null;
  processed_at: string | null; context_hash: string | null; content_board_item_id: string | null;
  connection_id: string | null; uploaded_at: string | null; upload_batch_id: string | null;
  last_upload_batch_id: string | null;
};

export class ReferenceServiceError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ReferenceServiceError';
    this.status = status;
  }
}

export function referenceErrorMessage(error: unknown): string {
  if (error instanceof ReferenceServiceError) return error.message;
  const code = (error as { code?: string } | null)?.code;
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202') {
    return 'As referências ainda precisam ser ativadas neste ambiente. A atualização do banco de dados está pendente.';
  }
  return 'Não foi possível concluir essa ação. Tente novamente.';
}

function ensureEnabled() {
  if (!referencesEnabled()) throw new ReferenceServiceError('As referências estão pausadas neste ambiente.', 503);
}

function toReference(row: RawReference): SavedReference {
  const parsedAnalysis = analysisSchema.safeParse(row.analysis);
  return {
    id: String(row.id), sourceUrl: String(row.source_url), externalId: row.external_id as string | null,
    collectionName: String(row.collection_name), mediaKind: row.media_kind as SavedReference['mediaKind'],
    creatorHandle: String(row.creator_handle ?? ''), title: String(row.title ?? ''),
    caption: String(row.caption ?? ''), transcript: String(row.transcript ?? ''),
    transcriptSource: row.transcript_source as SavedReference['transcriptSource'],
    transcriptStatus: row.transcript_status as SavedReference['transcriptStatus'],
    visualDescription: String(row.visual_description ?? ''), onScreenText: String(row.on_screen_text ?? ''),
    mediaLimitations: row.media_limitations ?? [],
    notes: String(row.notes ?? ''), status: row.status as SavedReference['status'],
    analysis: parsedAnalysis.success ? parsedAnalysis.data : null,
    assets: row.assets ?? [], pendingAssets: row.pending_assets ?? [], uploadBatchId: row.upload_batch_id,
    lastError: row.last_error as string | null,
    attempts: Number(row.attempts ?? 0), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    publishedAt: row.published_at as string | null, processedAt: row.processed_at as string | null,
    contextHash: row.context_hash as string | null, contentBoardItemId: row.content_board_item_id as string | null,
    connectionId: row.connection_id as string | null,
  };
}

function toConnection(row: Record<string, unknown>): ReferenceConnection {
  return {
    id: String(row.id), collectionName: String(row.collection_name), enabled: Boolean(row.enabled),
    tokenPrefix: String(row.token_prefix), lastSeenAt: row.last_seen_at as string | null,
    lastSyncAt: row.last_sync_at as string | null, lastError: row.last_error as string | null,
    createdAt: String(row.created_at), pollSeconds: Number(row.poll_seconds ?? POLL_SECONDS),
  };
}

export async function getReferenceSettings(db: ReferenceDb = serviceDb()): Promise<ReferenceSettings> {
  const { data, error } = await db.from('saved_reference_settings')
    .select('reality_notes, updated_at').eq('singleton', true).maybeSingle();
  if (error) throw error;
  return { realityNotes: data?.reality_notes ?? DEFAULT_REFERENCE_REALITY, updatedAt: data?.updated_at ?? null };
}

export async function listReferencePillars(db: ReferenceDb = serviceDb()): Promise<ContentPillar[]> {
  const { data, error } = await db.from('content_pillar')
    .select('id, name, position, active').eq('active', true).order('position').order('created_at');
  if (error) throw error;
  return (data ?? []) as ContentPillar[];
}

export async function listRecentReferenceContent(limit = 20, db: ReferenceDb = serviceDb()) {
  const { data, error } = await db.from('content_board_item')
    .select('subject, format, scheduled_for, pillar:content_pillar(name)')
    .order('scheduled_for', { ascending: false }).limit(Math.min(50, Math.max(1, limit)))
    .returns<Array<{ subject: string; format: string; scheduled_for: string; pillar: { name: string } | null }>>();
  if (error) throw error;
  return (data ?? []).map((row: { subject: string; format: string; scheduled_for: string; pillar: { name: string } | null }) => ({
    subject: row.subject, format: row.format, scheduledFor: row.scheduled_for, pillarName: row.pillar?.name ?? '',
  }));
}

async function listReferenceCollections(client: ReferenceDb): Promise<string[]> {
  const names = new Set<string>();
  let afterName: string | null = null;
  while (true) {
    let query = client.from('saved_reference').select('collection_name')
      .order('collection_name').limit(500);
    if (afterName !== null) query = query.gt('collection_name', afterName);
    const { data, error } = await query.returns<Array<{ collection_name: string }>>();
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) names.add(row.collection_name);
    const nextName = data[data.length - 1].collection_name;
    if (nextName === afterName) throw new ReferenceServiceError('Não foi possível carregar todas as pastas. Tente novamente.', 503);
    afterName = nextName;
  }
  return [...names];
}

async function referencePage(client: ReferenceDb, input: ParsedReferenceScreenQuery) {
  function filtered(countOnly = false) {
    let query = client.from('saved_reference').select(countOnly ? 'id' : REFERENCE_SELECT, { count: 'exact', head: countOnly });
    if (input.status === 'upload_pending') query = query.not('upload_batch_id', 'is', null);
    else if (input.status !== 'all') query = query.eq('status', input.status).is('upload_batch_id', null);
    if (input.collection) query = query.eq('collection_name', input.collection);
    if (input.search) query = query.or(referenceSearchFilter(input.search));
    return query;
  }
  const read = (page: number) => filtered()
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(page * REFERENCE_PAGE_SIZE, page * REFERENCE_PAGE_SIZE + REFERENCE_PAGE_SIZE - 1)
    .returns<RawReference[]>();
  let page = input.page;
  let result = await read(page);
  // Exclusões ou um filtro novo podem invalidar a página anterior. Alguns
  // servidores respondem 416; outros retornam a página vazia com a contagem.
  if (result.error?.code === 'PGRST103') {
    const countResult = await filtered(true);
    if (countResult.error) throw countResult.error;
    if (countResult.count === null) throw new ReferenceServiceError('Não foi possível contar as referências. Tente novamente.', 503);
    page = Math.min(page, Math.max(0, Math.ceil(countResult.count / REFERENCE_PAGE_SIZE) - 1));
    result = await read(page);
  }
  if (result.error) throw result.error;
  if (result.count === null) throw new ReferenceServiceError('Não foi possível contar as referências. Tente novamente.', 503);
  const lastPage = Math.max(0, Math.ceil(result.count / REFERENCE_PAGE_SIZE) - 1);
  if (page > lastPage) {
    page = lastPage;
    result = await read(page);
    if (result.error) throw result.error;
    if (result.count === null) throw new ReferenceServiceError('Não foi possível contar as referências. Tente novamente.', 503);
  }
  return { references: (result.data ?? []).map(toReference), total: result.count, page };
}

export async function listReferenceScreen(db?: ReferenceDb, input: unknown = {}): Promise<ReferenceScreen> {
  const parsed = referenceQuerySchema.safeParse(input);
  if (!parsed.success) throw new ReferenceServiceError(parsed.error.issues[0]?.message ?? 'Filtros inválidos.');
  const client = db ?? await referenceSessionDb();
  const [page, connection, settings, collections] = await Promise.all([
    referencePage(client, parsed.data),
    client.from('saved_reference_connection').select(CONNECTION_SELECT).eq('singleton', true).maybeSingle(),
    getReferenceSettings(client),
    listReferenceCollections(client),
  ]);
  if (connection.error) throw connection.error;
  return {
    ...page, pageSize: REFERENCE_PAGE_SIZE, collections,
    connection: connection.data ? toConnection(connection.data) : null,
    settings,
    aiAvailable: referencesEnabled() && hasServiceRole() && aiConfigured(),
    transcriptionAvailable: referencesEnabled() && hasServiceRole() && referenceMediaAvailable(),
  };
}

async function referenceRow(id: string, db: ReferenceDb) {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new ReferenceServiceError('Referência inválida.');
  const { data, error } = await db.from('saved_reference').select(REFERENCE_SELECT).eq('id', id).returns<RawReference[]>().maybeSingle();
  if (error) throw error;
  if (!data) throw new ReferenceServiceError('Referência não encontrada.', 404);
  return data;
}

export async function getSavedReference(id: string, db?: ReferenceDb) {
  return toReference(await referenceRow(id, db ?? await referenceSessionDb()));
}

export const connectionTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export type ReferenceConnectionIdentity = { id: string; collectionName: string; pollSeconds: number };

export async function authenticateReferenceConnection(authorization: string | null): Promise<ReferenceConnectionIdentity | null> {
  if (!referencesEnabled() || !hasServiceRole()) return null;
  const match = authorization?.match(/^Bearer (crs_[A-Za-z0-9_-]{43})$/);
  if (!match) return null;
  const db = serviceDb();
  const { data: secret, error } = await db.from('saved_reference_connection_secret')
    .select('connection_id').eq('token_hash', connectionTokenHash(match[1])).maybeSingle();
  if (error) throw error;
  if (!secret) return null;
  const { data: connection, error: connectionError } = await db.from('saved_reference_connection')
    .select('id, collection_name, poll_seconds').eq('id', secret.connection_id).eq('enabled', true).maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection) return null;
  return { id: connection.id, collectionName: connection.collection_name, pollSeconds: connection.poll_seconds };
}

export async function createReferenceConnection(collectionName: string, createdBy: string) {
  ensureEnabled();
  const parsed = z.string().trim().min(1).max(100).safeParse(collectionName);
  if (!parsed.success) throw new ReferenceServiceError('Dê um nome de até 100 caracteres à pasta.');
  const token = `crs_${randomBytes(32).toString('base64url')}`;
  const { data, error } = await serviceDb().rpc('rotate_saved_reference_connection', {
    p_collection_name: parsed.data, p_token_hash: connectionTokenHash(token),
    p_token_prefix: token.slice(0, 11), p_created_by: createdBy,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new ReferenceServiceError('Não foi possível criar a conexão.', 500);
  return { token, connection: toConnection(row) };
}

export async function setReferenceConnectionEnabled(enabled: boolean, db?: ReferenceDb) {
  const client = db ?? await referenceSessionDb();
  const { data, error } = await client.from('saved_reference_connection')
    .update({ enabled, updated_at: new Date().toISOString() }).eq('singleton', true).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ReferenceServiceError('Crie a conexão primeiro.');
}

export async function heartbeatReferenceConnection(connection: ReferenceConnectionIdentity, input: { error?: string | null; synced?: boolean }) {
  const now = new Date().toISOString();
  const { error } = await serviceDb().from('saved_reference_connection').update({
    last_seen_at: now, ...(input.error !== undefined ? { last_error: input.error?.slice(0, 1000) || null } : {}),
    ...(input.synced ? { last_sync_at: now } : {}), updated_at: now,
  }).eq('id', connection.id).eq('enabled', true);
  if (error) throw error;
}

const extensionFor = (mimeType: AssetSpec['mimeType']) => ({
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg',
})[mimeType];

export function makeReferenceAssets(id: string, specs: AssetSpec[]): StoredAsset[] {
  return specs.map((asset, index) => ({ ...asset, path: `${id}/${index}-${randomUUID()}.${extensionFor(asset.mimeType)}` }));
}

export function validReferenceAssetPath(id: string, path: string): boolean {
  if (!z.uuid().safeParse(id).success) return false;
  return new RegExp(`^${id}/[0-9]{1,2}-[0-9a-f-]{36}\\.(?:mp4|mov|webm|jpg|png|webp|mp3|m4a|wav|ogg)$`).test(path);
}

export function validateUploadedAsset(asset: StoredAsset, info: { size?: number; contentType?: string; metadata?: { size?: number; mimetype?: string } }) {
  const size = info.size ?? info.metadata?.size;
  const mimeType = (info.contentType ?? info.metadata?.mimetype ?? '').split(';')[0].trim().toLowerCase();
  if (size !== asset.size || mimeType !== asset.mimeType) {
    throw new ReferenceServiceError('O arquivo enviado tem tamanho ou tipo diferente do informado. Anexe o arquivo novamente.');
  }
}

async function uploadTargets(reference: RawReference, db: ReferenceDb): Promise<UploadTarget[]> {
  if (!reference.upload_batch_id) return [];
  const id = reference.id;
  const assets = reference.pending_assets ?? [];
  const targets: UploadTarget[] = [];
  for (const [index, asset] of assets.entries()) {
    if (!validReferenceAssetPath(id, asset.path)) throw new ReferenceServiceError('Caminho de mídia inválido.', 400);
    const existing = await db.storage.from(REFERENCE_BUCKET).info(asset.path);
    if (existing.data) {
      validateUploadedAsset(asset, existing.data);
      continue;
    }
    const { data, error } = await db.storage.from(REFERENCE_BUCKET).createSignedUploadUrl(asset.path, { upsert: false });
    if (error || !data) throw new ReferenceServiceError('Não foi possível preparar o envio do arquivo. Tente novamente.', 503);
    targets.push({ ...asset, index, signedUrl: data.signedUrl, token: data.token });
  }
  return targets;
}

function sameAssetSpecs(left: readonly AssetSpec[], right: readonly AssetSpec[]) {
  return left.length === right.length && left.every((asset, index) =>
    asset.size === right[index].size && asset.mimeType === right[index].mimeType);
}

export type SkippedReferenceImport = { ok: true; skipped: true; duplicate: true; id: null; uploads: [] };
class ReferenceImportSkipped extends Error {}

export async function importReferenceFromConnection(input: unknown, connection: ReferenceConnectionIdentity): Promise<IntakeResult | SkippedReferenceImport> {
  const parsed = intakeSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceServiceError(parsed.error.issues[0]?.message ?? 'Referência inválida.');
  if (parsed.data.collectionName !== connection.collectionName) throw new ReferenceServiceError('Essa conexão só pode importar a pasta configurada.', 403);
  const db = serviceDb();
  const { data, error } = await db.from('saved_reference_tombstone').select('source_hash')
    .eq('source_hash', connectionTokenHash(parsed.data.sourceUrl)).maybeSingle();
  if (error) throw error;
  if (data) return { ok: true, skipped: true, duplicate: true, id: null, uploads: [] };
  try { return await createSavedReference(parsed.data, { db, connection }); }
  catch (error) {
    if (error instanceof ReferenceImportSkipped) return { ok: true, skipped: true, duplicate: true, id: null, uploads: [] };
    throw error;
  }
}

export async function createSavedReference(input: unknown, options: {
  db?: ReferenceDb; connection?: ReferenceConnectionIdentity; createdBy?: string;
} = {}): Promise<IntakeResult> {
  ensureEnabled();
  const parsed = intakeSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceServiceError(parsed.error.issues[0]?.message ?? 'Referência inválida.');
  const value = parsed.data;
  if (options.connection && value.collectionName !== options.connection.collectionName) {
    throw new ReferenceServiceError('Essa conexão só pode importar a pasta configurada.', 403);
  }
  const db = options.db ?? await referenceSessionDb();
  const { data: existing, error: readError } = await db.from('saved_reference').select(REFERENCE_SELECT)
    .eq('source_url', value.sourceUrl).returns<RawReference[]>().maybeSingle();
  if (readError) throw readError;
  if (existing) {
    if (options.connection && existing.connection_id !== options.connection.id) {
      // O token de importação não ganha permissão sobre uma referência manual.
      return { id: existing.id, duplicate: true, uploads: [] };
    }
    if (existing.upload_batch_id && value.assets.length && !sameAssetSpecs(existing.pending_assets, value.assets)) {
      throw new ReferenceServiceError('Esta referência tem outro envio em andamento. Abra a referência para anexar um novo arquivo.', 409);
    }
    const uploads = await uploadTargets(existing, db);
    if (existing.upload_batch_id && uploads.length === 0) {
      await completeReferenceUpload(existing.id, { db, connection: options.connection, uploadBatchId: existing.upload_batch_id });
    }
    return { id: existing.id, duplicate: true, uploads, uploadBatchId: existing.upload_batch_id };
  }
  if (!options.connection && hasServiceRole()) {
    const { error } = await serviceDb().from('saved_reference_tombstone').delete()
      .eq('source_hash', connectionTokenHash(value.sourceUrl));
    if (error) throw error;
  }
  const id = randomUUID();
  const assets = makeReferenceAssets(id, value.assets);
  const uploadBatchId = assets.length ? randomUUID() : null;
  const now = new Date().toISOString();
  const record = {
    id, source_url: value.sourceUrl, external_id: value.externalId ?? null,
    collection_name: value.collectionName, media_kind: value.mediaKind, creator_handle: value.creatorHandle,
    title: value.title, caption: value.caption, transcript: value.transcript, notes: value.notes,
    transcript_source: value.transcript.trim() ? 'manual' : null,
    transcript_status: value.transcript.trim() ? 'transcribed' : 'pending',
    published_at: value.publishedAt ?? null, assets: [], pending_assets: assets, upload_batch_id: uploadBatchId, status: 'queued',
    uploaded_at: assets.length ? null : now, connection_id: options.connection?.id ?? null,
    created_by: options.createdBy ?? null, updated_at: now,
  };
  const result = options.connection
    ? await db.rpc('insert_saved_reference', { p_record: record })
    : await db.from('saved_reference').insert(record).select(REFERENCE_SELECT).returns<RawReference[]>().maybeSingle();
  const error = result.error;
  const data = (Array.isArray(result.data) ? result.data[0] : result.data) as RawReference | null | undefined;
  if (error?.code === '23505') return createSavedReference(input, options);
  if (error) throw error;
  if (options.connection && !data) throw new ReferenceImportSkipped();
  if (!data) throw new ReferenceServiceError('Não foi possível salvar a referência.', 500);
  return { id, duplicate: false, uploads: await uploadTargets(data, db), uploadBatchId };
}

export async function attachReferenceMedia(id: string, input: unknown, db?: ReferenceDb, uploadBatchId?: string | null): Promise<IntakeResult> {
  ensureEnabled();
  const parsed = z.array(assetSpecSchema).min(1).max(MAX_ASSETS)
    .refine((assets) => assets.reduce((total, a) => total + a.size, 0) <= MAX_TOTAL_BYTES,
      'Os arquivos juntos devem ter até 80 MB.').safeParse(input);
  if (!parsed.success) throw new ReferenceServiceError(parsed.error.issues[0]?.message ?? 'Arquivos inválidos.');
  const client = db ?? await referenceSessionDb();
  const current = await referenceRow(id, client);
  if (uploadBatchId) {
    if (uploadBatchId === current.last_upload_batch_id && !current.upload_batch_id) {
      return { id, duplicate: true, uploads: [], uploadBatchId };
    }
    if (uploadBatchId !== current.upload_batch_id || !sameAssetSpecs(current.pending_assets, parsed.data)) {
      throw new ReferenceServiceError('Esse envio foi substituído. Atualize a referência para anexar novamente.', 409);
    }
    const uploads = await uploadTargets(current, client);
    if (!uploads.length) await completeReferenceUpload(id, { db: client, uploadBatchId });
    return { id, duplicate: true, uploads, uploadBatchId };
  }
  const assets = makeReferenceAssets(id, parsed.data);
  const batch = randomUUID();
  const { data, error } = await client.from('saved_reference').update({
    pending_assets: assets, upload_batch_id: batch, updated_at: new Date().toISOString(),
  }).eq('id', id).eq('updated_at', current.updated_at).select(REFERENCE_SELECT).returns<RawReference[]>().maybeSingle();
  if (error) throw error;
  if (!data) throw new ReferenceServiceError('A referência mudou. Atualize a página antes de anexar novamente.', 409);
  const oldPaths = (current.pending_assets ?? []).map((asset) => asset.path)
    .filter((path) => validReferenceAssetPath(id, path));
  if (oldPaths.length) await client.storage.from(REFERENCE_BUCKET).remove(oldPaths);
  return { id, duplicate: false, uploads: await uploadTargets(data, client), uploadBatchId: batch };
}

export async function completeReferenceUpload(id: string, options: {
  db?: ReferenceDb; connection?: ReferenceConnectionIdentity; uploadBatchId?: string | null;
} = {}) {
  ensureEnabled();
  const db = options.db ?? await referenceSessionDb();
  const row = await referenceRow(id, db);
  if (options.connection && (row.connection_id !== options.connection.id || row.collection_name !== options.connection.collectionName)) {
    throw new ReferenceServiceError('Referência não encontrada nesta conexão.', 404);
  }
  if (!row.upload_batch_id) {
    if (options.uploadBatchId && options.uploadBatchId !== row.last_upload_batch_id) {
      throw new ReferenceServiceError('Esse envio não corresponde ao arquivo atual.', 409);
    }
    return;
  }
  if (options.uploadBatchId !== row.upload_batch_id) {
    throw new ReferenceServiceError('Esse envio foi substituído. Atualize a referência antes de concluir.', 409);
  }
  const assets = row.pending_assets ?? [];
  for (const asset of assets) {
    if (!validReferenceAssetPath(id, asset.path)) throw new ReferenceServiceError('Caminho de mídia inválido.');
    const { data, error } = await db.storage.from(REFERENCE_BUCKET).info(asset.path);
    if (error || !data) throw new ReferenceServiceError('Ainda falta enviar um arquivo. Conclua o envio antes de analisar.');
    validateUploadedAsset(asset, data);
  }
  const { data, error } = await db.from('saved_reference').update({
    assets, pending_assets: [], last_upload_batch_id: row.upload_batch_id, upload_batch_id: null,
    uploaded_at: new Date().toISOString(), status: 'queued', last_error: null,
    attempts: 0, analysis: null, visual_description: '', on_screen_text: '', media_limitations: [],
    processed_at: null, context_hash: null, processing_token: null, processing_started_at: null,
    ...(row.transcript_source === 'gemini' ? { transcript: '', transcript_source: null, transcript_status: 'pending' } : {}),
    next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', id).eq('upload_batch_id', options.uploadBatchId).eq('updated_at', row.updated_at).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ReferenceServiceError('A referência mudou durante o envio. Atualize a página e tente novamente.', 409);
  const oldPaths = (row.assets ?? []).map((asset) => asset.path).filter((path) => validReferenceAssetPath(id, path));
  if (oldPaths.length) await db.storage.from(REFERENCE_BUCKET).remove(oldPaths);
}

export async function cancelReferenceUpload(id: string, uploadBatchId: string, db?: ReferenceDb) {
  if (!z.uuid().safeParse(uploadBatchId).success) throw new ReferenceServiceError('Envio inválido.');
  const client = db ?? await referenceSessionDb();
  const row = await referenceRow(id, client);
  if (!row.upload_batch_id) return;
  if (row.upload_batch_id !== uploadBatchId) throw new ReferenceServiceError('Esse envio já foi substituído.', 409);
  const { data, error } = await client.from('saved_reference').update({
    pending_assets: [], upload_batch_id: null,
    uploaded_at: row.uploaded_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', id).eq('upload_batch_id', uploadBatchId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new ReferenceServiceError('Esse envio já foi substituído.', 409);
  const paths = row.pending_assets.map((asset) => asset.path).filter((path) => validReferenceAssetPath(id, path));
  if (paths.length) await client.storage.from(REFERENCE_BUCKET).remove(paths);
}

export async function retrySavedReference(id: string, db?: ReferenceDb) {
  ensureEnabled();
  const client = db ?? await referenceSessionDb();
  const row = await referenceRow(id, client);
  if (row.upload_batch_id || !row.uploaded_at) {
    throw new ReferenceServiceError('Conclua o envio dos arquivos antes de analisar novamente.');
  }
  const { error } = await client.from('saved_reference').update({
    status: 'queued', attempts: 0, last_error: null, processing_token: null,
    processing_started_at: null, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export async function updateSavedReference(id: string, input: unknown, db?: ReferenceDb) {
  const parsed = z.object({ caption: z.string().max(30000), transcript: z.string().max(60000), notes: z.string().max(6000) }).strict().safeParse(input);
  if (!parsed.success) throw new ReferenceServiceError(parsed.error.issues[0]?.message ?? 'Conteúdo inválido.');
  const client = db ?? await referenceSessionDb();
  const row = await referenceRow(id, client);
  const value = parsed.data;
  const transcriptChanged = value.transcript !== row.transcript;
  const { error } = await client.from('saved_reference').update({
    caption: value.caption, transcript: value.transcript, notes: value.notes,
    ...(transcriptChanged ? { transcript_source: value.transcript.trim() ? 'manual' : null,
      transcript_status: value.transcript.trim() ? 'transcribed' : 'pending' } : {}),
    status: 'queued', attempts: 0, last_error: null, analysis: null, processed_at: null,
    processing_token: null, processing_started_at: null, context_hash: null,
    next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export async function saveReferenceSettings(realityNotes: unknown, db?: ReferenceDb) {
  const parsed = z.string().trim().min(1, 'Escreva o contexto que deve orientar as adaptações.').max(20000).safeParse(realityNotes);
  if (!parsed.success) throw new ReferenceServiceError(parsed.error.issues[0]?.message ?? 'Contexto inválido.');
  const client = db ?? await referenceSessionDb();
  const { error } = await client.from('saved_reference_settings').upsert({
    singleton: true, reality_notes: parsed.data, updated_at: new Date().toISOString(),
  }, { onConflict: 'singleton' });
  if (error) throw error;
}

export async function createReferenceDraft(input: unknown, db?: ReferenceDb): Promise<string> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceServiceError(parsed.error.issues[0]?.message ?? 'Rascunho inválido.');
  const value: ReferenceDraft = parsed.data;
  const client = db ?? await referenceSessionDb();
  const { data, error } = await client.rpc('create_saved_reference_draft', {
    p_reference_id: value.referenceId, p_pillar_id: value.pillarId,
    p_subject: value.subject, p_zone: value.zone, p_format: value.format,
    p_script: value.script, p_scheduled_for: value.scheduledFor,
  });
  if (error) {
    if (error.code === 'P0001') throw new ReferenceServiceError(error.message);
    throw error;
  }
  if (typeof data !== 'string') throw new ReferenceServiceError('Não foi possível criar o rascunho.', 500);
  return data;
}

export async function deleteSavedReference(id: string, db?: ReferenceDb) {
  const client = db ?? await referenceSessionDb();
  const row = await referenceRow(id, client);
  // Inclui lotes antigos cujo cleanup falhou. Repetir a primeira página
  // depois de remover evita pular objetos quando o conjunto diminui.
  for (let page = 0; page < 100; page++) {
    const { data: files, error: listError } = await client.storage.from(REFERENCE_BUCKET)
      .list(id, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
    if (listError) throw new ReferenceServiceError('Não foi possível conferir os arquivos para exclusão. Tente novamente.');
    if (!files?.length) break;
    const paths = files.map((file) => `${id}/${file.name}`).filter((path) => validReferenceAssetPath(id, path));
    if (paths.length !== files.length) throw new ReferenceServiceError('Não foi possível confirmar todos os arquivos desta referência.');
    const { error } = await client.storage.from(REFERENCE_BUCKET).remove(paths);
    if (error) throw new ReferenceServiceError('Não foi possível excluir os arquivos. Tente novamente.');
    if (page === 99) throw new ReferenceServiceError('Ainda há arquivos para excluir. Tente novamente para concluir.');
  }
  const { error } = await serviceDb().rpc('delete_saved_reference', { p_id: id, p_source_url: row.source_url });
  if (error) throw error;
}

export async function referenceMediaUrl(id: string, index: number, db?: ReferenceDb): Promise<string> {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_ASSETS) throw new ReferenceServiceError('Arquivo inválido.', 404);
  const client = db ?? await referenceSessionDb();
  const row = await referenceRow(id, client);
  const asset = ((row.assets ?? []) as StoredAsset[])[index];
  if (!row.uploaded_at || !asset || !validReferenceAssetPath(id, asset.path)) throw new ReferenceServiceError('Arquivo não encontrado.', 404);
  const { data, error } = await client.storage.from(REFERENCE_BUCKET).createSignedUrl(asset.path, 300);
  if (error || !data) throw new ReferenceServiceError('O arquivo original não está disponível.', 404);
  return data.signedUrl;
}

export async function claimReference(id: string): Promise<{ reference: SavedReference; lease: string } | null> {
  if (!referencesEnabled() || !hasServiceRole()) return null;
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await serviceDb().rpc('claim_saved_reference', { p_id: id });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.processing_token) return null;
  return { reference: toReference(row), lease: row.processing_token };
}

export type ReferenceProcessingPatch = Partial<Pick<SavedReference,
  'status' | 'transcript' | 'transcriptSource' | 'transcriptStatus' | 'visualDescription' |
  'onScreenText' | 'mediaLimitations' | 'analysis' | 'lastError' | 'processedAt' | 'contextHash' | 'assets' | 'title'
>>;

export async function finishReference(id: string, lease: string, patch: ReferenceProcessingPatch): Promise<boolean> {
  const columns: Record<keyof ReferenceProcessingPatch, string> = {
    status: 'status', transcript: 'transcript', transcriptSource: 'transcript_source',
    transcriptStatus: 'transcript_status', visualDescription: 'visual_description',
    onScreenText: 'on_screen_text', mediaLimitations: 'media_limitations', analysis: 'analysis', lastError: 'last_error',
    processedAt: 'processed_at', contextHash: 'context_hash', assets: 'assets', title: 'title',
  };
  const row: Record<string, unknown> = {
    processing_token: null, processing_started_at: null, updated_at: new Date().toISOString(),
    ...(patch.status === 'failed' ? { next_attempt_at: new Date(Date.now() + 60_000).toISOString() } : {}),
  };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && key in columns) row[columns[key as keyof ReferenceProcessingPatch]] = value;
  }
  const { data, error } = await serviceDb().from('saved_reference').update(row)
    .eq('id', id).eq('processing_token', lease).eq('status', 'processing').select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function listPendingReferenceIds(limit = 2): Promise<string[]> {
  if (!referencesEnabled() || !hasServiceRole()) return [];
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const db = serviceDb();
  const { error: recoveryError } = await db.from('saved_reference').update({
    status: 'failed', processing_token: null, processing_started_at: null,
    last_error: 'A análise foi interrompida. Tente novamente quando quiser.', updated_at: now,
  }).eq('status', 'processing').gte('attempts', MAX_AUTOMATIC_ATTEMPTS).lt('processing_started_at', staleBefore);
  if (recoveryError) throw recoveryError;
  const { data, error } = await db.from('saved_reference').select('id')
    .or(`status.eq.queued,and(status.eq.failed,next_attempt_at.lte.${now}),and(status.eq.processing,processing_started_at.lt.${staleBefore})`)
    .lt('attempts', MAX_AUTOMATIC_ATTEMPTS).not('uploaded_at', 'is', null).is('upload_batch_id', null)
    .order('created_at').limit(Math.min(10, Math.max(1, limit)));
  if (error) throw error;
  return (data ?? []).map((row: { id: string }) => row.id);
}

// Mantida aqui para confirmar que a lista usada no bucket e no domínio coincide.
export const supportedReferenceMimeTypes = ASSET_MIMES;
