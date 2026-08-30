import assert from 'node:assert/strict';
import test from 'node:test';
import { localDay } from '../../lib/time.ts';
import { planForOpportunity, type OpportunitySnapshot } from '../actions/planner.ts';
import { decideBarter } from '../barter/engine.ts';
import { resolveBrand, claimsFrom, normalizeName } from '../brands/identity.ts';
import { scheduleFollowUp } from '../followups/policy.ts';
import { reduceStage, type Stage } from '../opportunities/domain.ts';
import { calculateQuote } from '../pricing/engine.ts';
import { rightsRisks, BLANK_RIGHTS } from '../rights/engine.ts';

/** Os cenários de aceitação do Technical Briefing §48, corridos ponta a ponta
 *  através dos motores puros.
 *
 *  Cada um segue uma situação real do Handoff — a AllMatters a pedir rates com
 *  ads rights, a NOVOTECK a oferecer um pau de selfie, o lead que prometeu
 *  responder na sexta — e verifica que o sistema faz o que o produto diz que
 *  tem de fazer. É esta suite que falha se alguém mexer numa regra comercial
 *  sem perceber o que ela protege. */

const MONDAY = new Date('2026-08-31T12:00:00Z');

const snapshot = (over: Partial<OpportunitySnapshot> = {}): OpportunitySnapshot => ({
  id: 'o1',
  brandId: 'b1',
  brandName: 'Marca',
  stage: 'outreach',
  productName: '',
  fitScore: 70,
  expectedCents: null,
  lastActivityAt: MONDAY.toISOString(),
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

/* ── A. Email frio, a marca responde a pedir portfólio ─────────────────── */

test('A: abordagem enviada leva a oportunidade a "abordada" e agenda o primeiro follow-up', () => {
  const stage = reduceStage('discovered', { eventType: 'outreach.sent' });
  assert.equal(stage?.to, 'outreach');
  assert.equal(stage?.autoApplicable, true, 'registar uma abordagem é seguro de aplicar sozinho');

  const plan = scheduleFollowUp({ situation: 'cold_outreach', since: MONDAY, sentCount: 0 });
  assert.equal(plan.kind, 'followup');
  assert.equal(localDay(new Date((plan as { dueAt: string }).dueAt)), '2026-09-03');
});

test('A: a marca pede portfólio e o Hoje mostra "enviar portfólio", não "responder"', () => {
  // Pedir portfólio ainda não é qualificação comercial: a marca está a avaliar
  // se vale a pena falar de dinheiro, não a falar de dinheiro.
  const stage = reduceStage('outreach', {
    eventType: 'reply.received',
    replyTypes: ['portfolio_request'],
  });
  assert.equal(stage?.to, 'replied');

  const [action] = planForOpportunity(
    snapshot({
      stage: 'replied',
      awaitingReplySince: '2026-09-01T09:00:00Z',
      openAsks: ['portfolio_request'],
    }),
    new Date('2026-09-01T15:00:00Z'),
  );
  assert.equal(action.type, 'send_portfolio');
  assert.equal(action.requiresApproval, true, 'nada sai sem ela ler');
});

/* ── B. «Manda-me rates + ads rights» ──────────────────────────────────── */

test('B: rates com ads rights vai para qualificação comercial e pede âmbito primeiro', () => {
  const stage = reduceStage('replied', {
    eventType: 'reply.received',
    replyTypes: ['rate_request', 'ads_rights'],
  });
  assert.equal(stage?.to, 'commercial_qualification');

  const actions = planForOpportunity(
    snapshot({
      stage: 'commercial_qualification',
      awaitingReplySince: '2026-09-01T09:00:00Z',
      openAsks: ['rate_request', 'ads_rights'],
      riskFlags: ['usage_no_period'],
    }),
    new Date('2026-09-01T15:00:00Z'),
  );
  // O primeiro pedido manda; ambos são caminhos válidos, mas nenhum é
  // "responder genericamente".
  assert.ok(['send_rate', 'ask_scope'].includes(actions[0].type));
  assert.equal(actions[0].risk, 'medium');
});

test('B: o motor de direitos exige período e canais antes de haver preço', () => {
  const risks = rightsRisks({ ...BLANK_RIGHTS, paidAllowed: true });
  assert.ok(risks.some((r) => r.code === 'usage_no_period' && r.severity === 'high'));
  assert.ok(risks.some((r) => r.code === 'usage_no_platforms' && r.severity === 'high'));
});

test('B: o modelo não pode inventar o preço do uso — a política não o tem', () => {
  const draft = {
    base: { single_video_cents: null },
    paid_usage: { model: 'percent_of_base' as const, terms: { '3m': null, '6m': null } },
    minimum_project_floor_cents: null,
  };
  const quote = calculateQuote(draft, { videos: 1, paidUsage: true, usageTerm: '3m' }, 'v1-draft');
  assert.equal(quote.recommendedCents, null);
  assert.ok(quote.unresolved.length >= 2);
});

/* ── C. Produto de baixo valor oferecido como permuta ──────────────────── */

test('C: o caso NOVOTECK — pau de selfie por um vídeo não compensa', () => {
  const result = decideBarter({
    retailPriceCents: 4000,
    valueToCarolCents: null,
    wouldBuy: false,
    productInterest: 1,
    productionEffort: 3,
    strategicValue: 2,
    portfolioValue: 1,
    rightsRequested: { paidUsage: false, whitelisting: false, exclusivity: false, rawFootage: false },
    cashAlternativeCents: 13000,
  });
  assert.ok(['ASK_FOR_CASH', 'DECLINE'].includes(result.decision));
  assert.equal(result.countsAsCashRevenue, false, 'produto nunca entra como receita');
  assert.ok(result.reasons.length > 0, 'a decisão tem de explicar-se');
});

test('C: permuta nunca é aceite automaticamente — é sempre uma recomendação', () => {
  const result = decideBarter({
    retailPriceCents: 50000,
    valueToCarolCents: null,
    wouldBuy: true,
    productInterest: 5,
    productionEffort: 1,
    strategicValue: 5,
    portfolioValue: 5,
    rightsRequested: { paidUsage: false, whitelisting: false, exclusivity: false, rawFootage: false },
    cashAlternativeCents: 13000,
  });
  assert.equal(result.decision, 'ACCEPT_BARTER');
  // Mesmo no melhor caso, o valor do produto continua fora da receita.
  assert.equal(result.countsAsCashRevenue, false);
});

/* ── D. «Volto a falar contigo na sexta» ───────────────────────────────── */

test('D: a promessa da marca manda sobre a cadência genérica', () => {
  const friday = new Date('2026-09-04T12:00:00Z');
  const plan = scheduleFollowUp({
    situation: 'cold_outreach',
    since: MONDAY,
    sentCount: 0,
    promisedAt: friday,
  });
  assert.equal(plan.kind === 'followup' && plan.situation, 'promised_date');
  assert.equal(localDay(new Date((plan as { dueAt: string }).dueAt)), '2026-09-07');
});

test('D: se a marca responder antes, o follow-up pendente é cancelado', async () => {
  const { cancelsPendingFollowUp } = await import('../followups/policy.ts');
  assert.equal(cancelsPendingFollowUp('reply.received'), true);
});

test('D: com resposta por tratar, o Hoje não propõe insistir', () => {
  const actions = planForOpportunity(
    snapshot({
      awaitingReplySince: '2026-09-05T09:00:00Z',
      dueFollowUp: { id: 'f1', dueAt: '2026-09-07T12:00:00Z', reason: 'Cadência.' },
    }),
    new Date('2026-09-08T09:00:00Z'),
  );
  assert.equal(actions.filter((a) => a.type === 'follow_up').length, 0);
  assert.equal(actions[0].type, 'respond');
});

/* ── E. A mesma marca chega por outro canal ────────────────────────────── */

test('E: um identificador que bate funde; um nome parecido só propõe', () => {
  const known = [
    { id: 'b1', normalizedName: normalizeName('Cecotec Portugal'), identities: [{ provider: 'email_domain', externalId: 'cecotec.pt' }] },
  ];

  const byEmail = resolveBrand(claimsFrom({ email: 'outra@cecotec.pt' }), 'Cecotec', known);
  assert.equal(byEmail.kind, 'exact');

  const byName = resolveBrand(claimsFrom({}), 'Cecotec Portugal', known);
  assert.equal(byName.kind, 'candidate', 'sem prova, propõe em vez de fundir');
});

test('E: duas marcas diferentes nunca se fundem por nomes vagamente parecidos', () => {
  const known = [{ id: 'b1', normalizedName: normalizeName('Maia Shop'), identities: [] }];
  assert.equal(resolveBrand([], 'Maia Tech Solutions', known).kind, 'none');
});

/* ── F. A integração parte ─────────────────────────────────────────────── */

test('F: uma oportunidade activa nunca fica calada, mesmo sem sincronização', () => {
  const actions = planForOpportunity(snapshot({ stage: 'negotiation' }), MONDAY);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'review');
  assert.match(actions[0].title, /sem próxima ação/i);
});

/* ── Invariantes que atravessam tudo ───────────────────────────────────── */

test('nenhuma etapa terminal é aplicada automaticamente', () => {
  for (const [from, signal] of [
    ['negotiation', { eventType: 'reply.received', explicitAcceptance: true }],
    ['proposal', { eventType: 'reply.received', explicitRejection: true, rejectionReason: 'sem verba' }],
  ] as const) {
    const t = reduceStage(from as Stage, signal);
    assert.equal(t?.autoApplicable, false, `${from} → ${t?.to} não devia ser automático`);
  }
});

test('toda a ação que sai para fora exige aprovação', () => {
  const outbound = new Set(['respond', 'send_rate', 'send_portfolio', 'ask_scope', 'negotiate', 'follow_up', 'create_proposal']);
  const actions = [
    ...planForOpportunity(snapshot({ awaitingReplySince: MONDAY.toISOString() }), MONDAY),
    ...planForOpportunity(snapshot({ dueFollowUp: { id: 'f', dueAt: MONDAY.toISOString(), reason: 'x' } }), MONDAY),
    ...planForOpportunity(snapshot({ stage: 'commercial_qualification' }), MONDAY),
  ];
  for (const a of actions) {
    if (outbound.has(a.type)) {
      assert.equal(a.requiresApproval, true, `${a.type} sai para fora e tem de passar por ela`);
    }
  }
});

test('perpetuidade, whitelisting e exclusividade nunca ganham preço automático', () => {
  const filled = {
    base: { single_video_cents: 13000 },
    minimum_project_floor_cents: 10000,
  };
  const quote = calculateQuote(filled, { videos: 1, perpetual: true }, 'test');
  assert.equal(quote.recommendedCents, null);
  assert.ok(quote.humanOnly.some((h) => /perpétuo|buyout/i.test(h)));
});
