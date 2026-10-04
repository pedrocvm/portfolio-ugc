import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ReferenceDb } from './service';
import type { StoredAsset } from './domain';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://unit-test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'unit-test-anon-key';

const {
  attachReferenceMedia, completeReferenceUpload, createSavedReference, makeReferenceAssets,
  updateSavedReference, validReferenceAssetPath, validateUploadedAsset, ReferenceServiceError,
} = await import('./service');

const referenceId = '10000000-0000-4000-8000-000000000001';
const connectionId = '20000000-0000-4000-8000-000000000001';
const sourceUrl = 'https://www.instagram.com/p/Abc12345/';
const now = '2026-10-04T10:00:00.000Z';
const initial = () => ({
  id: referenceId, source_url: sourceUrl, connection_id: connectionId, collection_name: 'Referências',
  assets: [] as StoredAsset[], pending_assets: [] as StoredAsset[], upload_batch_id: null as string | null,
  last_upload_batch_id: null as string | null, uploaded_at: now, updated_at: now,
  transcript: 'Fala que já foi conferida.', transcript_source: 'gemini', transcript_status: 'transcribed',
  visual_description: 'Carol mostra a tela.', on_screen_text: 'Texto observado', media_limitations: ['Fim cortado'],
  caption: '', notes: '', status: 'ready', analysis: { existing: true }, attempts: 1,
});

/** The fake implements persistence behavior, while tests assert the externally
 * meaningful guarantees around existing files, concurrent batches and evidence. */
function fixture() {
  const state: Record<string, unknown> = initial();
  const files = new Map<string, { size: number; contentType: string }>();
  const removed: string[] = [];
  const writes: Array<Record<string, unknown>> = [];
  const storage = {
    info: async (path: string) => ({ data: files.get(path) ?? null, error: files.has(path) ? null : { statusCode: 404 } }),
    createSignedUploadUrl: async (path: string, options: { upsert: boolean }) => {
      assert.equal(options.upsert, false);
      return { data: { path, token: 'signed-test-token', signedUrl: `https://unit-test.supabase.co/storage/v1/object/upload/sign/${path}` }, error: null };
    },
    remove: async (paths: string[]) => { removed.push(...paths); paths.forEach((path) => files.delete(path)); return { data: [], error: null }; },
  };
  const client = {
    from() {
      let patch: Record<string, unknown> | null = null;
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select() { return builder; },
        returns() { return builder; },
        eq(key: string, value: unknown) { filters.push([key, value]); return builder; },
        update(value: Record<string, unknown>) { patch = value; return builder; },
        async maybeSingle() {
          if (!filters.every(([key, value]) => state[key] === value)) return { data: null, error: null };
          if (patch) { writes.push(structuredClone(patch)); Object.assign(state, patch); }
          return { data: structuredClone(state), error: null };
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return builder.maybeSingle().then(resolve, reject);
        },
      };
      return builder;
    },
    storage: { from() { return storage; } },
  } as unknown as ReferenceDb;
  return { db: client, state, files, removed, writes, storage };
}

test('asset paths cannot escape the reference and uploaded metadata must match exactly', () => {
  const asset = makeReferenceAssets(referenceId, [{ mimeType: 'video/mp4', size: 100 }])[0];
  assert.ok(validReferenceAssetPath(referenceId, asset.path));
  assert.equal(validReferenceAssetPath(referenceId, `../${asset.path}`), false);
  assert.equal(validReferenceAssetPath(randomUUID(), asset.path), false);
  assert.equal(validReferenceAssetPath('.*', asset.path), false);
  validateUploadedAsset(asset, { size: 100, contentType: 'video/mp4' });
  assert.throws(() => validateUploadedAsset(asset, { size: 99, contentType: 'video/mp4' }), ReferenceServiceError);
  assert.throws(() => validateUploadedAsset(asset, { size: 100, contentType: 'image/png' }), ReferenceServiceError);
});

test('starting a replacement preserves the original files, explanation and checked transcript', async () => {
  const f = fixture();
  const original = makeReferenceAssets(referenceId, [{ mimeType: 'video/mp4', size: 60 }]);
  f.state.assets = original;
  const result = await attachReferenceMedia(referenceId, [{ mimeType: 'video/mp4', size: 100 }], f.db);
  assert.deepEqual(f.state.assets, original);
  assert.equal(f.state.transcript, 'Fala que já foi conferida.');
  assert.deepEqual(f.state.analysis, { existing: true });
  assert.equal(f.state.status, 'ready');
  assert.equal(f.removed.length, 0);
  assert.ok(result.uploadBatchId);
  assert.equal(result.uploads[0].index, 0);
});

