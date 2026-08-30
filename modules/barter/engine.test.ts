import assert from 'node:assert/strict';
import test from 'node:test';
import { decideBarter, type BarterInput } from './engine.ts';

const noRights = { paidUsage: false, whitelisting: false, exclusivity: false, rawFootage: false };

const input = (over: Partial<BarterInput> = {}): BarterInput => ({
  retailPriceCents: 5000,
  valueToCarolCents: null,
  wouldBuy: null,
  productInterest: 3,
  productionEffort: 3,
  strategicValue: 3,
  portfolioValue: 3,
  rightsRequested: noRights,
  cashAlternativeCents: 13000,
  ...over,
});

test('MSRP alto não torna a permuta atraente se ela nunca compraria', () => {
  const caro = decideBarter(input({ retailPriceCents: 40000, wouldBuy: false, productInterest: 0 }));
  assert.notEqual(caro.decision, 'ACCEPT_BARTER');
  // 400 € de etiqueta valem 80 € para quem não quer o produto.
  assert.ok(caro.effectiveValueCents < 40000);
});

test('um produto desejado e de valor real cobre o trabalho', () => {
  const bom = decideBarter(
    input({ retailPriceCents: 30000, wouldBuy: true, productInterest: 5, productionEffort: 2, strategicValue: 4 }),
  );
  assert.equal(bom.decision, 'ACCEPT_BARTER');
});

test('o caso NOVOTECK: produto barato, permuta não compensa', () => {
  // Pau de selfie + power bank, abaixo de 50 € para a marca.
  const novoteck = decideBarter(
    input({ retailPriceCents: 4000, wouldBuy: false, productInterest: 1, productionEffort: 3 }),
  );
  assert.ok(['ASK_FOR_CASH', 'DECLINE'].includes(novoteck.decision));
});

test('exclusividade por produto passa sempre a pedido de dinheiro', () => {
  const r = decideBarter(
    input({
      retailPriceCents: 100000,
      wouldBuy: true,
      productInterest: 5,
      rightsRequested: { ...noRights, exclusivity: true },
    }),
  );
  assert.equal(r.decision, 'ASK_FOR_CASH');
  assert.ok(r.reasons.some((x) => /exclusividade|whitelisting/i.test(x)));
});

test('whitelisting por produto também', () => {
  const r = decideBarter(input({ rightsRequested: { ...noRights, whitelisting: true } }));
  assert.equal(r.decision, 'ASK_FOR_CASH');
});

test('valor a meio caminho recomenda produto mais dinheiro', () => {
  const r = decideBarter(
    input({
      retailPriceCents: 9000,
      wouldBuy: true,
      productInterest: 4,
      productionEffort: 4,
      strategicValue: 1,
      portfolioValue: 1,
      cashAlternativeCents: 20000,
    }),
  );
  assert.equal(r.decision, 'HYBRID');
  assert.ok(r.reasons.some((x) => /metade|diferença/i.test(x)));
});

test('produto sem interesse e marca sem potencial: recusar', () => {
  const r = decideBarter(
    input({
      retailPriceCents: 2000,
      wouldBuy: false,
      productInterest: 0,
      productionEffort: 5,
      strategicValue: 1,
      portfolioValue: 0,
    }),
  );
  assert.equal(r.decision, 'DECLINE');
});

test('dados a menos pedem informação em vez de decidir', () => {
  const r = decideBarter(
    input({ retailPriceCents: null, valueToCarolCents: null, wouldBuy: null, productInterest: null, productionEffort: null }),
  );
  assert.equal(r.decision, 'ASK_INFO');
  assert.ok(r.missing.length >= 2);
});

test('sem política de preço não há régua económica, e isso é dito', () => {
  const r = decideBarter(input({ cashAlternativeCents: null }));
  assert.equal(r.estimatedCostCents, null);
  assert.ok(r.missing.some((m) => /trabalho pago|política/i.test(m)));
});

test('sem tabela, produto desejado e marca forte ainda assim aceita', () => {
  const r = decideBarter(input({ cashAlternativeCents: null, wouldBuy: true, strategicValue: 5 }));
  assert.equal(r.decision, 'ACCEPT_BARTER');
});

test('valor de produto nunca conta como receita em dinheiro', () => {
  for (const r of [
    decideBarter(input({ wouldBuy: true })),
    decideBarter(input({ wouldBuy: false })),
    decideBarter(input({ cashAlternativeCents: null })),
  ]) {
    assert.equal(r.countsAsCashRevenue, false);
  }
});

test('esforço pesado é sempre mencionado na justificação', () => {
  const r = decideBarter(input({ productionEffort: 5 }));
  assert.ok(r.reasons.some((x) => /agenda|pesada/i.test(x)));
});

test('a decisão vem sempre com razões', () => {
  for (const r of [
    decideBarter(input({ wouldBuy: true, productInterest: 5 })),
    decideBarter(input({ wouldBuy: false, productInterest: 0 })),
    decideBarter(input({ rightsRequested: { ...noRights, exclusivity: true } })),
  ]) {
    assert.ok(r.reasons.length > 0, `decisão ${r.decision} sem razões`);
  }
});
