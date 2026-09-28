import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_PILLAR_TO_OBJECTIVE,
  SOT_TOPICS,
  pillarFromTerritories,
  type Pillar,
} from './editorial';
import { aggregateIntents, type CommentInput, type Intent } from './community';
import { dnaFromPack, formatMaturity } from './format-dna';
import { classifyLadder, influencesPlanning, type PieceEvidence } from './learning';
import { readAgainstObjective } from './outcome';
import { packGaps, packKindFor, parsePack } from './pack';
import { canTransition, type ProposalStatus } from './pipeline';
import { buildWeek, type ActiveLearning, type PriorityInput, type PublishedPiece, type TopicInput } from './priority';

/** A prova do ciclo.
 *
 *  ESTRATÉGIA → PRIORIDADE → VALIDAÇÃO → PRODUÇÃO → PUBLICAÇÃO → MEDIÇÃO →
 *  APRENDIZADO → PRÓXIMA PRIORIDADE.
 *
 *  Corre as funções reais em sequência, com dados fixos. O que está a ser
 *  provado não é que cada peça funciona — isso é dos outros testes — é que o
 *  fim liga ao princípio. Se o passo 13 não mudar a decisão seguinte, o ciclo
 *  continua partido, e este teste falha. */

const NOW = '2026-10-05T08:00:00.000Z';

const topics: TopicInput[] = SOT_TOPICS.filter((t) => t.state === 'now').map((t) => ({
  id: `t-${t.slug}`,
  slug: t.slug,
  pillar: t.pillar,
  label: t.label,
  howToTreat: t.howToTreat,
  state: 'now',
  lastUsedAt: null,
  useCount: 0,
}));

const base = (over: Partial<PriorityInput> = {}): PriorityInput => ({
  weekStart: '2026-10-05',
  now: NOW,
  focus: ['tech_ugc', 'canvas_ugc', 'career_building', 'community'],
  topics,
  published: [],
  events: [],
  learnings: [],
  formatGaps: [],
  references: [],
  runningExperiments: 0,
  ...over,
});

