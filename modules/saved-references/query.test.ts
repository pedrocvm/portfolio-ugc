import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import type { ReferenceDb } from './service';
import { literalReferenceSearchPattern, referenceQuerySchema, referenceSearchFilter } from './query';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://unit-test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'unit-test-anon-key';
const { listReferenceScreen } = await import('./service');

test('screen queries accept only known, bounded filters', () => {
  assert.deepEqual(referenceQuerySchema.parse({}), { page: 0, search: '', status: 'all', collection: '' });
  for (const input of [
    { page: -1 }, { page: 1.5 }, { search: 'a'.repeat(201) }, { collection: 'a'.repeat(101) },
    { status: 'published' }, { limit: 10000 }, { columns: '*' }, { order: 'caption' }, { search: '\0' },
  ]) assert.equal(referenceQuerySchema.safeParse(input).success, false);
});

test('search treats wildcard and regex characters as literal text', () => {
  for (const value of ['100%_real*', '(a|b)+[x].?', 'pasta\\arquivo', 'Carol $ hoje^', 'UGC {2}']) {
    const pattern = literalReferenceSearchPattern(value);
    assert.equal(new RegExp(pattern, 'i').test(`antes ${value} depois`), true);
    assert.equal(new RegExp(pattern, 'i').test('qualquer texto que não corresponde'), false);
  }
  assert.equal(new RegExp(literalReferenceSearchPattern('a.*'), 'i').test('abc'), false);
  assert.equal(new RegExp(literalReferenceSearchPattern('100%'), 'i').test('100 reais'), false);
});

test('PostgREST control characters stay inside all six quoted search values', () => {
  const search = '"),status.eq.ready,or=(id.neq.x)\\%_*';
  const filter = referenceSearchFilter(search);
  const parts = [...filter.matchAll(/(?:^|,)([a-z_>\-]+)\.imatch\.("(?:\\.|[^"\\])*")(?=,|$)/g)];
  assert.deepEqual(parts.map((part) => part[1]), [
    'title', 'caption', 'creator_handle', 'notes', 'analysis->>title', 'analysis->adaptation->>subject',
  ]);
  for (const part of parts) assert.equal(JSON.parse(part[2]), literalReferenceSearchPattern(search));
});

function paginationFixture() {
  const rows = Array.from({ length: 761 }, (_, index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    source_url: `https://www.instagram.com/p/Reference${index}/`, external_id: null,
    collection_name: index < 700 ? 'Atual' : 'Histórico', media_kind: 'reel', creator_handle: 'creator',
    title: `Referência ${index}`, caption: '', transcript: '', transcript_source: null,
    transcript_status: 'unavailable', visual_description: '', on_screen_text: '', media_limitations: [], notes: '',
    status: index % 2 === 0 ? 'ready' : 'queued', analysis: null, assets: [], pending_assets: [],
    upload_batch_id: index % 10 === 0 ? '20000000-0000-4000-8000-000000000001' : null,
    last_upload_batch_id: null, uploaded_at: '2026-10-04T10:00:00Z', last_error: null, attempts: 0,
    created_at: new Date(Date.UTC(2026, 9, 4, 10, 0, -index)).toISOString(), updated_at: '2026-10-04T10:00:00Z',
    published_at: null, processed_at: null, context_hash: null, content_board_item_id: null, connection_id: null,
  }));
  const calls: Array<{ url: URL; method: string; prefer: string | null }> = [];
  const db = createClient('https://unit-test.supabase.co', 'unit-test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        const method = init?.method ?? 'GET';
        calls.push({ url, method, prefer: new Headers(init?.headers).get('prefer') });
        if (!url.pathname.endsWith('/saved_reference')) return Response.json([]);
        const p = url.searchParams;
        if (p.get('select') === 'collection_name') {
          const after = p.get('collection_name')?.replace(/^gt\./, '');
          const names = rows.map((row) => row.collection_name).sort()
            .filter((name) => !after || name > after).slice(0, Number(p.get('limit') ?? 500));
          return Response.json(names.map((collection_name) => ({ collection_name })));
        }
        let matched = rows;
        if (p.has('collection_name')) matched = matched.filter((row) => row.collection_name === p.get('collection_name')!.slice(3));
        if (p.has('status')) matched = matched.filter((row) => row.status === p.get('status')!.slice(3));
        if (p.get('upload_batch_id') === 'not.is.null') matched = matched.filter((row) => row.upload_batch_id !== null);
        if (p.get('upload_batch_id') === 'is.null') matched = matched.filter((row) => row.upload_batch_id === null);
        const offset = Number(p.get('offset') ?? 0);
        const limit = Number(p.get('limit') ?? matched.length);
        if (offset >= matched.length && offset > 0) {
          return Response.json({ code: 'PGRST103', message: 'Requested range not satisfiable' }, {
            status: 416, headers: { 'Content-Range': `*/${matched.length}` },
          });
        }
        const selected = matched.slice(offset, offset + limit);
        const headers = { 'Content-Type': 'application/json', 'Content-Range': selected.length ? `${offset}-${offset + selected.length - 1}/${matched.length}` : `*/${matched.length}` };
        return new Response(method === 'HEAD' ? null : JSON.stringify(selected), { status: 200, headers });
      },
    },
  }) as unknown as ReferenceDb;
  return { db, rows, calls };
}

