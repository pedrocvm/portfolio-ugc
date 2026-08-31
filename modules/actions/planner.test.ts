import assert from 'node:assert/strict';
import test from 'node:test';
import { planForOpportunity, priorityScore, type OpportunitySnapshot } from './planner.ts';

const NOW = new Date('2026-09-01T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

const snap = (over: Partial<OpportunitySnapshot> = {}): OpportunitySnapshot => ({
  id: 'o1',
  brandId: 'b1',
  brandName: 'Cecotec',
  stage: 'replied',
  productName: 'Conga Windroid',
  fitScore: 80,
  expectedCents: null,
  lastActivityAt: daysAgo(2),
  waitingUntil: null,
  nextActionText: '',
  awaitingReplySince: null,
  openAsks: [],
  riskFlags: [],
  dueFollowUp: null,
  hasQuote: false,
  hasProposalDoc: false,
  ...over,
});

test('uma resposta por responder gera a ação de responder', () => {
  const [action] = planForOpportunity(snap({ awaitingReplySince: daysAgo(1) }), NOW);
  assert.equal(action.type, 'respond');
  assert.equal(action.requiresApproval, true);
});

test('um pedido de preço vira a ação de enviar valor, não uma resposta genérica', () => {
  const [action] = planForOpportunity(
    snap({ awaitingReplySince: daysAgo(1), openAsks: ['rate_request'] }),
    NOW,
  );
  assert.equal(action.type, 'send_rate');
  // A razão nomeia o pedido em português corrente: um id de máquina no meio de
  // uma frase é o sistema a falar consigo próprio à frente de quem o usa.
  assert.match(action.reason, /A marca pediu o seu valor, e ainda não teve resposta\./);
  assert.doesNotMatch(action.reason, /rate_request/);
});

test('vários pedidos ficam numa lista que se lê em voz alta', () => {
  const [action] = planForOpportunity(
    snap({ awaitingReplySince: daysAgo(1), openAsks: ['rate_request', 'ads_rights', 'portfolio_request'] }),
    NOW,
  );
  assert.match(action.reason, /o seu valor, direitos para anúncios e o portfólio/);
});

test('um pedido de portfólio vira a ação de enviar portfólio', () => {
  const [action] = planForOpportunity(
    snap({ awaitingReplySince: daysAgo(1), openAsks: ['portfolio_request'] }),
    NOW,
  );
  assert.equal(action.type, 'send_portfolio');
});

test('direitos para anúncios pedem escopo antes de preço', () => {
  const [action] = planForOpportunity(
    snap({ awaitingReplySince: daysAgo(1), openAsks: ['ads_rights'] }),
    NOW,
  );
  assert.equal(action.type, 'ask_scope');
  assert.match(action.title, /período e canais/i);
});

test('media kit vira reenquadramento do modelo, não envio de métricas', () => {
  const [action] = planForOpportunity(
    snap({ awaitingReplySince: daysAgo(1), openAsks: ['media_kit_request'] }),
    NOW,
  );
  assert.equal(action.type, 'negotiate');
  assert.match(action.title, /UGC para os canais/i);
});

test('afiliação vira reenquadramento explícito', () => {
  const [action] = planForOpportunity(
    snap({ awaitingReplySince: daysAgo(1), openAsks: ['affiliate_offer'] }),
    NOW,
  );
  assert.match(action.title, /não afiliação/i);
});

test('um follow-up vencido entra na fila quando não há resposta por tratar', () => {
  const actions = planForOpportunity(
    snap({ dueFollowUp: { id: 'f1', dueAt: daysAgo(1), reason: 'Cadência.' } }),
    NOW,
  );
  assert.ok(actions.some((a) => a.type === 'follow_up'));
});

test('uma resposta por tratar suprime o follow-up: não se insiste sobre uma resposta', () => {
  const actions = planForOpportunity(
    snap({
      awaitingReplySince: daysAgo(1),
      dueFollowUp: { id: 'f1', dueAt: daysAgo(1), reason: 'Cadência.' },
    }),
    NOW,
  );
  assert.equal(actions.filter((a) => a.type === 'follow_up').length, 0);
});

test('uma espera que já passou aparece como decisão a retomar', () => {
  const actions = planForOpportunity(snap({ waitingUntil: daysAgo(3) }), NOW);
  assert.ok(actions.some((a) => a.type === 'wait_expired'));
});

test('uma espera futura mantém a oportunidade fora da fila', () => {
  const future = new Date(NOW.getTime() + 10 * 86400000).toISOString();
  const actions = planForOpportunity(snap({ waitingUntil: future }), NOW);
  assert.deepEqual(actions, []);
});

test('qualificada sem orçamento pede para preparar a oferta', () => {
  const actions = planForOpportunity(snap({ stage: 'commercial_qualification' }), NOW);
  assert.ok(actions.some((a) => a.type === 'create_proposal'));
});

test('nenhuma oportunidade ativa fica em silêncio: sem nada, aparece como sem próxima ação', () => {
  const actions = planForOpportunity(snap({ stage: 'negotiation' }), NOW);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'review');
  assert.match(actions[0].title, /sem próxima ação/i);
});

test('o título não repete a marca, que já está no cabeçalho do cartão', () => {
  for (const snapshot of [
    snap({ awaitingReplySince: daysAgo(1) }),
    snap({ dueFollowUp: { id: 'f1', dueAt: daysAgo(1), reason: 'x' } }),
    snap({ stage: 'commercial_qualification' }),
    snap({ stage: 'negotiation' }),
  ]) {
    for (const action of planForOpportunity(snapshot, NOW)) {
      assert.doesNotMatch(action.title, /Cecotec/, `"${action.title}" repete a marca`);
    }
  }
});

