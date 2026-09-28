import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SETTINGS, type Pillar, type TopicState } from './editorial';
import {
  TOPIC_COOLDOWN_DAYS,
  buildWeek,
  guardrailBreaches,
  type ProposalDraft,
  type PriorityInput,
  type PublishedPiece,
  type TopicInput,
} from './priority';

const NOW = '2026-09-28T09:00:00.000Z';

const topic = (
  slug: string,
  pillar: Pillar,
  over: Partial<TopicInput> = {},
): TopicInput => ({
  id: `t-${slug}`,
  slug,
  pillar,
  label: slug,
  howToTreat: 'Relato e perspectiva pessoal.',
  state: 'now' as TopicState,
  lastUsedAt: null,
  useCount: 0,
  ...over,
});

const MAPA: TopicInput[] = [
  topic('my_experience_so_far', 'ugc_income'),
  topic('brand_experiences', 'ugc_income'),
  topic('tech_ugc', 'ugc_income'),
  topic('real_experience', 'experiences'),
  topic('braga_a_fundo', 'experiences'),
  topic('seven_pets', 'home'),
  topic('home_tech', 'home'),
];

const publicada = (
  i: number,
  pillar: Pillar,
  over: Partial<PublishedPiece> = {},
): PublishedPiece => ({
  id: `p${i}`,
  publishedAt: new Date(Date.parse(NOW) - i * 3 * 24 * 60 * 60 * 1000).toISOString(),
  pillar,
  objective: 'attract',
  lens: 'what_i_do',
  topicSlug: null,
  format: 'reel',
  modality: 'none',
  ...over,
});

const entrada = (over: Partial<PriorityInput> = {}): PriorityInput => ({
  weekStart: '2026-09-28',
  now: NOW,
  focus: ['tech_ugc', 'canvas_ugc', 'career_building'],
  topics: MAPA,
  published: [],
  events: [],
  learnings: [],
  formatGaps: [],
  references: [],
  runningExperiments: 0,
  ...over,
});

/* ── A semana nasce cheia, e nasce com três ───────────────────────────────── */

test('a semana não nasce vazia: o sistema propõe, ela valida', () => {
  const semana = buildWeek(entrada());
  assert.equal(semana.proposals.length, 3);
  for (const p of semana.proposals) {
    assert.ok(p.topicId);
    assert.ok(p.angle.length > 0);
    assert.ok(p.whyNow.length > 0);
    assert.ok(p.evidence.length > 0);
  }
});

test('três, não quatro: a capacidade-base é a declarada por ela', () => {
  assert.equal(buildWeek(entrada()).capacity, 3);
  assert.equal(buildWeek(entrada()).proposals.length, 3);
  const maior = buildWeek(entrada({ settings: { ...DEFAULT_SETTINGS, weeklyCapacity: 5 } }));
  assert.ok(maior.proposals.length <= 5, 'mais é bónus, nunca obrigação');
});

test('cada proposta chega curta: assunto, ângulo, pilar, lente, objetivo, formato, porquê', () => {
  const [p] = buildWeek(entrada()).proposals;
  assert.ok(p.topicLabel && p.angle && p.pillar && p.lens && p.objective && p.format && p.whyNow);
  // Antes da aprovação não existe roteiro.
  assert.ok(!('script' in p));
});