test('a resumed batch returns only missing assets with their original indices', async () => {
  const f = fixture();
  const specs = [{ mimeType: 'image/png' as const, size: 50 }, { mimeType: 'image/jpeg' as const, size: 75 }];
  const staged = makeReferenceAssets(referenceId, specs);
  const batch = randomUUID();
  f.state.pending_assets = staged;
  f.state.upload_batch_id = batch;
  f.files.set(staged[0].path, { size: staged[0].size, contentType: staged[0].mimeType });
  const result = await attachReferenceMedia(referenceId, specs, f.db, batch);
  assert.deepEqual(result.uploads.map((upload) => upload.index), [1]);
  assert.equal(result.uploadBatchId, batch);
  assert.equal(f.writes.length, 0);
});

test('wrong connection, missing batch and mismatched bytes cannot replace the original', async () => {
  const f = fixture();
  const batch = randomUUID();
  const staged = makeReferenceAssets(referenceId, [{ mimeType: 'video/mp4', size: 100 }]);
  f.state.pending_assets = staged;
  f.state.upload_batch_id = batch;
  await assert.rejects(() => completeReferenceUpload(referenceId, {
    db: f.db, uploadBatchId: batch, connection: { id: randomUUID(), collectionName: 'Referências', pollSeconds: 300 },
  }), (error: unknown) => error instanceof ReferenceServiceError && error.status === 404);
  await assert.rejects(() => completeReferenceUpload(referenceId, { db: f.db }),
    (error: unknown) => error instanceof ReferenceServiceError && error.status === 409);
  f.files.set(staged[0].path, { size: 99, contentType: 'video/mp4' });
  await assert.rejects(() => completeReferenceUpload(referenceId, { db: f.db, uploadBatchId: batch }), ReferenceServiceError);
  assert.equal(f.writes.length, 0);
  assert.equal(f.removed.length, 0);
  assert.equal(f.state.transcript, 'Fala que já foi conferida.');
});

test('completion validates the whole batch, swaps atomically and clears only generated evidence', async () => {
  const f = fixture();
  const oldAssets = makeReferenceAssets(referenceId, [{ mimeType: 'video/mp4', size: 60 }]);
  const staged = makeReferenceAssets(referenceId, [{ mimeType: 'video/mp4', size: 100 }]);
  const batch = randomUUID();
  Object.assign(f.state, { assets: oldAssets, pending_assets: staged, upload_batch_id: batch });
  f.files.set(staged[0].path, { size: 100, contentType: 'video/mp4' });
  await completeReferenceUpload(referenceId, { db: f.db, uploadBatchId: batch });
  assert.deepEqual(f.state.assets, staged);
  assert.deepEqual(f.state.pending_assets, []);
  assert.equal(f.state.last_upload_batch_id, batch);
  assert.equal(f.state.upload_batch_id, null);
  assert.equal(f.state.status, 'queued');
  assert.equal(f.state.transcript, '');
  assert.deepEqual(f.state.media_limitations, []);
  assert.deepEqual(f.removed, oldAssets.map((asset) => asset.path));
  await completeReferenceUpload(referenceId, { db: f.db, uploadBatchId: batch });
  assert.equal(f.writes.length, 1);
});

test('duplicate with all bytes uploaded only acknowledges after completion is persisted', async () => {
  const f = fixture();
  const specs = [{ mimeType: 'video/mp4' as const, size: 100 }];
  const staged = makeReferenceAssets(referenceId, specs);
  Object.assign(f.state, { assets: [], pending_assets: staged, upload_batch_id: randomUUID(), uploaded_at: null, status: 'queued' });
  f.files.set(staged[0].path, { size: 100, contentType: 'video/mp4' });
  const result = await createSavedReference({ sourceUrl, assets: specs }, { db: f.db });
  assert.equal(result.duplicate, true);
  assert.deepEqual(result.uploads, []);
  assert.ok(f.state.uploaded_at);
  assert.equal(f.state.upload_batch_id, null);
  assert.deepEqual(f.state.assets, staged);
});

test('saving notes alone preserves Gemini provenance and a silent transcript status', async () => {
  const f = fixture();
  await updateSavedReference(referenceId, { caption: '', transcript: 'Fala que já foi conferida.', notes: 'Minha observação' }, f.db);
  assert.equal(f.state.transcript_source, 'gemini');
  assert.equal(f.state.transcript_status, 'transcribed');
  Object.assign(f.state, { transcript: '', transcript_source: null, transcript_status: 'silent' });
  await updateSavedReference(referenceId, { caption: '', transcript: '', notes: 'Outra observação' }, f.db);
  assert.equal(f.state.transcript_status, 'silent');
  assert.equal(f.state.transcript_source, null);
});
