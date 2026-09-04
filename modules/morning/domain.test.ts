import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_PREPARED,
  briefStatus,
  closingLine,
  describePrepared,
  estimateMinutes,
  headline,
  orderDecisions,
  researchDidNotBecomeTasks,
  type Decision,
} from './domain';

const d = (over: Partial<Decision> = {}): Decision => ({
  id: 'x',
  kind: 'reply',
  subject: 'Cecotec',
  headline: 'A Julia aprovou o briefing.',
  because: 'Não pediu nada — só confirmou.',
  covers: 1,
  weightCents: null,
  urgent: false,
  waitingDays: null,
  minutes: 1,
  href: null,
  ...over,
});

test('a ordem é por nível, não por atraso', () => {
  // O Hoje antigo ordenava por atraso, o que punha em primeiro lugar a marca
  // que nunca respondeu — o item mais morto da lista.
  const ordem = orderDecisions([
    d({ id: 'conteudo', kind: 'content', subject: 'Instagram' }),
    d({ id: 'frio', kind: 'outreach_batch', subject: 'Prospeção', waitingDays: 40 }),
    d({ id: 'resposta', kind: 'reply', subject: 'Cecotec', waitingDays: 2 }),
    d({ id: 'gravar', kind: 'recording', subject: 'Dreame' }),
    d({ id: 'dinheiro', kind: 'money', subject: 'Charabanc', waitingDays: 12 }),
  ]);
  assert.deepEqual(
    ordem.map((x) => x.id),
    ['resposta', 'dinheiro', 'frio', 'gravar', 'conteudo'],
  );
});

test('dentro do nível, o urgente ganha ao antigo', () => {
  const ordem = orderDecisions([
    d({ id: 'antiga', waitingDays: 19 }),
    d({ id: 'urgente', urgent: true, waitingDays: 1 }),
  ]);
  assert.equal(ordem[0].id, 'urgente');
});

test('dentro do nível, o dinheiro conhecido ganha ao desconhecido', () => {
  const ordem = orderDecisions([
    d({ id: 'sem-valor', kind: 'money', weightCents: null, waitingDays: 30 }),
    d({ id: 'com-valor', kind: 'money', weightCents: 42000, waitingDays: 1 }),
  ]);
  assert.equal(ordem[0].id, 'com-valor');
});

test('a ordem é estável quando tudo empata', () => {
  const ordem = orderDecisions([d({ id: 'b', subject: 'Beta' }), d({ id: 'a', subject: 'Alfa' })]);
  assert.deepEqual(ordem.map((x) => x.id), ['a', 'b']);
});

/* ── Tempo ────────────────────────────────────────────────────────────────── */

test('a estimativa não multiplica um lote por si próprio', () => {
  const lote = estimateMinutes([d({ kind: 'outreach_batch', covers: 6, minutes: 3 })]);
  assert.ok(lote < 18, `${lote} minutos para seis emails é multiplicar em vez de estimar`);
  assert.ok(lote >= 7);
});

test('o histórico real ganha à tabela por omissão', () => {
  const semHistorico = estimateMinutes([d({ kind: 'reply', minutes: 1 })]);
  const comHistorico = estimateMinutes([d({ kind: 'reply', minutes: 1 })], { reply: 4 });
  assert.ok(comHistorico > semHistorico);
});

test('a estimativa nunca é zero', () => {
  assert.equal(estimateMinutes([]), 1);
});

/* ── Prova de vida ────────────────────────────────────────────────────────── */

test('só se conta o que aconteceu mesmo', () => {
  assert.deepEqual(describePrepared(EMPTY_PREPARED), []);
  const linhas = describePrepared({ ...EMPTY_PREPARED, brandsFound: 8, repliesPrepared: 1 });
  assert.equal(linhas.length, 2);
  assert.ok(linhas.some((l) => l.includes('8 marcas')));
  assert.ok(linhas.some((l) => l === 'preparei 1 resposta'));
});

