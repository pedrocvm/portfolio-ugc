import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLOSED_INTENTS,
  URGENT_INTENTS,
  guessIntent,
  readThreadState,
  waitingLine,
  type ThreadMessage,
} from './thread-state';

const NOW = new Date('2026-09-02T10:00:00Z');

const msg = (
  id: string,
  direction: 'inbound' | 'outbound',
  sentAt: string,
  extra: Partial<ThreadMessage> = {},
): ThreadMessage => ({ id, direction, sentAt, ...extra });

test('a última mensagem externa não é a última mensagem', () => {
  const state = readThreadState(
    [
      msg('1', 'outbound', '2026-08-19T09:00:00Z'),
      msg('2', 'inbound', '2026-08-28T18:00:00Z', { bodyText: 'O briefing está aprovado.' }),
      msg('3', 'outbound', '2026-08-29T09:00:00Z'),
    ],
    NOW,
  );

  assert.equal(state.last?.id, '3');
  assert.equal(state.lastExternal?.id, '2');
  assert.equal(state.lastCarol?.id, '3');
});

test('quando a última é dela, a marca é que está à espera', () => {
  const state = readThreadState(
    [msg('1', 'inbound', '2026-08-28T18:00:00Z'), msg('2', 'outbound', '2026-08-30T09:00:00Z')],
    NOW,
  );
  assert.equal(state.waitingOn, 'brand');
  assert.equal(state.waitingSince, '2026-08-30T09:00:00Z');
  assert.equal(state.waitingDays, 3);
});

test('quando a última é da marca, a vez é dela', () => {
  const state = readThreadState([msg('1', 'inbound', '2026-08-31T10:00:00Z')], NOW);
  assert.equal(state.waitingOn, 'carol');
  assert.equal(state.waitingDays, 2);
});

test('uma abordagem sem resposta deixa a bola do lado da marca', () => {
  const state = readThreadState([msg('1', 'outbound', '2026-08-20T10:00:00Z')], NOW);
  assert.equal(state.waitingOn, 'brand');
  assert.equal(state.inboundCount, 0);
  assert.equal(state.outboundCount, 1);
});

test('uma conversa vazia não põe ninguém à espera', () => {
  const state = readThreadState([], NOW);
  assert.equal(state.waitingOn, 'nobody');
  assert.equal(state.waitingSince, null);
  assert.equal(state.waitingDays, null);
});

test('a ordem de chegada não muda o resultado', () => {
  const desordenada = readThreadState(
    [
      msg('3', 'outbound', '2026-08-29T09:00:00Z'),
      msg('1', 'outbound', '2026-08-19T09:00:00Z'),
      msg('2', 'inbound', '2026-08-28T18:00:00Z'),
    ],
    NOW,
  );
  assert.equal(desordenada.lastExternal?.id, '2');
  assert.equal(desordenada.last?.id, '3');
});

/* ── O bug que este módulo existe para matar ──────────────────────────────── */

test('a intenção sai da mensagem da marca, nunca da mensagem dela', () => {
  // A Carol respondeu por último a dizer que manda o portefólio. Ler a última
  // mensagem dava PORTFOLIO_REQUEST — foi assim que UGREEN, Govee e HBADA
  // apareceram na Inbox com uma etiqueta de um pedido que nunca fizeram.
  const state = readThreadState(
    [
      msg('1', 'inbound', '2026-08-25T10:00:00Z', {
        bodyText: 'Podemos avançar com uma colaboração paga? Temos budget disponível.',
      }),
      msg('2', 'outbound', '2026-08-26T10:00:00Z', {
        bodyText: 'Claro! Envio já o meu portefólio com exemplos de trabalhos.',
      }),
    ],
    NOW,
  );

  assert.equal(guessIntent(state).intent, 'PAID_COLLAB');
});

test('sem mensagem da marca não se inventa intenção', () => {
  const state = readThreadState([msg('1', 'outbound', '2026-08-20T10:00:00Z', { bodyText: 'Olá!' })], NOW);
  const { intent, confidence } = guessIntent(state);
  assert.equal(intent, 'UNCERTAIN');
  assert.equal(confidence, 0);
});

test('o palpite reconhece os assuntos que não podem esperar', () => {
  const casos: [string, string][] = [
    ['Enviamos a fatura em anexo com o NIF certo', 'INVOICE'],
    ['Precisamos dos direitos de uso para anúncios pagos', 'USAGE_RIGHTS'],
    ['Queremos fazer whitelisting no perfil', 'WHITELISTING'],
    ['Qual é a tua tabela de preços?', 'RATE_REQUEST'],
    ['Podes enviar o portefólio?', 'PORTFOLIO_REQUEST'],
    ['Infelizmente não vamos avançar este ano', 'REJECTION'],
  ];
  for (const [texto, esperado] of casos) {
    const state = readThreadState([msg('1', 'inbound', '2026-09-01T10:00:00Z', { bodyText: texto })], NOW);
    assert.equal(guessIntent(state).intent, esperado, texto);
  }
});

test('uma resposta sem sinal nenhum é resposta, não é urgência', () => {
  const state = readThreadState(
    [msg('1', 'inbound', '2026-09-01T10:00:00Z', { bodyText: 'Obrigada pela mensagem, bom fim de semana.' })],
    NOW,
  );
  const { intent } = guessIntent(state);
  assert.equal(intent, 'GENERAL_REPLY');
  assert.equal(URGENT_INTENTS.has(intent), false);
});

test('dinheiro e direitos contam como urgentes; uma recusa conta como fechada', () => {
  assert.ok(URGENT_INTENTS.has('PAYMENT'));
  assert.ok(URGENT_INTENTS.has('EXCLUSIVITY'));
  assert.ok(CLOSED_INTENTS.has('REJECTION'));
  assert.equal(URGENT_INTENTS.has('REJECTION'), false);
});

test('a frase de espera diz de quem é a vez, sem tratar por tu', () => {
  const dela = readThreadState(
    [msg('1', 'inbound', '2026-08-31T10:00:00Z', { fromName: 'Julia Bachur' })],
    NOW,
  );
  assert.equal(waitingLine(dela, 'Cecotec'), 'Julia está à espera há 2 dias.');

  const daMarca = readThreadState(
    [msg('1', 'inbound', '2026-08-20T10:00:00Z'), msg('2', 'outbound', '2026-08-30T10:00:00Z')],
    NOW,
  );
  assert.equal(waitingLine(daMarca, 'Cecotec'), 'Respondida há 3 dias. A Cecotec ainda não voltou.');

  const fria = readThreadState([msg('1', 'outbound', '2026-08-20T10:00:00Z')], NOW);
  assert.equal(waitingLine(fria, 'Cecotec'), 'Abordada há 13 dias, ainda sem resposta.');

  for (const frase of [waitingLine(dela, 'X'), waitingLine(daMarca, 'X'), waitingLine(fria, 'X')]) {
    assert.equal(/\b(tens|queres|podes|teu|tua|você)\b/i.test(frase), false, frase);
  }
});