test('a próxima ação legada do painel antigo é reaproveitada como motivo', () => {
  const actions = planForOpportunity(
    snap({ stage: 'proposal', nextActionText: 'Asalvar análise da equipe.' }),
    NOW,
  );
  assert.equal(actions[0].reason, 'Asalvar análise da equipe.');
});

test('cada ação leva CTA, motivo e chave de deduplicação', () => {
  for (const a of planForOpportunity(snap({ awaitingReplySince: daysAgo(1) }), NOW)) {
    assert.ok(a.cta.length > 0);
    assert.ok(a.reason.length > 0);
    assert.ok(a.dedupeKey.startsWith('opp:o1:'));
  }
});

test('a mesma entrada produz a mesma chave: replanear não duplica', () => {
  const a = planForOpportunity(snap({ awaitingReplySince: daysAgo(1) }), NOW);
  const b = planForOpportunity(snap({ awaitingReplySince: daysAgo(1) }), NOW);
  assert.deepEqual(a.map((x) => x.dedupeKey), b.map((x) => x.dedupeKey));
});

test('vencido pesa mais do que a vencer', () => {
  const vencido = priorityScore({ type: 'follow_up', dueAt: daysAgo(5), now: NOW });
  const hoje = priorityScore({ type: 'follow_up', dueAt: NOW.toISOString(), now: NOW });
  const futuro = priorityScore({ type: 'follow_up', dueAt: new Date(NOW.getTime() + 5 * 86400000).toISOString(), now: NOW });
  assert.ok(vencido > hoje && hoje > futuro);
});

test('uma resposta à espera sobe na fila', () => {
  const comResposta = priorityScore({ type: 'respond', inboundWaiting: true, now: NOW });
  const semResposta = priorityScore({ type: 'respond', now: NOW });
  assert.ok(comResposta > semResposta);
});

test('risco alto sobe na fila', () => {
  assert.ok(
    priorityScore({ type: 'negotiate', risk: 'high', now: NOW }) >
      priorityScore({ type: 'negotiate', risk: 'none', now: NOW }),
  );
});

test('estar mais perto da receita pesa', () => {
  assert.ok(
    priorityScore({ type: 'respond', stage: 'negotiation', now: NOW }) >
      priorityScore({ type: 'respond', stage: 'discovered', now: NOW }),
  );
});

test('adiar tira da fila sem apagar o item', () => {
  const future = new Date(NOW.getTime() + 3 * 86400000).toISOString();
  assert.ok(priorityScore({ type: 'respond', snoozedUntil: future, now: NOW }) < 0);
});

test('a pontuação é sempre inteira: é o que ordena no SQL', () => {
  for (const fit of [0, 33, 67, 100]) {
    const s = priorityScore({ type: 'respond', fitScore: fit, expectedCents: 13000, now: NOW });
    assert.equal(Number.isInteger(s), true);
  }
});

test('a fila sai ordenada por prioridade', () => {
  const actions = planForOpportunity(
    snap({
      awaitingReplySince: daysAgo(4),
      openAsks: ['rate_request'],
      waitingUntil: daysAgo(1),
      riskFlags: ['usage_no_period', 'exclusivity'],
    }),
    NOW,
  );
  for (let i = 1; i < actions.length; i++) {
    assert.ok(actions[i - 1].priorityScore >= actions[i].priorityScore);
  }
});

test('vários riscos escalam para risco alto', () => {
  const [action] = planForOpportunity(
    snap({ awaitingReplySince: daysAgo(1), riskFlags: ['usage_no_period', 'whitelisting'] }),
    NOW,
  );
  assert.equal(action.risk, 'high');
});

test('nunca sai uma data ISO no meio de uma frase', () => {
  const iso = /\d{4}-\d{2}-\d{2}/;
  for (const snapshot of [
    snap({ awaitingReplySince: daysAgo(5) }),
    snap({ awaitingReplySince: daysAgo(0) }),
    snap({ awaitingReplySince: daysAgo(1) }),
    snap({ dueFollowUp: { id: 'f1', dueAt: daysAgo(1), reason: 'Cadência.' } }),
    snap({ waitingUntil: daysAgo(3) }),
    snap({ stage: 'commercial_qualification' }),
    snap({ stage: 'negotiation' }),
  ]) {
    for (const action of planForOpportunity(snapshot, NOW)) {
      assert.doesNotMatch(action.reason, iso, `"${action.reason}" tem uma data crua`);
      assert.doesNotMatch(action.title, iso, `"${action.title}" tem uma data crua`);
    }
  }
});

test('a espera conta-se em dias, e um dia é singular', () => {
  const um = planForOpportunity(snap({ awaitingReplySince: daysAgo(1) }), NOW)[0];
  assert.match(um.reason, /há 1 dia\./);
  const muitos = planForOpportunity(snap({ awaitingReplySince: daysAgo(6) }), NOW)[0];
  assert.match(muitos.reason, /há 6 dias\./);
});

test('uma mensagem de hoje não diz «há 0 dias»', () => {
  const hoje = planForOpportunity(snap({ awaitingReplySince: daysAgo(0) }), NOW)[0];
  assert.match(hoje.reason, /Chegou hoje/);
  assert.doesNotMatch(hoje.reason, /0 dias/);
});
