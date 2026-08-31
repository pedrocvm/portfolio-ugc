import assert from 'node:assert/strict';
import test from 'node:test';
import { isOpen, reduceStage, violations, type Stage } from './domain.ts';

const signal = (over: Partial<Parameters<typeof reduceStage>[1]> = {}) => ({
  eventType: 'reply.received',
  ...over,
});

test('uma abordagem enviada move de descoberta para abordada', () => {
  const t = reduceStage('discovered', signal({ eventType: 'outreach.sent' }));
  assert.equal(t?.to, 'outreach');
  assert.equal(t?.autoApplicable, true);
});

test('uma abordagem enviada não recua uma oportunidade já em negociação', () => {
  assert.equal(reduceStage('negotiation', signal({ eventType: 'outreach.sent' })), null);
});

test('um pedido de preço leva a qualificação comercial', () => {
  const t = reduceStage('outreach', signal({ replyTypes: ['rate_request'] }));
  assert.equal(t?.to, 'commercial_qualification');
  assert.match(t!.reason, /rate_request/);
});

test('um pedido de direitos para anúncios também leva a qualificação comercial', () => {
  const t = reduceStage('replied', signal({ replyTypes: ['ads_rights'] }));
  assert.equal(t?.to, 'commercial_qualification');
});

test('um pedido comercial não faz recuar uma proposta já enviada', () => {
  assert.equal(reduceStage('proposal', signal({ replyTypes: ['rate_request'] })), null);
});

test('entusiasmo não é aceitação: só aceitação explícita fecha', () => {
  assert.equal(reduceStage('negotiation', signal({ replyTypes: ['interest'] })), null);

  const t = reduceStage('negotiation', signal({ explicitAcceptance: true }));
  assert.equal(t?.to, 'won');
});

test('fechar nunca é automático, mesmo com aceitação explícita', () => {
  const t = reduceStage('negotiation', signal({ explicitAcceptance: true }));
  assert.equal(t?.autoApplicable, false);
});

test('«agora não» é nurture, não perda', () => {
  const t = reduceStage('replied', signal({ explicitRejection: true, deferral: true }));
  assert.equal(t?.to, 'nurture');
  assert.equal(t?.autoApplicable, true);
});

test('uma recusa sem adiamento é perda, e precisa de pessoa', () => {
  const t = reduceStage('proposal', signal({ explicitRejection: true, rejectionReason: 'Sem orçamento.' }));
  assert.equal(t?.to, 'lost');
  assert.equal(t?.autoApplicable, false);
  assert.equal(t?.reason, 'Sem orçamento.');
});

test('silêncio sozinho nunca produz transição', () => {
  for (const stage of ['outreach', 'replied', 'proposal', 'negotiation'] as Stage[]) {
    assert.equal(reduceStage(stage, signal({ eventType: 'followup.sent' })), null);
  }
});

test('uma oportunidade fechada não reage a novas mensagens', () => {
  assert.equal(reduceStage('won', signal({ replyTypes: ['rate_request'] })), null);
  assert.equal(reduceStage('lost', signal({ replyTypes: ['interest'] })), null);
});

test('uma contraproposta abre negociação', () => {
  const t = reduceStage('proposal', signal({ eventType: 'negotiation.counteroffer' }));
  assert.equal(t?.to, 'negotiation');
});

test('perdida sem motivo é uma violação de invariante', () => {
  const problems = violations({
    stage: 'lost',
    wonAt: null,
    lostAt: '2026-08-30T00:00:00Z',
    lossReason: null,
    nextActionText: '',
    nextActionDueAt: null,
    waitingUntil: null,
  });
  assert.ok(problems.some((p) => p.includes('motivo')));
});

test('fechada sem data de aceitação é uma violação de invariante', () => {
  const problems = violations({
    stage: 'won',
    wonAt: null,
    lostAt: null,
    lossReason: null,
    nextActionText: 'x',
    nextActionDueAt: null,
    waitingUntil: null,
  });
  assert.ok(problems.some((p) => p.includes('aceitação')));
});

test('uma oportunidade ativa sem próxima ação nem espera é uma violação', () => {
  const problems = violations({
    stage: 'negotiation',
    wonAt: null,
    lostAt: null,
    lossReason: null,
    nextActionText: '   ',
    nextActionDueAt: null,
    waitingUntil: null,
  });
  assert.ok(problems.some((p) => p.includes('próxima ação')));
});

test('uma espera explícita satisfaz o invariante da próxima ação', () => {
  const problems = violations({
    stage: 'negotiation',
    wonAt: null,
    lostAt: null,
    lossReason: null,
    nextActionText: '',
    nextActionDueAt: null,
    waitingUntil: '2026-09-15T00:00:00Z',
  });
  assert.deepEqual(problems, []);
});

test('nurture e as etapas fechadas não contam como abertas', () => {
  assert.equal(isOpen('nurture'), false);
  assert.equal(isOpen('won'), false);
  assert.equal(isOpen('lost'), false);
  assert.equal(isOpen('replied'), true);
});
