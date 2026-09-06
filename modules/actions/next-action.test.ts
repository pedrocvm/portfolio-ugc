import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeReferralTemplate,
  decideReferral,
  extractReferredContacts,
  isActionable,
  looksEnglish,
  looksLikePersonName,
  nextActionForThread,
  readNextAction,
  type ThreadReading,
} from './next-action';
import { planForOpportunity, type OpportunitySnapshot } from './planner';

/** O caso real que motivou isto, palavra por palavra do email da Cora. */
const CORA = `Olá Carol, como vai?

Aqui é a Estrella da equipe de atendimento da Cora.

Por aqui, na equipe de Atendimento, nosso foco é o suporte diário e a ajuda direta aos nossos clientes em suas contas. Por isso, não somos nós quem gerenciamos as decisões de campanhas de anúncios ou contratações de novos criativos.

No entanto, para que a sua proposta de abordagem em vídeo e o seu portfólio sejam avaliados diretamente pelos nossos especialistas de marca, por favor, envie a sua apresentação para o e-mail abaixo:

Time de Marketing - marketing@cora.com.br

Um abraço,
Time Cora

www.cora.com.br`;

const leitura = (over: Partial<ThreadReading> = {}): ThreadReading => ({
  threadId: 't1',
  opportunityId: 'o1',
  brandId: 'b1',
  brandName: 'Cora',
  intent: 'REFERRAL',
  confidence: 0.9,
  waitingOn: 'carol',
  waitingSince: '2026-09-04T16:47:36Z',
  lastExternal: {
    id: 'm2',
    fromAddress: 'parcerias@cora.com.br',
    fromName: 'Estrella',
    bodyText: CORA,
    sentAt: '2026-09-04T16:47:36Z',
  },
  draft: null,
  recommendation: 'Enviar a proposta para o marketing.',
  whatTheyWant: 'Redirecionar para o time de marketing.',
  referred: extractReferredContacts(CORA, { exclude: ['parcerias@cora.com.br', 'carolxqueiroz05@gmail.com'] }),
  originalOutbound: { subject: 'UGC | Ideia de criativo para a Cora', body: 'Olá equipe! Pensei num ângulo para os anúncios de vocês.' },
  ...over,
});

/* ── Extrair o endereço indicado ─────────────────────────────────────────── */

test('o endereço que a marca deixou é extraído com a frase e a equipe', () => {
  const [r, ...resto] = extractReferredContacts(CORA, { exclude: ['parcerias@cora.com.br'] });
  assert.equal(resto.length, 0);
  assert.equal(r.email, 'marketing@cora.com.br');
  assert.equal(r.valid, true);
  assert.equal(r.team, 'marketing');
  assert.match(r.context, /Time de Marketing/);
});

test('o remetente e as caixas dela não contam como encaminhamento', () => {
  const texto = 'Escreva para joana@marca.pt ou responda aqui: suporte@marca.pt. cc carol@gmail.com';
  const r = extractReferredContacts(texto, { exclude: ['suporte@marca.pt', 'carol@gmail.com'] });
  assert.deepEqual(r.map((x) => x.email), ['joana@marca.pt']);
});

test('uma caixa automática não é um contato', () => {
  const [r] = extractReferredContacts('Fale com noreply@marca.com', {});
  assert.equal(r.valid, false);
  assert.match(r.reason ?? '', /automática/);
});

test('o mesmo endereço repetido conta uma vez', () => {
  const r = extractReferredContacts('marketing@x.com e depois marketing@x.com outra vez', {});
  assert.equal(r.length, 1);
});

/* ── Decidir ──────────────────────────────────────────────────────────────── */

test('um endereço válido: escreve-se para ele sem perguntar', () => {
  const d = decideReferral({ intent: 'REFERRAL', referred: extractReferredContacts(CORA, { exclude: ['parcerias@cora.com.br'] }) });
  assert.equal(d.kind, 'compose');
});

test('dois endereços: pergunta-se qual, e nada sai', () => {
  const referred = extractReferredContacts('Pode falar com ana@marca.pt ou com pedro@marca.pt.', {});
  const d = decideReferral({ intent: 'REFERRAL', referred });
  assert.equal(d.kind, 'confirm');
  if (d.kind === 'confirm') {
    assert.match(d.question, /2 endereços/);
    assert.equal(d.candidates.length, 2);
  }
});

test('um endereço inválido não gera envio silencioso', () => {
  const referred = extractReferredContacts('Fale com donotreply@marca.pt', {});
  const d = decideReferral({ intent: 'REFERRAL', referred });
  assert.equal(d.kind, 'confirm');
});

