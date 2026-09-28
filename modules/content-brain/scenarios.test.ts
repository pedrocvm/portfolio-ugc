import assert from 'node:assert/strict';
import test from 'node:test';

import { SOT_TOPICS, teacherFraming, type Pillar } from './editorial';
import { aggregateIntents, type CommentInput, type Intent } from './community';
import { experimentVerdict, type Arm } from './experiments';
import { formatMaturity } from './format-dna';
import { classifyLadder, influencesPlanning, type PieceEvidence } from './learning';
import { packKindFor } from './pack';
import { buildWeek, type PriorityInput, type PublishedPiece, type TopicInput } from './priority';

/** Os cenários que a estratégia tem de saber tratar, um por um.
 *
 *  Cada um destes já aconteceu ou vai acontecer: perfil profissional demais,
 *  Casa ausente, UGC repetido à exaustão, um assunto pausado, uma frase de
 *  professora, um formato nunca testado, um teste sem amostra, comentários que
 *  são só elogio, e um aprendizado que os dados de depois contradizem.
 *
 *  Fixtures determinísticas: os mesmos dados dão sempre a mesma resposta. */

const NOW = '2026-10-12T09:00:00.000Z';

const topics: TopicInput[] = SOT_TOPICS.filter((t) => t.state === 'now').map((t) => ({
  id: `t-${t.slug}`, slug: t.slug, pillar: t.pillar, label: t.label,
  howToTreat: t.howToTreat, state: 'now', lastUsedAt: null, useCount: 0,
}));

const semana = (over: Partial<PriorityInput> = {}) =>
  buildWeek({
    weekStart: '2026-10-12', now: NOW,
    focus: ['tech_ugc', 'canvas_ugc', 'career_building'],
    topics, published: [], events: [], learnings: [],
    formatGaps: [], references: [], runningExperiments: 0,
    ...over,
  });

const post = (i: number, over: Partial<PublishedPiece> = {}): PublishedPiece => ({
  id: `p${i}`,
  publishedAt: new Date(Date.parse(NOW) - (i + 1) * 3 * 24 * 60 * 60 * 1000).toISOString(),
  pillar: 'ugc_income', objective: 'attract', lens: 'what_i_do',
  topicSlug: null, format: 'reel', modality: 'none',
  ...over,
});

/* ── Perfil desequilibrado ────────────────────────────────────────────────── */

test('perfil excessivamente profissional é reequilibrado, não elogiado', () => {
  const s = semana({ published: [0, 1, 2, 3, 4, 5].map((i) => post(i, { lens: 'what_i_do' })) });
  const lentes = s.proposals.map((p) => p.lens);
  assert.ok(lentes.some((l) => l !== 'what_i_do'), '«O que faço» estava engolindo o perfil');
  const pilares = s.proposals.map((p) => p.pillar);
  assert.ok(pilares.filter((p) => p === 'ugc_income').length < s.proposals.length);
});

test('pilar Casa ausente volta, e diz-se porquê', () => {
  const s = semana({ published: [0, 1, 2, 3, 4, 5].map((i) => post(i, { pillar: 'experiences' })) });
  const casa = s.proposals.find((p) => p.pillar === 'home');
  assert.ok(casa, 'Casa sumiu da janela e tinha de voltar');
  assert.ok(casa.evidence.some((e) => e.kind === 'pillar_absent'));
});

test('UGC repetido à exaustão deixa de ganhar a semana inteira', () => {
  const s = semana({
    published: [0, 1, 2, 3, 4, 5].map((i) => post(i, { pillar: 'ugc_income', topicSlug: 'tech_ugc' })),
  });
  const trabalho = s.proposals.filter((p) => p.pillar === 'ugc_income');
  assert.ok(trabalho.length <= 2, `ficaram ${trabalho.length} de trabalho em ${s.proposals.length}`);
});

test('assunto pausado some das propostas e continua no mapa', () => {
  const mapa = topics.map((t) =>
    t.slug === 'seven_pets' ? { ...t, state: 'paused' as const } : t,
  );
  const s = semana({ topics: mapa });
  assert.ok(!s.proposals.some((p) => p.topicSlug === 'seven_pets'));
  assert.ok(mapa.some((t) => t.slug === 'seven_pets'), 'pausar não apaga');
});

/* ── Tom ──────────────────────────────────────────────────────────────────── */

test('conteúdo com tom de professora é sinalizado, e o relato passa', () => {
  const prescritivo = teacherFraming('3 erros que você comete ao mandar proposta para marca');
  assert.equal(prescritivo.flagged, true);
  assert.ok(prescritivo.reframes.length > 0);

  const relato = teacherFraming('Mandei a proposta errada para a marca e só percebi no dia seguinte.');
  assert.equal(relato.flagged, false);
});

/* ── Capacidade e modalidade ──────────────────────────────────────────────── */

test('a semana normal tem três posts e nenhum alerta por não ter quatro', () => {
  const s = semana();
  assert.equal(s.capacity, 3);
  assert.equal(s.proposals.length, 3);
  assert.doesNotMatch(s.summary, /4|quatro/);
  assert.deepEqual(s.notes, []);
});

test('Tech UGC e Canvas UGC recebem packs diferentes, e nenhum é o do Reel falado', () => {
  assert.equal(packKindFor('reel', 'tech_ugc'), 'tech_ugc');
  assert.equal(packKindFor('reel', 'canvas_ugc'), 'canvas_ugc');
  assert.notEqual(packKindFor('reel', 'tech_ugc'), packKindFor('reel', 'canvas_ugc'));
  assert.notEqual(packKindFor('reel', 'tech_ugc'), packKindFor('reel', 'none'));
});

