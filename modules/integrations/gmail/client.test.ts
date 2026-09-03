import assert from 'node:assert/strict';
import test from 'node:test';

import { GmailError, messageOrNull, notFound } from './client';

/** A resposta do Google, sem rede. O que se testa aqui é a única decisão que o
 *  cliente toma sozinho: o que fazer quando a mensagem já não existe. */
async function withFetch(reply: () => Response, run: () => Promise<void>) {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => reply()) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = real;
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('uma mensagem apagada devolve null em vez de derrubar a sincronização', async () => {
  await withFetch(
    () => json(404, { error: { status: 'NOT_FOUND', message: 'Requested entity was not found.' } }),
    async () => {
      assert.equal(await messageOrNull('t', '199abc'), null);
    },
  );
});

test('uma mensagem que existe volta inteira', async () => {
  await withFetch(
    () => json(200, { id: '199abc', threadId: 'thr1' }),
    async () => {
      assert.equal((await messageOrNull('t', '199abc'))?.threadId, 'thr1');
    },
  );
});

test('uma falha do Google não é uma mensagem apagada: continua rebentando', async () => {
  await withFetch(
    () => json(500, { error: { status: 'INTERNAL' } }),
    async () => {
      await assert.rejects(messageOrNull('t', '199abc'), /gmail_500/);
    },
  );
});

test('o erro nomeia a chamada que falhou', () => {
  // «gmail_404:NOT_FOUND» sozinho não dizia se tinha sido o perfil, o histórico
  // ou uma mensagem, e foi isso que deixou o erro de produção indiagnosticável.
  assert.match(new GmailError(404, 'NOT_FOUND', '/history').message, /NOT_FOUND \(\/history\)/);
});

test('só um 404 do Gmail conta como «já não existe»', () => {
  assert.equal(notFound(new GmailError(404, 'NOT_FOUND', '/messages/1')), true);
  assert.equal(notFound(new GmailError(500, 'INTERNAL', '/messages/1')), false);
  assert.equal(notFound(new Error('404')), false);
});