test('o mesmo assunto não aparece duas vezes na mesma semana', () => {
  const slugs = buildWeek(entrada()).proposals.map((p) => p.topicSlug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('sem nenhum assunto em Agora, o motor diz porquê em vez de inventar', () => {
  const semana = buildWeek(entrada({ topics: MAPA.map((t) => ({ ...t, state: 'paused' as TopicState })) }));
  assert.equal(semana.proposals.length, 0);
  assert.match(semana.summary, /Nenhum assunto/);
  assert.ok(semana.notes.length > 0);
});

test('assunto pausado nunca é proposto, e continua existindo no mapa', () => {
  const mapa = MAPA.map((t) => (t.pillar === 'home' ? { ...t, state: 'paused' as TopicState } : t));
  const semana = buildWeek(entrada({ topics: mapa }));
  assert.ok(!semana.proposals.some((p) => p.pillar === 'home'));
  assert.equal(mapa.filter((t) => t.pillar === 'home').length, 2);
});

/* ── Equilíbrio real ──────────────────────────────────────────────────────── */

test('perfil profissional demais é equilibrado: Casa entra por défice', () => {
  const semana = buildWeek(entrada({
    published: [0, 1, 2, 3, 4, 5].map((i) => publicada(i, 'ugc_income')),
  }));
  const pilares = semana.proposals.map((p) => p.pillar);
  assert.ok(pilares.includes('home'), 'Casa estava ausente e tinha de voltar');
  assert.ok(pilares.includes('experiences'));
  const casa = semana.proposals.find((p) => p.pillar === 'home');
  assert.ok(casa?.evidence.some((e) => e.kind === 'pillar_absent'));
});

test('a semana inteira não fica no pilar de trabalho', () => {
  const semana = buildWeek(entrada({
    published: [0, 1, 2, 3, 4, 5].map((i) => publicada(i, 'home')),
  }));
  const trabalho = semana.proposals.filter((p) => p.pillar === 'ugc_income').length;
  assert.ok(trabalho < semana.proposals.length);
  assert.equal(guardrailBreaches(semana.proposals).filter((b) => b.rule === 'perfil_nao_e_so_trabalho').length, 0);
});

test('só com assuntos de trabalho, a semana vem incompleta em vez de ser toda trabalho', () => {
  // O caso que o limite existe para apanhar: nada em Casa nem em Experiências
  // está em «Agora». O motor prefere devolver duas propostas a devolver três
  // que transformam o perfil numa conta de portfólio.
  const semana = buildWeek(entrada({
    topics: MAPA.filter((t) => t.pillar === 'ugc_income'),
  }));
  assert.ok(semana.proposals.length < 3, `devolveu ${semana.proposals.length} de trabalho`);
  assert.equal(semana.proposals.filter((p) => p.pillar === 'ugc_income').length, 2);
  assert.ok(semana.notes.some((n) => /Consegui 2 de 3/.test(n)));
  assert.deepEqual(guardrailBreaches(semana.proposals).filter((b) => b.rule === 'perfil_nao_e_so_trabalho'), []);
});

test('a lente que sumiu volta como razão', () => {
  const semana = buildWeek(entrada({
    published: [0, 1, 2, 3, 4, 5].map((i) => publicada(i, 'ugc_income', { lens: 'what_i_do' })),
  }));
  assert.ok(semana.proposals.some((p) => p.evidence.some((e) => e.kind === 'lens_absent')));
});

test('assunto falado há pouco é penalizado; assunto parado há muito sobe', () => {
  const recente = new Date(Date.parse(NOW) - 3 * 24 * 60 * 60 * 1000).toISOString();
  const antigo = new Date(Date.parse(NOW) - (TOPIC_COOLDOWN_DAYS + 40) * 24 * 60 * 60 * 1000).toISOString();
  const semana = buildWeek(entrada({
    topics: [
      topic('seven_pets', 'home', { lastUsedAt: recente }),
      topic('home_tech', 'home', { lastUsedAt: antigo }),
    ],
    settings: { ...DEFAULT_SETTINGS, weeklyCapacity: 1 },
  }));
  assert.equal(semana.proposals[0].topicSlug, 'home_tech');
});

/* ── Converter ────────────────────────────────────────────────────────────── */

test('converter não tem slot semanal obrigatório', () => {
  const semana = buildWeek(entrada());
  assert.ok(!semana.proposals.some((p) => p.objective === 'convert'));
});

test('converter entra quando o alvo é declarado, não por omissão', () => {
  const semana = buildWeek(entrada({
    settings: { ...DEFAULT_SETTINGS, objectiveTarget: { attract: 0, retain: 0, prove: 0, convert: 2 } },
  }));
  assert.ok(semana.proposals.some((p) => p.objective === 'convert'));
});

/* ── Acontecimento real ───────────────────────────────────────────────────── */

test('quando aconteceu alguma coisa de verdade, o ângulo é isso', () => {
  const semana = buildWeek(entrada({
    events: [{
      id: 'ev1', kind: 'story', fact: 'A marca cancelou dois dias antes da gravação.',
      occurredAt: '2026-09-26T10:00:00.000Z', topicSlug: 'brand_experiences',
      pillar: 'ugc_income', confirmed: true,
    }],
  }));
  const p = semana.proposals.find((x) => x.topicSlug === 'brand_experiences');
  assert.ok(p);
  assert.equal(p.angleSource, 'event');
  assert.equal(p.angle, 'A marca cancelou dois dias antes da gravação.');
  assert.equal(p.storyId, 'ev1');
  assert.ok(p.evidence.some((e) => e.kind === 'recent_event' && e.refId === 'ev1'));
});

test('sem acontecimento, o ângulo vem do tratamento do assunto e diz-se que veio dali', () => {
  const p = buildWeek(entrada()).proposals[0];
  assert.equal(p.angleSource, 'topic');
  assert.equal(p.storyId, null);
});

/* ── Experimentos e Reel Test ─────────────────────────────────────────────── */

test('um experimento por vez, e só quando existe pergunta', () => {
  const sem = buildWeek(entrada());
  assert.equal(sem.proposals.filter((p) => p.experimental).length, 0);

  const com = buildWeek(entrada({ formatGaps: [{ format: 'carousel', state: 'untested' }] }));
  assert.equal(com.proposals.filter((p) => p.experimental).length, 1);
  assert.match(com.summary, /teste de formato/);
});

test('com um teste já a correr, a semana não abre outro', () => {
  const semana = buildWeek(entrada({
    formatGaps: [{ format: 'carousel', state: 'untested' }],
    runningExperiments: 1,
  }));
  assert.equal(semana.proposals.filter((p) => p.experimental).length, 0);
});

test('Reel Test é recomendado, nunca aplicado a todo Reel', () => {
  const semana = buildWeek(entrada({ formatGaps: [{ format: 'reel', state: 'untested' }] }));
  const comTrial = semana.proposals.filter((p) => p.reelTest);
  assert.equal(comTrial.length, 1);
  assert.ok(comTrial[0].experimental);
  assert.match(comTrial[0].reelTest!.because, /pergunta/);
  const reels = semana.proposals.filter((p) => p.format === 'reel');
  assert.ok(reels.length >= 1);
  assert.ok(reels.some((p) => !p.reelTest), 'nem todo Reel vira teste');
});

test('formato não testado não é tratado como pior nem como melhor', () => {
  const semana = buildWeek(entrada({
    formatGaps: [
      { format: 'reel', state: 'consistent_pattern' },
      { format: 'carousel', state: 'untested' },
    ],
  }));
  // O que tem padrão consistente é preferido; o não testado entra pelo teste,
  // não por julgamento.
  assert.ok(semana.proposals.some((p) => p.format === 'carousel' && p.experimental));
  assert.ok(semana.proposals.some((p) => p.format === 'reel' && !p.experimental));
});

test('um formato sem vantagem demonstrada deixa de ser escolhido por omissão', () => {
  const semana = buildWeek(entrada({
    formatGaps: [{ format: 'reel', state: 'no_advantage' }],
  }));
  assert.ok(!semana.proposals.some((p) => p.format === 'reel' && !p.experimental));
});

/* ── Aprendizado a fechar o ciclo ─────────────────────────────────────────── */

test('um aprendizado ativo muda a decisão seguinte e fica na evidência', () => {
  const sem = buildWeek(entrada());
  const com = buildWeek(entrada({
    learnings: [{
      id: 'l1',
      statement: 'Perguntas abertas no fim trouxeram mais histórias pessoais.',
      influence: 'weight', format: null, objective: 'retain', lens: null,
    }],
  }));
  const usada = com.proposals.find((p) => p.evidence.some((e) => e.kind === 'learning' && e.refId === 'l1'));
  assert.ok(usada, 'o aprendizado tem de aparecer na evidência da proposta');
  assert.match(usada.whyNow, /Perguntas abertas/);
  assert.notDeepEqual(
    com.proposals.map((p) => `${p.topicSlug}:${p.objective}`),
    sem.proposals.map((p) => `${p.topicSlug}:${p.objective}`),
    'se o aprendizado não muda nada, o ciclo não fechou',
  );
});

/* ── Determinismo ─────────────────────────────────────────────────────────── */

test('duas corridas com os mesmos dados dão as mesmas propostas', () => {
  const a = buildWeek(entrada());
  const b = buildWeek(entrada());
  assert.deepEqual(a.proposals, b.proposals);
});

/* ── Guardrails sobre propostas fabricadas ────────────────────────────────── */

const draft = (over: Partial<ProposalDraft> = {}): ProposalDraft => ({
  position: 0, topicId: 't', topicSlug: 's', topicLabel: 'assunto', pillar: 'ugc_income',
  angle: 'o que aconteceu comigo na última entrega', angleSource: 'topic',
  lens: 'what_i_do', objective: 'prove', format: 'reel', structure: null, modality: 'none',
  whyNow: 'porque sim', evidence: [{ kind: 'topic_in_focus', detail: 'foco' }],
  experimental: null, reelTest: null, storyId: null, ...over,
});

test('o guardrail apanha tom de professora numa proposta escrita à mão', () => {
  const b = guardrailBreaches([draft({ angle: '5 dicas para creators cobrarem melhor' })]);
  assert.ok(b.some((x) => x.rule === 'documentar_nao_ensinar'));
});

test('o guardrail apanha proposta sem evidência', () => {
  const b = guardrailBreaches([draft({ evidence: [] })]);
  assert.ok(b.some((x) => x.rule === 'evidencia_obrigatoria'));
});

test('o guardrail apanha a semana inteira de trabalho e dois experimentos', () => {
  const tres = [draft(), draft({ position: 1 }), draft({ position: 2 })];
  assert.ok(guardrailBreaches(tres).some((x) => x.rule === 'perfil_nao_e_so_trabalho'));

  const dois = [
    draft({ experimental: { question: 'a?', variable: 'formato' }, reelTest: { recommended: true, because: 'a' } }),
    draft({ position: 1, pillar: 'home', experimental: { question: 'b?', variable: 'formato' }, reelTest: { recommended: true, because: 'b' } }),
  ];
  const b = guardrailBreaches(dois);
  assert.ok(b.some((x) => x.rule === 'um_experimento_por_vez'));
  assert.ok(b.some((x) => x.rule === 'reel_test_nao_e_default'));
});
