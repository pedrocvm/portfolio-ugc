import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPercent, parseMoneyToCents } from '../../lib/money.ts';
import { calculateQuote, checkFloor } from './engine.ts';

/** A política real que está gravada em v1-draft: quase tudo por decidir. */
const DRAFT = {
  base: { single_video_cents: null, unresolved_reason: 'Ainda não há tabela.' },
  paid_usage: { model: 'percent_of_base' as const, terms: { '30d': null, '3m': null, '6m': null, '12m': null } },
  minimum_project_floor_cents: null,
  buyout_perpetual: { allowed: false, reason: 'Nunca por omissão.' },
};

/** Uma política hipotética já preenchida, para provar que o motor calcula
 *  quando tem com quê. Os números são de teste, não política da Carol. */
const FILLED = {
  base: { single_video_cents: 13000 },
  paid_usage: { model: 'percent_of_base' as const, terms: { '30d': 40, '3m': 50, '6m': 70, '12m': 100 } },
  minimum_project_floor_cents: 10000,
  raw_footage: { percent_of_base: 30 },
  whitelisting: { percent_of_base: 50 },
  exclusivity: { percent_of_base: 70 },
  rush: { percent_of_base: 25 },
  extra_hook_cents: 2500,
};

test('dinheiro em cêntimos: percentagem arredonda ao cêntimo', () => {
  assert.equal(applyPercent(13000, 50), 6500);
  assert.equal(applyPercent(13000, 70), 9100);
  assert.equal(applyPercent(333, 33), 110);
});

test('parseMoneyToCents distingue milhares de decimais', () => {
  assert.equal(parseMoneyToCents('1.250,50'), 125050);
  assert.equal(parseMoneyToCents('1250.50'), 125050);
  assert.equal(parseMoneyToCents('1.500'), 150000);
  assert.equal(parseMoneyToCents('130'), 13000);
  assert.equal(parseMoneyToCents('sem número'), null);
});

test('sem valor base configurado, o motor não inventa nada', () => {
  const q = calculateQuote(DRAFT, { videos: 1 }, 'v1-draft');
  assert.equal(q.recommendedCents, null);
  assert.equal(q.complete, false);
  assert.ok(q.unresolved.some((u) => u.key === 'base'));
});

test('nunca generaliza a negociação AllMatters como tabela', () => {
  const q = calculateQuote(DRAFT, { videos: 1, paidUsage: true, usageTerm: '3m' }, 'v1-draft');
  // 130 € base + 50% existe no histórico, mas a política não o autoriza.
  assert.equal(q.recommendedCents, null);
  assert.ok(q.unresolved.some((u) => u.key === 'base'));
  assert.ok(q.unresolved.some((u) => u.key === 'usage_rate'));
});

test('«ads rights» sem período bloqueia o preço e gera a pergunta', () => {
  const q = calculateQuote(FILLED, { videos: 1, paidUsage: true, usageTerm: null }, 'test');
  assert.equal(q.recommendedCents, null);
  assert.ok(q.unresolved.some((u) => u.key === 'usage_term'));
  assert.ok(q.blockingQuestions.some((s) => /quanto tempo/i.test(s)));
});

test('com período e plataformas, o uso pago calcula sobre a produção', () => {
  const q = calculateQuote(
    FILLED,
    { videos: 1, paidUsage: true, usageTerm: '3m', platforms: ['Meta'], territories: ['PT'] },
    'test',
  );
  assert.equal(q.baseCents, 13000);
  assert.equal(q.recommendedCents, 19500); // 130 + 65
  assert.equal(q.complete, true);
});

test('seis meses a 70% dá o total correcto', () => {
  const q = calculateQuote(
    FILLED,
    { videos: 1, paidUsage: true, usageTerm: '6m', platforms: ['Meta'], territories: ['PT'] },
    'test',
  );
  assert.equal(q.recommendedCents, 22100); // 130 + 91
});

test('vários vídeos multiplicam a produção', () => {
  const q = calculateQuote(FILLED, { videos: 3 }, 'test');
  assert.equal(q.baseCents, 39000);
  assert.equal(q.recommendedCents, 39000);
});

test('perpetuidade nunca tem preço: fica por resolver e é decisão humana', () => {
  const q = calculateQuote(FILLED, { videos: 1, perpetual: true }, 'test');
  assert.equal(q.recommendedCents, null);
  assert.ok(q.unresolved.some((u) => u.key === 'perpetual'));
  assert.ok(q.humanOnly.some((s) => /perpétuo|buyout/i.test(s)));
});

test('whitelisting e exclusividade entram como decisão humana', () => {
  const q = calculateQuote(FILLED, { videos: 1, whitelisting: true, exclusivity: true }, 'test');
  assert.equal(q.humanOnly.length, 2);
  // Com regra configurada os valores existem, mas continuam a exigir pessoa.
  assert.equal(q.recommendedCents, 13000 + 6500 + 9100);
});

test('ficheiros em bruto são item separado, nunca incluídos', () => {
  const semRaw = calculateQuote(FILLED, { videos: 1 }, 'test');
  const comRaw = calculateQuote(FILLED, { videos: 1, rawFootage: true }, 'test');
  assert.equal(comRaw.recommendedCents! - semRaw.recommendedCents!, 3900);
  assert.ok(comRaw.humanOnly.some((s) => /bruto/i.test(s)));
});

test('hooks adicionais somam ao valor unitário configurado', () => {
  const q = calculateQuote(FILLED, { videos: 1, extraHooks: 2 }, 'test');
  assert.equal(q.recommendedCents, 13000 + 5000);
});

test('cada linha diz de onde veio o valor', () => {
  const q = calculateQuote(FILLED, { videos: 1, paidUsage: true, usageTerm: '3m', platforms: ['Meta'] }, 'test');
  for (const line of q.lines) assert.ok(line.basis.length > 0, `linha ${line.id} sem justificação`);
});

test('sem piso configurado, o motor diz que não consegue validar', () => {
  const check = checkFloor(5000, null);
  assert.equal(check.belowFloor, false);
  assert.match(check.warning!, /piso/i);
});

test('abaixo do piso é assinalado', () => {
  assert.equal(checkFloor(5000, 10000).belowFloor, true);
  assert.equal(checkFloor(10000, 10000).belowFloor, false);
});

test('a versão da política viaja com o orçamento', () => {
  assert.equal(calculateQuote(FILLED, { videos: 1 }, 'v2-active').policyVersion, 'v2-active');
});
