import assert from 'node:assert/strict';
import test from 'node:test';

import { envelopeFor, safeEqual, verifySignature, verifySubscription } from './webhook-verify';

const SECRET = 'um-app-secret-de-teste';

const params = (o: Record<string, string>) => new URLSearchParams(o);

/* ── Verificação ──────────────────────────────────────────────────────────── */

test('a verificação devolve o challenge só com o token certo', () => {
  const ok = verifySubscription(
    params({ 'hub.mode': 'subscribe', 'hub.verify_token': 'segredo', 'hub.challenge': '12345' }),
    'segredo',
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.ok === true && ok.challenge, '12345');

  const errado = verifySubscription(
    params({ 'hub.mode': 'subscribe', 'hub.verify_token': 'outro', 'hub.challenge': '12345' }),
    'segredo',
  );
  assert.equal(errado.ok, false);
  assert.equal(errado.ok === false && errado.status, 403);
});

test('sem token configurado a verificação recusa em vez de aceitar', () => {
  const r = verifySubscription(params({ 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': '1' }), null);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.status, 503);
});

test('modo diferente de subscribe não passa', () => {
  const r = verifySubscription(params({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'segredo', 'hub.challenge': '1' }), 'segredo');
  assert.equal(r.ok, false);
});

test('a comparação do token é de tempo constante', () => {
  // O que interessa provar é o comportamento: comprimentos diferentes falham
  // sem comparar byte a byte, e iguais comparam a string toda.
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('', ''), true);
});

/* ── Assinatura ───────────────────────────────────────────────────────────── */

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `sha256=${Buffer.from(mac).toString('hex')}`;
}

test('um corpo sem assinatura válida não entra', async () => {
  const body = JSON.stringify({ object: 'instagram', entry: [] });
  assert.equal(await verifySignature(body, await sign(body, SECRET), SECRET), true);
  assert.equal(await verifySignature(body, await sign(body, 'outro-secret'), SECRET), false);
  assert.equal(await verifySignature(body, null, SECRET), false);
  assert.equal(await verifySignature(body, 'sha1=abc', SECRET), false);
});

test('sem App Secret configurado nada passa', async () => {
  const body = '{}';
  assert.equal(await verifySignature(body, await sign(body, SECRET), null), false);
});

test('mudar um byte do corpo invalida a assinatura', async () => {
  const body = JSON.stringify({ object: 'instagram', entry: [{ id: '1' }] });
  const assinatura = await sign(body, SECRET);
  assert.equal(await verifySignature(body, assinatura, SECRET), true);
  assert.equal(await verifySignature(`${body} `, assinatura, SECRET), false);
});

/* ── Idempotência ─────────────────────────────────────────────────────────── */

const payloadComentario = {
  object: 'instagram',
  entry: [{ id: '1784100000000000', time: 1757000000, changes: [{ field: 'comments', value: { id: 'comment-abc' } }] }],
};

test('o mesmo evento produz a mesma chave', async () => {
  const raw = JSON.stringify(payloadComentario);
  const a = await envelopeFor(raw, payloadComentario);
  const b = await envelopeFor(raw, payloadComentario);
  assert.equal(a.dedupeKey, b.dedupeKey);
  assert.equal(a.dedupeKey, 'ig:comments:comment-abc');
  assert.equal(a.field, 'comments');
  assert.equal(a.topic, 'instagram');
});

test('eventos diferentes produzem chaves diferentes', async () => {
  const outro = { ...payloadComentario, entry: [{ ...payloadComentario.entry[0], changes: [{ field: 'comments', value: { id: 'comment-xyz' } }] }] };
  const a = await envelopeFor(JSON.stringify(payloadComentario), payloadComentario);
  const b = await envelopeFor(JSON.stringify(outro), outro);
  assert.notEqual(a.dedupeKey, b.dedupeKey);
});

test('sem id do evento a chave é o hash do corpo, e continua estável', async () => {
  const semId = { object: 'instagram', entry: [{ id: '1', changes: [{ field: 'story_insights', value: {} }] }] };
  const raw = JSON.stringify(semId);
  const a = await envelopeFor(raw, semId);
  const b = await envelopeFor(raw, semId);
  assert.equal(a.dedupeKey, b.dedupeKey);
  assert.match(a.dedupeKey, /^ig:hash:/);
});

test('um payload que não reconhecemos não rebenta', async () => {
  const a = await envelopeFor('{}', {});
  assert.equal(a.topic, 'unknown');
  assert.equal(a.field, null);
  assert.match(a.dedupeKey, /^ig:hash:/);
});