test('os plurais concordam', () => {
  assert.ok(describePrepared({ ...EMPTY_PREPARED, mailboxesSynced: 1 })[0].includes('uma caixa'));
  assert.ok(describePrepared({ ...EMPTY_PREPARED, mailboxesSynced: 2 })[0].includes('2 caixas'));
  assert.ok(describePrepared({ ...EMPTY_PREPARED, contentIdeas: 1 })[0].includes('um conteúdo'));
});

/* ── Honestidade ──────────────────────────────────────────────────────────── */

test('uma falha parcial não finge que correu tudo bem', () => {
  const estado = briefStatus({ ...EMPTY_PREPARED, brandsFound: 8 }, [
    { area: 'tendências', message: 'Não consegui ver o TikTok hoje.' },
  ]);
  assert.equal(estado, 'partial');
});

test('falhar tudo é falhar, não é estar pronto', () => {
  assert.equal(briefStatus(EMPTY_PREPARED, [{ area: 'gmail', message: 'Sem ligação.' }]), 'failed');
});

test('sem falhas fica pronto', () => {
  assert.equal(briefStatus({ ...EMPTY_PREPARED, brandsFound: 1 }, []), 'ready');
});

/* ── A primeira frase ─────────────────────────────────────────────────────── */

test('a manhã nunca abre com uma acusação', () => {
  const frase = headline({
    decisions: [d(), d({ id: '2' }), d({ id: '3' })],
    prepared: { ...EMPTY_PREPARED, brandsFound: 8 },
    gaps: [],
    minutes: 4,
  });
  assert.equal(frase, '3 coisas precisam de você — cerca de 4 minutos.');
  assert.equal(/atras|fora de prazo|vencid/i.test(frase), false);
});

test('sem decisões, a frase diz que está tratado', () => {
  const frase = headline({
    decisions: [],
    prepared: { ...EMPTY_PREPARED, threadsOrganized: 9 },
    gaps: [],
    minutes: 1,
  });
  assert.ok(frase.includes('tratada'));
});

test('sem decisões e sem trabalho feito, diz-se isso e não outra coisa', () => {
  const frase = headline({ decisions: [], prepared: EMPTY_PREPARED, gaps: [{ area: 'x', message: 'y' }], minutes: 1 });
  assert.ok(frase.includes('Não consegui preparar'));
});

test('uma decisão só está no singular', () => {
  const frase = headline({ decisions: [d()], prepared: EMPTY_PREPARED, gaps: [], minutes: 1 });
  assert.equal(frase, 'Uma coisa precisa de você — cerca de 1 minuto.');
});

test('a frase de fecho diz o que continua sem ela', () => {
  const frase = closingLine({ waitingOnBrands: 8, recordingsToday: 1, brandsTomorrow: 8 });
  assert.ok(frase.startsWith('Pronto.'));
  assert.ok(frase.includes('8 marcas'));
  assert.ok(frase.includes('amanhã procuro mais 8 marcas'));
});

/* ── A regra que impede a manhã de virar uma lista ────────────────────────── */

test('doze tendências não viram doze cartões', () => {
  const bom = researchDidNotBecomeTasks({
    trendsFound: 12,
    referencesFound: 21,
    decisions: [d({ kind: 'content' }), d({ id: '2', kind: 'content' })],
  });
  assert.equal(bom.ok, true);

  // Três cabem: Instagram, TikTok e o Reels Test feito com o que já existe.
  const tres = researchDidNotBecomeTasks({
    trendsFound: 12,
    referencesFound: 21,
    decisions: Array.from({ length: 3 }, (_, i) => d({ id: String(i), kind: 'content' })),
  });
  assert.equal(tres.ok, true);

  const mau = researchDidNotBecomeTasks({
    trendsFound: 12,
    referencesFound: 21,
    decisions: Array.from({ length: 12 }, (_, i) => d({ id: String(i), kind: 'content' })),
  });
  assert.equal(mau.ok, false);
  assert.ok(mau.because.includes('virou lista'));
});