test('history beyond 300 is addressable and collection names are not truncated', async () => {
  const f = paginationFixture();
  const screen = await listReferenceScreen(f.db, { page: 12 });
  assert.equal(screen.total, 761);
  assert.equal(screen.page, 12);
  assert.equal(screen.pageSize, 60);
  assert.equal(screen.references.length, 41);
  assert.equal(screen.references[0].id, f.rows[720].id);
  assert.deepEqual(screen.collections, ['Atual', 'Histórico']);
  const pages = f.calls.filter((call) => call.url.searchParams.get('select') === 'collection_name');
  assert.equal(pages.length, 3);
  assert.equal(pages[1].url.searchParams.get('collection_name'), 'gt.Atual');
  assert.ok(f.calls.some((call) => call.prefer?.includes('count=exact')));
});

test('count and page use the same status, pending-upload and collection filters', async () => {
  const f = paginationFixture();
  const screen = await listReferenceScreen(f.db, { status: 'ready', collection: 'Histórico' });
  assert.equal(screen.total, 24);
  assert.equal(screen.references.length, 24);
  assert.ok(screen.references.every((reference) => reference.collectionName === 'Histórico' && reference.status === 'ready' && reference.uploadBatchId === null));
  const pending = await listReferenceScreen(f.db, { status: 'upload_pending', collection: 'Histórico' });
  assert.equal(pending.total, 7);
});

test('a page invalidated by deletion is clamped using the filtered exact count', async () => {
  const f = paginationFixture();
  const screen = await listReferenceScreen(f.db, { page: 99, collection: 'Histórico' });
  assert.equal(screen.total, 61);
  assert.equal(screen.page, 1);
  assert.equal(screen.references.length, 1);
  assert.ok(f.calls.some((call) => call.method === 'HEAD' && call.url.searchParams.get('collection_name') === 'eq.Histórico'));
});

test('literal JSON-path searches are sent through the authenticated query builder', async () => {
  const f = paginationFixture();
  const search = 'Renda 100% (_*) "ideia"';
  await listReferenceScreen(f.db, { search });
  const call = f.calls.find((call) => call.url.searchParams.has('or'));
  assert.equal(call?.url.searchParams.get('or'), `(${referenceSearchFilter(search)})`);
  assert.equal(call?.url.searchParams.get('limit'), '60');
  assert.equal(call?.url.searchParams.get('order'), 'created_at.desc,id.desc');
});
