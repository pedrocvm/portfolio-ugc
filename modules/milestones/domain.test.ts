import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveMilestones, isFreshMilestone, type MilestoneInput } from './domain';

const NOW = new Date('2026-09-02T00:00:00Z');

const base: MilestoneInput = { payments: [], events: [], homeCountry: 'PT' };

test('sem fatos não nascem marcos', () => {
  assert.deepEqual(deriveMilestones(base), []);
});

test('o primeiro cliente pago sai do primeiro pagamento em dinheiro', () => {
  const marcos = deriveMilestones({
    ...base,
    payments: [
      {
        id: 'p1', brandId: 'b1', brandName: 'Cecotec', brandCountry: 'PT',
        kind: 'cash', amountCents: 34000, currency: 'EUR', receivedAt: '2026-08-10T00:00:00Z',
      },
    ],
  });
  const pago = marcos.find((m) => m.kind === 'first_paid_client');
  assert.ok(pago);
  assert.equal(pago.brandName, 'Cecotec');
  assert.equal(pago.evidence[0].id, 'p1');
});

test('permuta não é receita, por isso não faz um primeiro cliente pago', () => {
  const marcos = deriveMilestones({
    ...base,
    payments: [
      {
        id: 'p1', brandId: 'b1', brandName: 'Barral', brandCountry: 'PT',
        kind: 'barter', amountCents: 20000, currency: 'EUR', receivedAt: '2026-07-01T00:00:00Z',
      },
    ],
  });
  assert.equal(
    marcos.some((m) => m.kind === 'first_paid_client'),
    false,
  );
});

test('um pagamento por receber ainda não é um marco', () => {
  const marcos = deriveMilestones({
    ...base,
    payments: [
      {
        id: 'p1', brandId: 'b1', brandName: 'Govee', brandCountry: 'PT',
        kind: 'cash', amountCents: 50000, currency: 'EUR', receivedAt: null,
      },
    ],
  });
  assert.deepEqual(marcos, []);
});

test('o primeiro cliente de fora é relativo ao país de casa', () => {
  const marcos = deriveMilestones({
    ...base,
    payments: [
      { id: 'p1', brandId: 'b1', brandName: 'Cecotec', brandCountry: 'PT', kind: 'cash', amountCents: 20000, currency: 'EUR', receivedAt: '2026-07-01T00:00:00Z' },
      { id: 'p2', brandId: 'b2', brandName: 'UGREEN', brandCountry: 'CN', kind: 'cash', amountCents: 40000, currency: 'EUR', receivedAt: '2026-08-01T00:00:00Z' },
    ],
  });
  const fora = marcos.find((m) => m.kind === 'first_international_client');
  assert.equal(fora?.brandName, 'UGREEN');
});

test('duas entradas da mesma marca são recorrência; uma não', () => {
  const uma = deriveMilestones({
    ...base,
    payments: [
      { id: 'p1', brandId: 'b1', brandName: 'Cecotec', brandCountry: 'PT', kind: 'cash', amountCents: 20000, currency: 'EUR', receivedAt: '2026-07-01T00:00:00Z' },
    ],
  });
  assert.equal(uma.some((m) => m.kind === 'first_recurring_client'), false);

  const duas = deriveMilestones({
    ...base,
    payments: [
      { id: 'p1', brandId: 'b1', brandName: 'Cecotec', brandCountry: 'PT', kind: 'cash', amountCents: 20000, currency: 'EUR', receivedAt: '2026-07-01T00:00:00Z' },
      { id: 'p2', brandId: 'b1', brandName: 'Cecotec', brandCountry: 'PT', kind: 'cash', amountCents: 30000, currency: 'EUR', receivedAt: '2026-08-15T00:00:00Z' },
    ],
  });
  const recorrente = duas.find((m) => m.kind === 'first_recurring_client');
  assert.equal(recorrente?.brandName, 'Cecotec');
  assert.equal(recorrente?.evidence.length, 2);
});

test('o patamar de faturação dispara na travessia, não em cada pagamento', () => {
  const marcos = deriveMilestones({
    ...base,
    payments: [
      { id: 'p1', brandId: 'b1', brandName: 'A', brandCountry: 'PT', kind: 'cash', amountCents: 30000, currency: 'EUR', receivedAt: '2026-06-01T00:00:00Z' },
      { id: 'p2', brandId: 'b2', brandName: 'B', brandCountry: 'PT', kind: 'cash', amountCents: 30000, currency: 'EUR', receivedAt: '2026-07-01T00:00:00Z' },
      { id: 'p3', brandId: 'b3', brandName: 'C', brandCountry: 'PT', kind: 'cash', amountCents: 30000, currency: 'EUR', receivedAt: '2026-08-01T00:00:00Z' },
    ],
  });
  const patamares = marcos.filter((m) => m.kind === 'revenue_threshold');
  assert.equal(patamares.length, 1);
  assert.equal(patamares[0].dedupeKey, 'revenue_threshold:EUR:50000');
});

