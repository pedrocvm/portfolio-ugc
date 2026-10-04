import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REFERENCE_REQUEST_BYTES, readReferenceRequest, ReferenceRequestError } from './http';

function request(body: string, extra: Record<string, string> = {}) {
  return new Request('https://carol.example/api/references/ingest', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body,
  });
}

test('ingest accepts only the scoped import, completion and heartbeat contracts', async () => {
  const imported = await readReferenceRequest(request(JSON.stringify({
    action: 'import', reference: { sourceUrl: 'https://www.instagram.com/reel/Abc12345/?igsh=tracking' },
  })));
  assert.equal(imported.action, 'import');
  if (imported.action === 'import') assert.equal(imported.reference.sourceUrl, 'https://www.instagram.com/p/Abc12345/');
  for (const unsupported of [
    { action: 'delete', id: '10000000-0000-4000-8000-000000000001' },
    { action: 'heartbeat', contentBoardItemId: '10000000-0000-4000-8000-000000000001' },
    { action: 'import', reference: { sourceUrl: 'https://www.instagram.com/p/Abc12345/', assets: [{ mimeType: 'video/mp4', size: 42, path: 'other/private.mp4' }] } },
  ]) {
    await assert.rejects(() => readReferenceRequest(request(JSON.stringify(unsupported))),
      (error: unknown) => error instanceof ReferenceRequestError && error.status === 400);
  }
});

test('a missing or understated Content-Length never bypasses the byte limit', async () => {
  const oversized = ' '.repeat(MAX_REFERENCE_REQUEST_BYTES + 1);
  const headerVariants: Array<Record<string, string>> = [{}, { 'Content-Length': '2' }];
  for (const headers of headerVariants) {
    await assert.rejects(() => readReferenceRequest(request(oversized, headers)),
      (error: unknown) => error instanceof ReferenceRequestError && error.status === 413);
  }
});

test('oversized claimed length is rejected before reading the stream', async () => {
  await assert.rejects(() => readReferenceRequest(request('{}', { 'Content-Length': String(MAX_REFERENCE_REQUEST_BYTES + 1) })),
    (error: unknown) => error instanceof ReferenceRequestError && error.status === 413);
});

test('malformed JSON and unsupported Content-Type do not enter the service', async () => {
  await assert.rejects(() => readReferenceRequest(request('{not-json}')),
    (error: unknown) => error instanceof ReferenceRequestError && error.status === 400);
  await assert.rejects(() => readReferenceRequest(request('{}', { 'Content-Type': 'text/plain' })),
    (error: unknown) => error instanceof ReferenceRequestError && error.status === 415);
});

test('completion binds a UUID batch and heartbeat supports explicit error clearing', async () => {
  const value = await readReferenceRequest(request(JSON.stringify({
    action: 'complete', id: '10000000-0000-4000-8000-000000000001',
    uploadBatchId: '20000000-0000-4000-8000-000000000001',
  })));
  assert.equal(value.action, 'complete');
  assert.deepEqual(await readReferenceRequest(request('{"action":"heartbeat","error":null,"synced":false}')),
    { action: 'heartbeat', error: null, synced: false });
});