test('encaminhamento sem endereço nenhum pede o contato em vez de o inventar', () => {
  assert.equal(decideReferral({ intent: 'REFERRAL', referred: [] }).kind, 'ask_contact');
  assert.equal(decideReferral({ intent: 'GENERAL_REPLY', referred: [] }).kind, 'none');
});

/* ── A ação ───────────────────────────────────────────────────────────────── */

test('encaminhamento explícito vira um email NOVO para o contato indicado, não uma resposta', () => {
  const a = nextActionForThread(leitura());
  assert.equal(a.type, 'compose_to_new_contact');
  assert.equal(a.target.kind, 'compose');
  assert.equal(a.target.to, 'marketing@cora.com.br');
  assert.equal(a.requiresConfirmation, true);
  assert.equal(a.evidence.sourceMessageId, 'm2');
  assert.match(a.evidence.because, /informado pela própria marca/);
  assert.match(a.evidence.quote ?? '', /marketing@cora\.com\.br/);
});

test('o rascunho vai endereçado ao contato certo e não é «Re:» da conversa antiga', () => {
  const a = nextActionForThread(leitura());
  assert.ok(a.preparedArtifact);
  assert.doesNotMatch(a.preparedArtifact!.subject, /^re:/i);
  assert.match(a.preparedArtifact!.body, /equipe de marketing/i);
  // Menciona o encaminhamento de forma natural, com o nome da pessoa que o fez.
  assert.match(a.preparedArtifact!.body, /Estrella .* me indicou/);
  // E leva o argumento original.
  assert.match(a.preparedArtifact!.body, /Pensei num ângulo/);
});

test('quando a triagem escreveu o email para o contato indicado, é esse que sai', () => {
  const a = nextActionForThread(
    leitura({ draft: { subject: 'Conteúdo UGC para a Cora', body: 'Olá, equipe de marketing! A Estrella me indicou vocês.', language: 'pt-BR', needsReply: true, target: 'referred_contact' } }),
  );
  assert.equal(a.preparedArtifact?.body, 'Olá, equipe de marketing! A Estrella me indicou vocês.');
  assert.equal(a.preparedArtifact?.subject, 'Conteúdo UGC para a Cora');
});

test('uma resposta escrita para a thread antiga não serve de email novo', () => {
  // A triagem antiga escreveu «vou encaminhar» para a Estrella. Isso é uma
  // resposta, e a ação certa é outra: o modelo determinístico substitui-a.
  const a = nextActionForThread(
    leitura({ draft: { subject: 'Re: UGC', body: 'Olá Estrella, vou encaminhar a proposta.', language: 'pt-BR', needsReply: true, target: 'same_thread' } }),
  );
  assert.equal(a.type, 'compose_to_new_contact');
  assert.doesNotMatch(a.preparedArtifact!.body, /Olá Estrella/);
});

test('uma resposta na mesma conversa continua a ser resposta', () => {
  const a = nextActionForThread(
    leitura({
      intent: 'RATE_REQUEST',
      referred: [],
      lastExternal: { id: 'm3', fromAddress: 'ana@marca.pt', fromName: 'Ana', bodyText: 'Quanto cobra por um vídeo?', sentAt: '2026-09-04T10:00:00Z' },
      draft: { subject: 'Re: Parceria', body: 'Olá Ana, o valor depende do uso. Me conta…', language: 'pt-BR', needsReply: true, target: 'same_thread' },
    }),
  );
  assert.equal(a.type, 'send_rate');
  assert.equal(a.target.kind, 'reply');
  assert.equal(a.target.to, 'ana@marca.pt');
  assert.equal(a.preparedArtifact?.body.startsWith('Olá Ana'), true);
});

test('dois endereços na mensagem pedem uma confirmação curta', () => {
  const texto = 'Pode falar com ana@marca.pt ou com pedro@marca.pt.';
  const a = nextActionForThread(
    leitura({ referred: extractReferredContacts(texto, {}), lastExternal: { id: 'm4', fromAddress: 'geral@marca.pt', fromName: 'Marca', bodyText: texto, sentAt: '2026-09-04T10:00:00Z' } }),
  );
  assert.equal(a.type, 'confirm_referral');
  assert.equal(a.preparedArtifact, null);
  assert.equal(a.requiresConfirmation, false);
  assert.ok(a.needsDecision);
  assert.equal(a.candidates.length, 2);
});

test('quando a vez é da marca não há ação, e uma promessa vira espera com data', () => {
  const nada = nextActionForThread(leitura({ intent: 'GENERAL_REPLY', referred: [], waitingOn: 'brand' }));
  assert.equal(nada.type, 'no_action_required');
  assert.equal(isActionable(nada), false);

  const espera = nextActionForThread(leitura({ intent: 'FOLLOW_UP_PROMISE', referred: [], waitingOn: 'brand', promisedDate: '2026-09-20' }));
  assert.equal(espera.type, 'wait_until_date');
  assert.equal(espera.dueAt, '2026-09-20');
});