test('o ciclo fecha: da estratégia ao aprendizado, e do aprendizado à decisão seguinte', () => {
  /* 1. Foco Atual existe e o Mapa tem três pilares com assuntos. */
  const pilares = new Set<Pillar>(topics.map((t) => t.pillar));
  assert.equal(pilares.size, 3);

  /* 2-4. O Motor identifica o que falta e a semana recebe três propostas. */
  const publicadas: PublishedPiece[] = [0, 1, 2, 3].map((i) => ({
    id: `p${i}`,
    publishedAt: new Date(Date.parse(NOW) - (i + 1) * 4 * 24 * 60 * 60 * 1000).toISOString(),
    pillar: 'ugc_income',
    objective: 'attract',
    lens: 'what_i_do',
    topicSlug: null,
    format: 'reel',
    modality: 'none',
  }));

  const semana1 = buildWeek(base({ published: publicadas }));
  assert.equal(semana1.proposals.length, 3);
  assert.ok(semana1.proposals.some((p) => p.pillar !== 'ugc_income'), 'o perfil não é só trabalho');
  assert.ok(semana1.summary.length > 0);

  const escolhida = semana1.proposals[0];
  assert.ok(escolhida.evidence.length > 0, 'proposta sem evidência não devia existir');

  /* 5. Carol aprova. Nada antes disso gera roteiro. */
  assert.equal(
    canTransition('proposed', 'to_validate', { approved: false, validated: false }).ok,
    false,
  );
  let estado: ProposalStatus = 'proposed';
  assert.equal(canTransition(estado, 'approved_to_develop', { approved: true, validated: false }).ok, true);
  estado = 'approved_to_develop';

  /* 6. O Production Pack nasce, e nasce na forma do formato. */
  const kind = packKindFor(escolhida.format, escolhida.modality);
  const cru =
    kind === 'carousel'
      ? { cover: 'o que ninguém conta', slides: [{ index: 0, copy: 'a' }, { index: 1, copy: 'b' }], templateKey: 'carousel_editorial' }
      : kind === 'photo_sequence'
        ? { photos: [{ index: 0, role: 'abre' }, { index: 1, role: 'fecha' }] }
        : kind === 'story_sequence'
          ? { frames: [{ index: 0, role: 'abre', content: 'conto' }, { index: 1, role: 'fecha', content: 'fecho' }] }
          : kind === 'tech_ugc'
            ? { productUnderstanding: 'agenda', useSituation: 'salão', argument: 'não perde marcação', lines: [{ text: 'testei isto' }], interface: 'a tela de marcação' }
            : kind === 'canvas_ugc'
              ? { mechanic: 'corte seco', observedStructure: 'três batidas', execution: 'de uma vez' }
              : { hook: 'olha o que aconteceu', lines: [{ text: 'primeira' }, { text: 'segunda' }] };

  const pack = parsePack(kind, cru);
  assert.ok(pack.ok, `o pack de ${kind} tem de ser válido`);
  assert.deepEqual(packGaps(pack.pack), [], 'sem lacunas, pode ser validado');

  estado = 'to_validate';

  /* 7. Carol valida. Sem isso não há «pronto». */
  assert.equal(canTransition(estado, 'ready_to_produce', { approved: true, validated: false }).ok, false);
  assert.equal(canTransition(estado, 'ready_to_produce', { approved: true, validated: true }).ok, true);
  estado = 'ready_to_produce';

  /* 8-9. Produz, publica, e a mídia fica ligada. */
  for (const passo of ['in_production', 'published'] as ProposalStatus[]) {
    const r = canTransition(estado, passo, { approved: true, validated: true });
    assert.equal(r.ok, true, `${estado} → ${passo}`);
    estado = passo;
  }

  /* A assinatura sai do pack, não de um palpite. */
  const dna = dnaFromPack({ pack: pack.pack, format: escolhida.format, modality: escolhida.modality });
  assert.equal(dna.source, 'pack');
  assert.equal(dna.format, escolhida.format);

  /* 10. As métricas entram e são lidas contra o objetivo planeado. */
  const leitura = readAgainstObjective({
    objective: escolhida.objective,
    signals: [
      { name: 'reach', value: 4200, relativeToMedian: 1.9 },
      { name: 'non_follower_reach', value: 2600, relativeToMedian: 1.7 },
      { name: 'shares', value: 22, relativeToMedian: 1.6 },
      { name: 'follows', value: 9, relativeToMedian: 1.5 },
      { name: 'saves', value: 14, relativeToMedian: 1.8 },
      { name: 'profile_visits', value: 90, relativeToMedian: 1.9 },
      { name: 'qualified_interaction', value: 12, relativeToMedian: 1.8 },
      { name: 'identification', value: 8, relativeToMedian: 1.7 },
      { name: 'questions', value: 6, relativeToMedian: 1.6 },
    ],
  });
  assert.equal(leitura.outcome, 'met');

  /* 11. As interações são lidas como comunidade, não como contagem. */
  const comentarios: CommentInput[] = ([
    ...Array.from({ length: 9 }, () => 'identification'),
    ...Array.from({ length: 5 }, () => 'own_experience'),
    ...Array.from({ length: 4 }, () => 'question'),
    ...Array.from({ length: 3 }, () => 'generic_praise'),
  ] as Intent[]).map((intent, i) => ({ id: `c${i}`, intent, confidence: 'medium' }));
  const comunidade = aggregateIntents(comentarios);
  assert.equal(comunidade.tooSmall, false);
  assert.ok(comunidade.bond > comunidade.praiseOnly);

  /* 12. Nasce um aprendizado — e não nasce de uma peça só. */
  const peca = (mediaId: string, mediaType: string): PieceEvidence => ({
    mediaId,
    contentId: null,
    mechanismDeclared: true,
    cohort: {
      platform: 'instagram',
      mediaType,
      snapshotKind: 't7d',
      format: escolhida.format,
      objective: escolhida.objective,
      lens: escolhida.lens,
    },
    metrics: [
      { name: 'reach', relativeToMedian: 1.9, alignedWithFunction: true },
      { name: 'saves', relativeToMedian: 1.6, alignedWithFunction: true },
    ],
    externalCause: false,
  });

  const umaSo = classifyLadder({
    mechanism: 'pergunta no fim',
    pillar: null,
    evidence: [peca('m1', 'REELS')],
    contradictions: [],
  });
  assert.notEqual(umaSo.state, 'validated', '1 peça não vira padrão');

  const veredito = classifyLadder({
    mechanism: 'pergunta no fim',
    pillar: null,
    evidence: [peca('m1', 'REELS'), peca('m2', 'CAROUSEL_ALBUM'), peca('m3', 'REELS')],
    contradictions: [],
  });
  assert.equal(veredito.state, 'validated');
  assert.equal(influencesPlanning(veredito.state), 'weight');

  /* 13. O Motor seguinte consulta esse aprendizado. */
  const aprendizado: ActiveLearning = {
    id: 'l-loop',
    statement: 'Mostrar o critério por trás da decisão trouxe mais conversa sobre o trabalho.',
    influence: 'weight',
    format: escolhida.format,
    objective: 'prove',
    lens: null,
  };

  const semana2 = buildWeek(base({ published: publicadas, learnings: [aprendizado] }));
  const comEvidencia = semana2.proposals.find((p) =>
    p.evidence.some((e) => e.kind === 'learning' && e.refId === 'l-loop'),
  );

  /* 14. E a decisão seguinte regista essa evidência. */
  assert.ok(comEvidencia, 'o passo 13 não aconteceu: o aprendizado não chegou ao motor');
  assert.match(comEvidencia.whyNow, /critério/i);
  assert.notDeepEqual(
    semana2.proposals.map((p) => `${p.topicSlug}:${p.objective}`),
    semana1.proposals.map((p) => `${p.topicSlug}:${p.objective}`),
    'o aprendizado tem de mudar alguma coisa, senão o ciclo não fecha',
  );
});