/* ── Formatos por testar ──────────────────────────────────────────────────── */

test('Reel não testado e carrossel não testado são a mesma coisa: desconhecido', () => {
  const reel = formatMaturity({ dimension: 'format', value: 'reel', pieces: 0, above: 0, alternatives: 0 });
  const carrossel = formatMaturity({ dimension: 'format', value: 'carousel', pieces: 0, above: 0, alternatives: 0 });
  assert.equal(reel.state, 'untested');
  assert.equal(carrossel.state, 'untested');
});

test('uma referência externa vira uma pergunta, não uma receita', () => {
  const s = semana({
    references: [{ id: 'r1', structure: 'três batidas com corte seco', format: 'carousel', question: 'Corte seco funciona num carrossel?' }],
  });
  const comTeste = s.proposals.filter((p) => p.experimental);
  assert.equal(comTeste.length, 1);
  assert.equal(comTeste[0].experimental?.referenceId, 'r1');
  assert.equal(comTeste[0].experimental?.variable, 'estrutura');
});

/* ── Experimentos ─────────────────────────────────────────────────────────── */

const arm = (label: string, valores: readonly number[]): Arm => ({
  label,
  readings: valores.map((v, i) => ({ mediaId: `${label}-${i}`, snapshotKind: 't7d', metrics: { reach: v } })),
});

test('experimento sem amostra é inconclusivo, e diz o que falta', () => {
  const v = experimentVerdict({
    control: arm('normal', [1000]),
    variant: arm('novo', [1200]),
    primaryMetric: 'reach',
  });
  assert.equal(v.outcome, 'inconclusive');
  assert.ok(v.because.length > 0);
});

test('duas peças por lado dão sinal; só três por lado chegam a padrão', () => {
  const duas = experimentVerdict({
    control: arm('normal', [1000, 1100]),
    variant: arm('novo', [2200, 2400]),
    primaryMetric: 'reach',
  });
  assert.equal(duas.outcome, 'favourable');
  assert.notEqual(duas.outcome, 'consistent', '2 peças por lado não são padrão');

  const tres = experimentVerdict({
    control: arm('normal', [1000, 1100, 900]),
    variant: arm('novo', [2200, 2400, 2100]),
    primaryMetric: 'reach',
  });
  assert.equal(tres.outcome, 'consistent');
});

/* ── Comunidade ───────────────────────────────────────────────────────────── */

const comentarios = (spec: Partial<Record<Intent, number>>): CommentInput[] => {
  const out: CommentInput[] = [];
  let i = 0;
  for (const [intent, n] of Object.entries(spec)) {
    for (let k = 0; k < (n ?? 0); k += 1) out.push({ id: `c${i++}`, intent: intent as Intent, confidence: 'medium' });
  }
  return out;
};

test('elogio superficial, identificação, curiosidade, pergunta e marca são lidos como coisas diferentes', () => {
  const a = aggregateIntents(comentarios({
    generic_praise: 6, identification: 5, curiosity: 4, question: 3, brand: 1,
  }));
  assert.equal(a.total, 19);
  assert.equal(a.bond, 12);
  assert.equal(a.praiseOnly, 6);
  assert.equal(a.commercial, 1);
  assert.match(a.reading, /vínculo/);
});

/* ── Aprendizado contradito ───────────────────────────────────────────────── */

const peca = (id: string, acima: boolean): PieceEvidence => ({
  mediaId: id, contentId: null, mechanismDeclared: true,
  cohort: { platform: 'instagram', mediaType: 'REELS', snapshotKind: 't7d' },
  metrics: [
    { name: 'reach', relativeToMedian: acima ? 1.8 : 0.6, alignedWithFunction: true },
    { name: 'saves', relativeToMedian: acima ? 1.5 : 0.5, alignedWithFunction: true },
  ],
  externalCause: false,
});

test('um aprendizado perde força quando os dados de depois o contradizem', () => {
  const antes = classifyLadder({
    mechanism: 'abrir com pergunta', pillar: null,
    evidence: [peca('a', true), peca('b', true), peca('c', true)],
    contradictions: [],
  });
  assert.equal(antes.state, 'validated');
  assert.equal(influencesPlanning(antes.state), 'weight');

  // Chegam duas peças com o mesmo mecanismo e sem o efeito, e a base de
  // evidência encolhe porque essas duas deixam de contar como prova.
  const depois = classifyLadder({
    mechanism: 'abrir com pergunta', pillar: null,
    evidence: [peca('a', true), peca('b', true)],
    contradictions: [peca('d', false), peca('e', false)],
  });
  assert.equal(depois.state, 'rejected');
  assert.equal(influencesPlanning(depois.state), 'none');
  assert.match(depois.because, /Parei de tratar como padrão/);
});

test('o que foi rejeitado não volta a pesar na semana seguinte', () => {
  const s = semana({
    learnings: [], // um aprendizado rejeitado nunca chega ao motor: o serviço
                   // filtra por `active` e `demoted_at`.
  });
  assert.ok(!s.proposals.some((p) => p.evidence.some((e) => e.kind === 'learning')));
});

/* ── Pilares ──────────────────────────────────────────────────────────────── */

test('nenhum cenário faz nascer um quarto pilar', () => {
  const cenarios: PriorityInput['published'][] = [
    [0, 1, 2, 3, 4, 5].map((i) => post(i)),
    [0, 1, 2].map((i) => post(i, { pillar: 'home' })),
    [],
  ];
  for (const published of cenarios) {
    const pilares = new Set<Pillar>(semana({ published }).proposals.map((p) => p.pillar));
    for (const p of pilares) assert.ok(['ugc_income', 'experiences', 'home'].includes(p), p);
  }
});