test('uma recusa fecha a conversa mesmo com a última mensagem da marca', () => {
  const a = nextActionForThread(leitura({ intent: 'REJECTION', referred: [], draft: null }));
  assert.equal(a.type, 'no_action_required');
  assert.match(a.reason, /disse que não/);
});

test('sem mensagem da marca não há ação', () => {
  assert.equal(nextActionForThread(leitura({ lastExternal: null, referred: [] })).type, 'no_action_required');
});

/* ── O planeador obedece ──────────────────────────────────────────────────── */

const NOW = new Date('2026-09-06T12:00:00Z');
const snap = (over: Partial<OpportunitySnapshot> = {}): OpportunitySnapshot => ({
  id: 'o1', brandId: 'b1', brandName: 'Cora', stage: 'replied', productName: '',
  fitScore: 70, expectedCents: null, lastActivityAt: '2026-09-04T16:47:36Z', waitingUntil: null,
  nextActionText: '', awaitingReplySince: '2026-09-04T16:47:36Z', openAsks: [], riskFlags: [],
  dueFollowUp: null, hasQuote: false, hasProposalDoc: false, ...over,
});

test('o cartão do Hoje é a projeção da leitura da conversa, não uma segunda opinião', () => {
  const ta = nextActionForThread(leitura());
  const [acao] = planForOpportunity(snap({ threadAction: ta }), NOW);
  assert.equal(acao.type, 'compose_to_new_contact');
  assert.equal(acao.title, ta.title);
  assert.equal(acao.nextAction?.target.to, 'marketing@cora.com.br');
  assert.equal(acao.sourceThreadId, 't1');
  // E não há um «Responder à mensagem» ao lado a contradizê-lo.
  assert.equal(planForOpportunity(snap({ threadAction: ta }), NOW).filter((a) => a.type === 'respond').length, 0);
});

test('quando a leitura diz «nada a fazer», o planeador não inventa uma resposta', () => {
  const ta = nextActionForThread(leitura({ intent: 'REJECTION', referred: [] }));
  const acoes = planForOpportunity(snap({ threadAction: ta }), NOW);
  assert.equal(acoes.some((a) => a.type === 'respond'), false);
});

test('sem leitura, o planeador continua a fazer o que fazia', () => {
  const [acao] = planForOpportunity(snap({ threadAction: null }), NOW);
  assert.equal(acao.type, 'respond');
});

/* ── Miúdos ───────────────────────────────────────────────────────────────── */

test('um nome de marca ou de equipe não passa por nome de pessoa', () => {
  assert.equal(looksLikePersonName('Estrella', 'Cora'), true);
  assert.equal(looksLikePersonName('Cora', 'Cora'), false);
  assert.equal(looksLikePersonName('Time Cora', 'Cora'), false);
  assert.equal(looksLikePersonName('parcerias@cora.com.br', 'Cora'), false);
});

test('o modelo determinístico nunca inventa um nome', () => {
  const t = composeReferralTemplate({ brandName: 'Cora', team: 'marketing', senderName: 'Cora', originalSubject: 'Re: UGC | Cora', originalBody: null });
  assert.match(t.body, /A equipe de atendimento da Cora me indicou/);
  assert.equal(t.subject, 'UGC | Cora');
});

test('o que se grava lê-se de volta, e lixo lê-se como nada', () => {
  const a = nextActionForThread(leitura());
  assert.deepEqual(readNextAction(JSON.parse(JSON.stringify(a))), a);
  assert.equal(readNextAction({}), null);
  assert.equal(readNextAction(null), null);
  assert.equal(readNextAction({ type: 'x' }), null);
});

test('uma abordagem feita em inglês gera o email novo em inglês', () => {
  const t = composeReferralTemplate({
    brandName: 'Orbitkey', team: null, senderName: 'Orbitkey Support', originalSubject: 'UGC Content Collaboration | Orbitkey Europe',
    originalBody: "Hi Orbitkey team, my name is Carolina. I'm a UGC Creator based in Portugal and I wanted to reach out with a few content ideas.",
  });
  assert.equal(t.language, 'en');
  assert.match(t.body, /^Hi team!/);
  assert.doesNotMatch(t.body, /Olá/);
  assert.match(t.body, /The Orbitkey support team pointed me/);
  assert.equal(looksEnglish('Olá equipe! Pensei num ângulo para vocês.'), false);
});