test('a maturidade de formato sai da comparação, e volta ao motor como preferência', () => {
  const semAlternativa = formatMaturity({ dimension: 'format', value: 'reel', pieces: 11, above: 11, alternatives: 0 });
  assert.equal(semAlternativa.state, 'early_signal');

  const comparado = formatMaturity({ dimension: 'format', value: 'carousel', pieces: 4, above: 4, alternatives: 6, cohorts: 3 });
  assert.equal(comparado.state, 'consistent_pattern');

  const semana = buildWeek(base({
    formatGaps: [
      { format: 'carousel', state: 'consistent_pattern' },
      { format: 'reel', state: 'no_advantage' },
    ],
  }));
  assert.ok(semana.proposals.some((p) => p.format === 'carousel'));
  assert.ok(!semana.proposals.some((p) => p.format === 'reel'));
});

/* ── Reconciliação do que já existia ──────────────────────────────────────── */

test('a peça antiga ganha objetivo do pilar funcional, e pilar só quando é inequívoco', () => {
  assert.equal(LEGACY_PILLAR_TO_OBJECTIVE.attraction_journey, 'attract');
  assert.equal(LEGACY_PILLAR_TO_OBJECTIVE.authority_conversion, 'prove');

  assert.equal(pillarFromTerritories(['brand_work', 'creative_process']), 'ugc_income');
  assert.equal(pillarFromTerritories(['hospitality']), 'experiences');
  assert.equal(pillarFromTerritories(['pets', 'home']), 'home');

  // Ambíguo fica desconhecido. Adivinhar aqui punha Casa no lugar de trabalho.
  assert.equal(pillarFromTerritories(['brand_work', 'pets']), null);
  // `tech` não tem casa óbvia, e `portugal_brazil` não vira pauta por backfill.
  assert.equal(pillarFromTerritories(['tech']), null);
  assert.equal(pillarFromTerritories(['portugal_brazil']), null);
  assert.equal(pillarFromTerritories([]), null);
});