test('aprovado sem alterações exige que não tenha havido revisão antes', () => {
  const comRevisao = deriveMilestones({
    ...base,
    events: [
      { id: 'e1', type: 'revision.requested', brandId: 'b1', brandName: 'Cecotec', occurredAt: '2026-08-01T00:00:00Z', summary: '' },
      { id: 'e2', type: 'content.approved', brandId: 'b1', brandName: 'Cecotec', occurredAt: '2026-08-05T00:00:00Z', summary: '' },
    ],
  });
  assert.equal(comRevisao.some((m) => m.kind === 'first_approved_no_revision'), false);

  const semRevisao = deriveMilestones({
    ...base,
    events: [
      { id: 'e2', type: 'content.approved', brandId: 'b1', brandName: 'Cecotec', occurredAt: '2026-08-05T00:00:00Z', summary: '' },
    ],
  });
  assert.equal(semRevisao.some((m) => m.kind === 'first_approved_no_revision'), true);
});

test('uma recusa por preço é um marco à parte da recusa', () => {
  const marcos = deriveMilestones({
    ...base,
    events: [
      {
        id: 'e1', type: 'opportunity.lost', brandId: 'b1', brandName: 'Barral',
        occurredAt: '2026-08-01T00:00:00Z', summary: 'Perdida.',
        payload: { reason: 'O preço estava acima do budget deles.' },
      },
    ],
  });
  assert.ok(marcos.some((m) => m.kind === 'first_rejection'));
  assert.ok(marcos.some((m) => m.kind === 'first_price_rejection'));
});

test('«primeiro» quer dizer o mais antigo', () => {
  const marcos = deriveMilestones({
    ...base,
    events: [
      { id: 'e2', type: 'reply.received', brandId: 'b2', brandName: 'Tarde', occurredAt: '2026-08-20T00:00:00Z', summary: '' },
      { id: 'e1', type: 'reply.received', brandId: 'b1', brandName: 'Cedo', occurredAt: '2026-06-20T00:00:00Z', summary: '' },
    ],
  });
  const primeira = marcos.find((m) => m.kind === 'first_positive_reply');
  assert.equal(primeira?.brandName, 'Cedo');
});

test('cada marco tem prova', () => {
  const marcos = deriveMilestones({
    ...base,
    payments: [
      { id: 'p1', brandId: 'b1', brandName: 'Cecotec', brandCountry: 'PT', kind: 'cash', amountCents: 20000, currency: 'EUR', receivedAt: '2026-07-01T00:00:00Z' },
    ],
    events: [
      { id: 'e1', type: 'product.received', brandId: 'b1', brandName: 'Cecotec', occurredAt: '2026-06-20T00:00:00Z', summary: '' },
    ],
  });
  assert.ok(marcos.length > 0);
  for (const m of marcos) {
    assert.ok(m.evidence.length > 0, `${m.kind} sem prova`);
    assert.ok(m.evidence.every((e) => e.id), `${m.kind} com prova sem id`);
  }
});

test('um marco velho já não é notícia', () => {
  assert.equal(isFreshMilestone({ occurredAt: '2026-08-20T00:00:00Z' }, NOW), true);
  assert.equal(isFreshMilestone({ occurredAt: '2026-01-20T00:00:00Z' }, NOW), false);
});


/* ── A jornada, ampliada pela mentoria ────────────────────────────────────── */

test('o primeiro negócio fechado e a primeira entrega nascem de eventos, com prova', () => {
  const marcos = deriveMilestones({
    homeCountry: 'PT',
    payments: [],
    events: [
      { id: 'e1', type: 'opportunity.won', brandId: 'b1', brandName: 'Cecotec', occurredAt: '2026-08-20T10:00:00Z', summary: 'Fechou.' },
      { id: 'e2', type: 'content.delivered', brandId: 'b1', brandName: 'Cecotec', occurredAt: '2026-08-28T10:00:00Z', summary: 'Entregue.', payload: { language: 'en' } },
    ],
  });
  assert.equal(marcos.find((m) => m.kind === 'first_deal_won')?.evidence[0].id, 'e1');
  assert.equal(marcos.find((m) => m.kind === 'first_delivery')?.evidence[0].id, 'e2');
  assert.equal(marcos.find((m) => m.kind === 'first_english_video')?.brandName, 'Cecotec');
});
