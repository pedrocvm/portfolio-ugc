import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyBrief, type BriefInput } from './brief.ts';

const input = (over: Partial<BriefInput> = {}): BriefInput => ({
  queued: 0,
  overdue: 0,
  openOpportunities: 0,
  needsReview: 0,
  head: [],
  gmailConnected: true,
  ...over,
});

test('fila vazia com oportunidades explica o silêncio em vez de mostrar um zero', () => {
  const s = dailyBrief(input({ openOpportunities: 13 }));
  assert.match(s, /Nada à sua espera hoje/);
  assert.match(s, /13 conversas em aberto/);
});

test('uma só oportunidade não é «1 conversas»', () => {
  const s = dailyBrief(input({ openOpportunities: 1 }));
  assert.match(s, /a conversa em aberto/);
  assert.doesNotMatch(s, /1 conversas/);
});

test('com fila, diz quantas e por onde começar', () => {
  const s = dailyBrief(
    input({ queued: 4, overdue: 2, head: [{ brandName: 'Cecotec', overdueDays: 3 }] }),
  );
  assert.match(s, /Há 4 coisas para hoje, 2 já fora de prazo\./);
  assert.match(s, /A mais antiga é a Cecotec, que passou do prazo há 3 dias\./);
});

test('tudo fora de prazo não se lê «4 de 4»', () => {
  const s = dailyBrief(input({ queued: 4, overdue: 4 }));
  assert.match(s, /já passaram todas do prazo/);
  assert.doesNotMatch(s, /4 já fora de prazo/);
});

test('uma coisa no singular, e um dia no singular', () => {
  const s = dailyBrief(
    input({ queued: 1, overdue: 1, head: [{ brandName: 'Tempur', overdueDays: 1 }] }),
  );
  assert.match(s, /Há 1 coisa para hoje/);
  assert.match(s, /há 1 dia\./);
});

test('sem atraso, a marca é nomeada sem inventar uma espera', () => {
  const s = dailyBrief(input({ queued: 2, head: [{ brandName: 'Xiaomi', overdueDays: null }] }));
  assert.match(s, /A primeira é a Xiaomi\./);
  assert.doesNotMatch(s, /prazo/);
});

test('por triar entra como frase, não como contador', () => {
  assert.match(dailyBrief(input({ needsReview: 1 })), /uma mensagem por triar/);
  assert.match(dailyBrief(input({ needsReview: 5 })), /5 mensagens por triar/);
});

test('uma só coisa, e atrasada, não diz «passaram todas»', () => {
  const s = dailyBrief(input({ queued: 1, overdue: 1 }));
  assert.match(s, /Há 1 coisa para hoje, e já passou do prazo\./);
  assert.doesNotMatch(s, /passaram todas/);
});

/** Nem «tens» nem «você»: a frase não tem sujeito. A segunda pessoa obrigava a
 *  escolher entre tratar por tu e tratar por você, e as duas escolhas soam a
 *  software a tentar ter personalidade. */
test('nada em lado nenhum fala em segunda pessoa, europeia ou brasileira', () => {
  const casos = [
    input(),
    input({ openOpportunities: 5 }),
    input({ queued: 3, overdue: 1, head: [{ brandName: 'X', overdueDays: 2 }] }),
    input({ needsReview: 2, gmailConnected: false }),
  ];
  for (const c of casos) {
    const s = dailyBrief(c);
    assert.doesNotMatch(s, /\btens\b|\bpodes\b|\bteu\b|\btua\b|\bde ti\b/i, s);
    assert.doesNotMatch(s, /\bvocê\b|\besperando\b|\bcomece\b/i, s);
  }
});

test('sem Gmail ligado, o silêncio é explicado', () => {
  const s = dailyBrief(input({ gmailConnected: false }));
  assert.match(s, /O Gmail ainda não está ligado/);
});

test('com Gmail ligado, não se fala do Gmail', () => {
  assert.doesNotMatch(dailyBrief(input({ queued: 3 })), /Gmail/);
});
