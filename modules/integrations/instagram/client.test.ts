import assert from 'node:assert/strict';
import test from 'node:test';

import { InstagramClient, safePath } from './client';
import { MetaApiError } from './errors';
import { AUTO_LINK_SCORE, matchPublication, textSimilarity } from './match';
import { REFRESH_WINDOW_DAYS, expiryFrom, health, shouldRefresh, tokenStatus } from './token';

const TOKEN = 'IGAA_um_token_de_teste_que_nao_pode_vazar';

/** Um `fetch` de mentira que guarda as URLs pedidas e devolve o que se lhe
 *  mandar. Sem rede: os testes correm no CI sem credencial nenhuma. */
function fakeFetch(responses: { status: number; body: unknown }[]) {
  const urls: string[] = [];
  let i = 0;
  const impl = (async (url: string | URL) => {
    urls.push(String(url));
    const r = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => JSON.stringify(r.body),
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, urls, count: () => i };
}

const client = (f: ReturnType<typeof fakeFetch>) =>
  new InstagramClient({ accessToken: TOKEN, version: 'v26.0', fetchImpl: f.impl, timeoutMs: 500, backoffBaseMs: 1 });

/* ── Pedido ───────────────────────────────────────────────────────────────── */

test('monta a URL com a versão configurada e o token fora do caminho', async () => {
  const f = fakeFetch([{ status: 200, body: { id: '1' } }]);
  await client(f).request('me', { params: { fields: 'id,username' } });

  assert.match(f.urls[0], /graph\.instagram\.com\/v26\.0\/me/);
  assert.match(f.urls[0], /fields=id%2Cusername/);
  assert.match(f.urls[0], /access_token=/);
  // O caminho registado não pode levar a query.
  assert.equal(safePath('me/media?access_token=X'), 'me/media');
  assert.equal(safePath(f.urls[0]), '/v26.0/me');
});

test('o registo de chamadas não guarda o token', async () => {
  const f = fakeFetch([{ status: 200, body: { id: '1' } }]);
  const c = client(f);
  await c.request('me');
  assert.equal(c.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(c.calls), /IGAA/);
});

test('parâmetros vazios não entram na query', async () => {
  const f = fakeFetch([{ status: 200, body: {} }]);
  await client(f).request('me/media', { params: { after: undefined, limit: 25 } });
  assert.doesNotMatch(f.urls[0], /after=/);
  assert.match(f.urls[0], /limit=25/);
});

/* ── Recuo ────────────────────────────────────────────────────────────────── */

test('um 500 é tentado de novo; um 400 não', async () => {
  const bom = fakeFetch([{ status: 500, body: {} }, { status: 200, body: { id: 'ok' } }]);
  const r = await client(bom).request<{ id: string }>('me', { attempts: 2 });
  assert.equal(r.id, 'ok');
  assert.equal(bom.count(), 2);

  const mau = fakeFetch([{ status: 400, body: { error: { message: 'nope', code: 100 } } }]);
  await assert.rejects(() => client(mau).request('me', { attempts: 3 }), MetaApiError);
  assert.equal(mau.count(), 1, 'um 4xx permanente não se repete');
});

test('um token revogado não é tentado de novo', async () => {
  const f = fakeFetch([{ status: 401, body: { error: { message: 'revoked', code: 190, error_subcode: 460 } } }]);
  await assert.rejects(
    () => client(f).request('me', { attempts: 3 }),
    (e: unknown) => e instanceof MetaApiError && e.detail.kind === 'auth_revoked',
  );
  assert.equal(f.count(), 1);
});

/* ── Paginação ────────────────────────────────────────────────────────────── */

test('segue paging.next e junta as páginas', async () => {
  const f = fakeFetch([
    { status: 200, body: { data: [{ id: 'a' }, { id: 'b' }], paging: { next: 'https://graph.instagram.com/v26.0/me/media?after=X' } } },
    { status: 200, body: { data: [{ id: 'c' }] } },
  ]);
  const todos = await client(f).paginate<{ id: string }>('me/media', { params: { limit: 2 } });
  assert.deepEqual(todos.map((m) => m.id), ['a', 'b', 'c']);
  assert.equal(f.count(), 2);
});

test('a paginação respeita o teto de páginas', async () => {
  const f = fakeFetch([{ status: 200, body: { data: [{ id: 'x' }], paging: { next: 'https://graph.instagram.com/v26.0/me/media?after=Y' } } }]);
  const todos = await client(f).paginate<{ id: string }>('me/media', { maxPages: 3 });
  assert.equal(todos.length, 3);
});

/* ── Insights com métrica não suportada ───────────────────────────────────── */

test('uma métrica não suportada não derruba o snapshot inteiro', async () => {
  const f = fakeFetch([
    {
      status: 400,
      body: { error: { message: 'The Media Insights API does not support the profile_visits, follows metric for this media product type.', code: 100 } },
    },
    { status: 200, body: { data: [{ name: 'views', values: [{ value: 100 }] }] } },
  ]);

  const r = await client(f).insights('123', ['views', 'profile_visits', 'follows']);
  assert.deepEqual(r.unsupported.sort(), ['follows', 'profile_visits']);
  assert.equal(f.count(), 2, 'repetiu sem as métricas recusadas');
  assert.deepEqual(r.requested, ['views', 'profile_visits', 'follows']);
});

test('uma publicação sem insights devolve tudo indisponível em vez de falhar', async () => {
  const f = fakeFetch([
    { status: 400, body: { error: { message: 'publicados antes da conta comercial', code: 100, error_subcode: 2108006 } } },
  ]);
  const r = await client(f).insights('123', ['views', 'reach']);
  assert.equal(r.unavailable?.kind, 'not_available');
  assert.deepEqual(r.unsupported, ['views', 'reach']);
});

/* ── Token ────────────────────────────────────────────────────────────────── */

const now = new Date('2026-09-05T12:00:00Z');
const emDias = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString();

test('renova só dentro da janela e nunca um token acabado de emitir', () => {
  const base = { status: 'connected', lastRefreshAt: null, issuedAt: emDias(-40) };

  assert.equal(shouldRefresh({ ...base, expiresAt: emDias(40) }, now).refresh, false);
  assert.equal(shouldRefresh({ ...base, expiresAt: emDias(5) }, now).refresh, true);
  assert.equal(REFRESH_WINDOW_DAYS, 10);

  // A Meta recusa renovar um token com menos de 24 h.
  const novo = shouldRefresh({ status: 'connected', expiresAt: emDias(5), lastRefreshAt: emDias(-0.5), issuedAt: emDias(-0.5) }, now);
  assert.equal(novo.refresh, false);
});

test('expirado e revogado não se resolvem renovando', () => {
  assert.equal(shouldRefresh({ status: 'connected', expiresAt: emDias(-1), lastRefreshAt: null, issuedAt: null }, now).refresh, false);
  assert.equal(shouldRefresh({ status: 'revoked', expiresAt: emDias(5), lastRefreshAt: null, issuedAt: emDias(-40) }, now).refresh, false);
  assert.equal(tokenStatus({ status: 'connected', expiresAt: emDias(-1), lastRefreshAt: null, issuedAt: null }, now), 'expired');
});

test('a validade sai da resposta, não de um sessenta gravado a ferro', () => {
  assert.equal(expiryFrom(5_184_000, now), new Date(now.getTime() + 5_184_000_000).toISOString());
  assert.equal(expiryFrom(null, now), null);
  assert.equal(expiryFrom(0, now), null);
});

test('a saúde fala português e diz quando precisa dela', () => {
  const h = health({ status: 'connected', expiresAt: emDias(-1), lastRefreshAt: null, issuedAt: null, lastSuccessAt: emDias(-2) }, now);
  assert.equal(h.needsCarol, true);
  assert.match(h.message, /ligar de novo/i);
  assert.doesNotMatch(h.message, /token|oauth|190/i);

  const ok = health({ status: 'connected', expiresAt: emDias(40), lastRefreshAt: null, issuedAt: null, lastSuccessAt: emDias(-0.1) }, now);
  assert.equal(ok.needsCarol, false);
});

/* ── Vinculação de publicação ─────────────────────────────────────────────── */

const media = {
  externalMediaId: 'ig-1',
  permalink: 'https://www.instagram.com/reel/ABC/',
  caption: 'Fiquei duas horas mexendo no cenário e no fim o primeiro estava melhor',
  publishedAt: '2026-09-05T16:20:00Z',
  platform: 'instagram',
};

const candidato = (over: Partial<Parameters<typeof matchPublication>[1][number]> = {}) => ({
  contentId: 'c1',
  storyId: 's1',
  title: 'Cenário que eu compliquei',
  text: 'duas horas mexendo no cenário para no fim voltar ao primeiro',
  platform: 'instagram',
  status: 'recorded',
  readyAt: '2026-09-05T14:00:00Z',
  externalMediaId: null,
  permalink: null,
  ...over,
});

test('um id externo já ligado ganha a tudo', () => {
  const r = matchPublication(media, [candidato({ externalMediaId: 'ig-1' })]);
  assert.equal(r.kind, 'exact');
});

test('uma candidata clara é ligada sozinha', () => {
  const r = matchPublication(media, [candidato()]);
  assert.equal(r.kind, 'confident');
  assert.ok(r.kind === 'confident' && r.score >= AUTO_LINK_SCORE);
});

test('duas candidatas parecidas viram pergunta, nunca palpite silencioso', () => {
  const r = matchPublication(media, [candidato({ contentId: 'c1' }), candidato({ contentId: 'c2' })]);
  assert.equal(r.kind, 'ambiguous');
  assert.ok(r.kind === 'ambiguous' && r.options.length >= 2);
});

test('sem nada parecido fica por vincular em vez de vincular errado', () => {
  const r = matchPublication(media, [
    candidato({ title: 'Treino de terça', text: 'esteira e agachamento', readyAt: '2026-06-01T00:00:00Z' }),
  ]);
  assert.equal(r.kind, 'none');
});

test('plataforma diferente nunca casa', () => {
  const r = matchPublication(media, [candidato({ platform: 'tiktok' })]);
  assert.equal(r.kind, 'none');
});

test('a semelhança de texto ignora palavras vazias', () => {
  assert.ok(textSimilarity('duas horas mexendo no cenário', 'mexendo no cenário duas horas') > 0.9);
  assert.ok(textSimilarity('treino de esteira', 'gravação com a marca') < 0.1);
});
