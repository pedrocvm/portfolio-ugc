import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInsights, type InsightInput } from './insights.ts';

const NOW = new Date('2026-09-01T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();
const ahead = (d: number) => new Date(NOW.getTime() + d * 86400000).toISOString();

const input = (over: Partial<InsightInput> = {}): InsightInput => ({
  now: NOW, opportunities: [], followUps: [], rights: [], payments: [], delivered: [], ...over,
});

const opp = (over = {}) => ({
  id: 'o1', brandId: 'b1', brandName: 'Cecotec', stage: 'negotiation',
  lastActivityAt: ago(10), waitingUntil: null, expectedCashCents: null, ...over,
});

test('sem nada a arder, não há avisos', () => {
  assert.deepEqual(buildInsights(input()), []);
});

test('uma negociação parada há mais de uma semana aparece', () => {
  const [i] = buildInsights(input({ opportunities: [opp()] }));
  assert.equal(i.kind, 'opportunity_stale');
  assert.match(i.title, /Cecotec está parada há 10 dias/);
});

test('uma descoberta parada não é notícia', () => {
  assert.deepEqual(buildInsights(input({ opportunities: [opp({ stage: 'discovered' })] })), []);
});

test('uma espera combinada não é abandono', () => {
  const parada = buildInsights(input({ opportunities: [opp({ waitingUntil: ahead(5) })] }));
  assert.deepEqual(parada, []);
});

test('uma espera que já passou volta a contar', () => {
  const r = buildInsights(input({ opportunities: [opp({ waitingUntil: ago(2) })] }));
  assert.equal(r.length, 1);
});

test('três semanas paradas é urgente, não é aviso', () => {
  const [i] = buildInsights(input({ opportunities: [opp({ lastActivityAt: ago(25) })] }));
  assert.equal(i.severity, 'urgent');
});

test('a chave de deduplicação muda de semana a semana, não de dia a dia', () => {
  const a = buildInsights(input({ opportunities: [opp({ lastActivityAt: ago(8) })] }))[0];
  const b = buildInsights(input({ opportunities: [opp({ lastActivityAt: ago(9) })] }))[0];
  const c = buildInsights(input({ opportunities: [opp({ lastActivityAt: ago(15) })] }))[0];
  assert.equal(a.dedupeKey, b.dedupeKey, 'dois dias seguidos não podem gerar dois avisos');
  assert.notEqual(a.dedupeKey, c.dedupeKey, 'uma semana depois volta a valer a pena avisar');
});

test('follow-ups vencidos juntam-se num aviso só', () => {
  const r = buildInsights(input({
    followUps: [
      { id: 'f1', brandName: 'A', dueAt: ago(1), opportunityId: null },
      { id: 'f2', brandName: 'B', dueAt: ago(2), opportunityId: null },
    ],
  }));
  assert.equal(r.length, 1);
  assert.match(r[0].title, /2 marcas/);
});

test('um follow-up ainda por vencer não avisa', () => {
  const r = buildInsights(input({
    followUps: [{ id: 'f1', brandName: 'A', dueAt: ahead(2), opportunityId: null }],
  }));
  assert.deepEqual(r, []);
});

test('uma licença a acabar dentro de uma semana é urgente', () => {
  const [i] = buildInsights(input({
    rights: [{ id: 'r1', brandName: 'AllMatters', endAt: ahead(5), opportunityId: 'o9' }],
  }));
  assert.equal(i.severity, 'urgent');
  assert.match(i.title, /acaba em 5 dias/);
});

test('uma licença que já expirou não volta a avisar', () => {
  const r = buildInsights(input({
    rights: [{ id: 'r1', brandName: 'X', endAt: ago(3), opportunityId: null }],
  }));
  assert.deepEqual(r, []);
});

test('dinheiro por receber conta os dias e o valor', () => {
  const [i] = buildInsights(input({
    payments: [{ id: 'p1', brandName: 'Tempur', amountCents: 19500, dueAt: ago(20) }],
  }));
  assert.equal(i.severity, 'urgent');
  assert.match(i.title, /195€ por receber há 20 dias/);
});

test('a janela de upsell abre a uma semana e fecha a mês e meio', () => {
  const cedo = buildInsights(input({ delivered: [{ id: 'c1', brandName: 'X', deliveredAt: ago(3), brandId: 'b' }] }));
  const certo = buildInsights(input({ delivered: [{ id: 'c1', brandName: 'X', deliveredAt: ago(10), brandId: 'b' }] }));
  const tarde = buildInsights(input({ delivered: [{ id: 'c1', brandName: 'X', deliveredAt: ago(60), brandId: 'b' }] }));
  assert.deepEqual(cedo, []);
  assert.equal(certo.length, 1);
  assert.deepEqual(tarde, []);
});

test('o pior vem primeiro', () => {
  const r = buildInsights(input({
    opportunities: [opp({ lastActivityAt: ago(25) })],
    delivered: [{ id: 'c1', brandName: 'X', deliveredAt: ago(10), brandId: 'b' }],
  }));
  assert.equal(r[0].severity, 'urgent');
  assert.equal(r[r.length - 1].severity, 'info');
});

test('nunca mais do que doze: um painel de avisos infinito não se lê', () => {
  const many = Array.from({ length: 30 }, (_, i) => opp({ id: `o${i}`, lastActivityAt: ago(30) }));
  assert.equal(buildInsights(input({ opportunities: many })).length, 12);
});
