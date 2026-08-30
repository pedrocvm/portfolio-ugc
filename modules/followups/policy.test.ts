import assert from 'node:assert/strict';
import test from 'node:test';
import { addBusinessDays, isBusinessDay, localDay, nextBusinessDay } from '../../lib/time.ts';
import {
  cancelsPendingFollowUp, scheduleFollowUp, situationFor, NURTURE_DAYS,
} from './policy.ts';

/* Segunda-feira, 31 de Agosto de 2026, meio-dia UTC. */
const MONDAY = new Date('2026-08-31T12:00:00Z');

test('dias úteis saltam o fim de semana', () => {
  // Sexta 2026-09-04 + 1 dia útil = segunda 2026-09-07
  assert.equal(localDay(addBusinessDays(new Date('2026-09-04T12:00:00Z'), 1)), '2026-09-07');
});

test('três dias úteis a partir de segunda caem na quinta', () => {
  assert.equal(localDay(addBusinessDays(MONDAY, 3)), '2026-09-03');
});

test('cinco dias úteis a partir de quinta atravessam o fim de semana', () => {
  assert.equal(localDay(addBusinessDays(new Date('2026-09-03T12:00:00Z'), 5)), '2026-09-10');
});

test('sábado e domingo não são dias úteis', () => {
  assert.equal(isBusinessDay(new Date('2026-09-05T12:00:00Z')), false);
  assert.equal(isBusinessDay(new Date('2026-09-06T12:00:00Z')), false);
  assert.equal(isBusinessDay(new Date('2026-09-07T12:00:00Z')), true);
});

test('nextBusinessDay empurra sábado para segunda e deixa segunda quieta', () => {
  assert.equal(localDay(nextBusinessDay(new Date('2026-09-05T12:00:00Z'))), '2026-09-07');
  assert.equal(localDay(nextBusinessDay(MONDAY)), '2026-08-31');
});

test('primeiro follow-up de abordagem fria: 3 dias úteis', () => {
  const plan = scheduleFollowUp({ situation: 'cold_outreach', since: MONDAY, sentCount: 0 });
  assert.equal(plan.kind, 'followup');
  assert.equal(plan.kind === 'followup' && plan.sequenceIndex, 1);
  assert.equal(localDay(new Date((plan as { dueAt: string }).dueAt)), '2026-09-03');
});

test('segundo follow-up de abordagem fria: mais 5 dias úteis', () => {
  const plan = scheduleFollowUp({ situation: 'cold_outreach', since: MONDAY, sentCount: 1 });
  assert.equal(plan.kind === 'followup' && plan.sequenceIndex, 2);
  assert.equal(localDay(new Date((plan as { dueAt: string }).dueAt)), '2026-09-07');
});

test('a sequência activa acaba: o terceiro vira nurture, não terceiro lembrete', () => {
  const plan = scheduleFollowUp({ situation: 'cold_outreach', since: MONDAY, sentCount: 2 });
  assert.equal(plan.kind, 'nurture');
  assert.match((plan as { reason: string }).reason, /ruído|esgotada/i);
});

test('material pedido usa a cadência curta de 2 dias úteis', () => {
  const plan = scheduleFollowUp({ situation: 'material_requested', since: MONDAY, sentCount: 0 });
  assert.equal(localDay(new Date((plan as { dueAt: string }).dueAt)), '2026-09-02');
});

test('depois de proposta a cadência é 2 dias úteis', () => {
  const plan = scheduleFollowUp({ situation: 'after_call_or_proposal', since: MONDAY, sentCount: 0 });
  assert.equal(localDay(new Date((plan as { dueAt: string }).dueAt)), '2026-09-02');
});

test('a data prometida pela marca manda sobre a cadência genérica', () => {
  const promised = new Date('2026-09-11T12:00:00Z'); // sexta
  const plan = scheduleFollowUp({
    situation: 'cold_outreach',
    since: MONDAY,
    sentCount: 0,
    promisedAt: promised,
  });
  assert.equal(plan.kind === 'followup' && plan.situation, 'promised_date');
  // dia útil seguinte à promessa: segunda 14
  assert.equal(localDay(new Date((plan as { dueAt: string }).dueAt)), '2026-09-14');
});

test('uma espera explícita futura suspende qualquer agendamento', () => {
  const plan = scheduleFollowUp({
    situation: 'cold_outreach',
    since: MONDAY,
    sentCount: 0,
    waitingUntil: new Date(Date.now() + 30 * 86400000),
  });
  assert.equal(plan.kind, 'none');
});

test('uma espera já passada não bloqueia o agendamento', () => {
  const plan = scheduleFollowUp({
    situation: 'cold_outreach',
    since: MONDAY,
    sentCount: 0,
    waitingUntil: new Date(Date.now() - 86400000),
  });
  assert.equal(plan.kind, 'followup');
});

test('nurture cai a 45 dias e sempre num dia útil', () => {
  const plan = scheduleFollowUp({ situation: 'nurture', since: MONDAY, sentCount: 0 });
  assert.equal(plan.kind, 'nurture');
  assert.equal(NURTURE_DAYS, 45);
  assert.equal(isBusinessDay(new Date((plan as { dueAt: string }).dueAt)), true);
});

test('uma resposta da marca cancela o follow-up pendente', () => {
  assert.equal(cancelsPendingFollowUp('reply.received'), true);
  assert.equal(cancelsPendingFollowUp('opportunity.won'), true);
  assert.equal(cancelsPendingFollowUp('outreach.sent'), false);
});

test('só alguns eventos justificam agendar', () => {
  assert.equal(situationFor('outreach.sent'), 'cold_outreach');
  assert.equal(situationFor('portfolio.requested'), 'material_requested');
  assert.equal(situationFor('proposal.sent'), 'after_call_or_proposal');
  assert.equal(situationFor('promise.recorded'), 'promised_date');
  assert.equal(situationFor('payment.received'), null);
});

test('um follow-up nunca é agendado para fim de semana', () => {
  // Quarta + 2 dias úteis = sexta; quinta + 2 = segunda. Nenhum cai a sábado.
  for (let d = 31; d <= 40; d++) {
    const since = new Date(Date.UTC(2026, 7, d, 12));
    const plan = scheduleFollowUp({ situation: 'material_requested', since, sentCount: 0 });
    if (plan.kind !== 'followup') continue;
    assert.equal(isBusinessDay(new Date(plan.dueAt)), true, `falhou para ${since.toISOString()}`);
  }
});
