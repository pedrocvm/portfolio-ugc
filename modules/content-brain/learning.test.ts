import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LADDER_PHRASING,
  LEARNING_POLICY_V1,
  checkVoice,
  classifyLadder,
  influencesPlanning,
  missingProvenance,
  quoteIsGrounded,
  type PieceEvidence,
} from './domain';

const cohort = (over: Partial<PieceEvidence['cohort']> = {}) => ({
  platform: 'instagram',
  mediaType: 'REELS',
  snapshotKind: 't24h' as const,
  ...over,
});

const peca = (over: Partial<PieceEvidence> = {}): PieceEvidence => ({
  mediaId: `m${Math.random()}`,
  contentId: null,
  mechanismDeclared: true,
  cohort: cohort(),
  metrics: [{ name: 'comments', relativeToMedian: 2.1, alignedWithFunction: true }],
  externalCause: false,
  ...over,
});

/* ── A escada ─────────────────────────────────────────────────────────────── */

test('um conteúdo forte é sinal, nunca aprendizado validado', () => {
  const v = classifyLadder({
    mechanism: 'real_story_with_reaction',
    pillar: 'attraction_journey',
    evidence: [peca()],
    contradictions: [],
  });
  assert.equal(v.state, 'signal');
  assert.equal(v.sampleSize, 1);
  assert.match(LADDER_PHRASING[v.state], /não é padrão/i);
});

test('um conteúdo apenas acima da mediana fica em observação', () => {
  const v = classifyLadder({
    mechanism: 'x',
    pillar: null,
    evidence: [peca({ metrics: [{ name: 'comments', relativeToMedian: 1.4, alignedWithFunction: true }] })],
    contradictions: [],
  });
  assert.equal(v.state, 'observation');
});

test('três peças coerentes em duas métricas viram aprendizado validado', () => {
  const metrics = [
    { name: 'comments', relativeToMedian: 1.8, alignedWithFunction: true },
    { name: 'reach', relativeToMedian: 1.6, alignedWithFunction: true },
  ];
  const v = classifyLadder({
    mechanism: 'real_story_with_reaction',
    pillar: 'attraction_journey',
    evidence: [
      peca({ metrics, cohort: cohort() }),
      peca({ metrics, cohort: cohort({ mediaType: 'FEED' }) }),
      peca({ metrics, cohort: cohort() }),
    ],
    contradictions: [],
  });
  assert.equal(v.state, 'validated');
  assert.equal(v.sampleSize, 3);
  assert.equal(v.confidence, 'high');
});

test('duas peças coerentes chegam a hipótese e param aí', () => {
  const metrics = [
    { name: 'comments', relativeToMedian: 1.8, alignedWithFunction: true },
    { name: 'reach', relativeToMedian: 1.6, alignedWithFunction: true },
  ];
  const v = classifyLadder({ mechanism: 'x', pillar: null, evidence: [peca({ metrics }), peca({ metrics })], contradictions: [] });
  assert.equal(v.state, 'hypothesis');
});

test('mecanismo não declarado na estrutura não conta como evidência', () => {
  // Impede a IA de ler o vídeo depois e inventar «gancho de vulnerabilidade».
  const v = classifyLadder({
    mechanism: 'x',
    pillar: null,
    evidence: [peca({ mechanismDeclared: false }), peca({ mechanismDeclared: false }), peca({ mechanismDeclared: false })],
    contradictions: [],
  });
  assert.equal(v.state, 'observation');
  assert.equal(v.sampleSize, 0);
});

test('causa externa desqualifica a peça como prova', () => {
  const v = classifyLadder({ mechanism: 'x', pillar: null, evidence: [peca({ externalCause: true })], contradictions: [] });
  assert.equal(v.state, 'observation');
});

test('métrica desalinhada com a função do pilar não sustenta nada', () => {
  const v = classifyLadder({
    mechanism: 'x',
    pillar: 'authority_conversion',
    evidence: [
      peca({ metrics: [{ name: 'views', relativeToMedian: 3, alignedWithFunction: false }] }),
      peca({ metrics: [{ name: 'views', relativeToMedian: 3, alignedWithFunction: false }] }),
      peca({ metrics: [{ name: 'views', relativeToMedian: 3, alignedWithFunction: false }] }),
    ],
    contradictions: [],
  });
  assert.notEqual(v.state, 'validated');
});

test('contradições derrubam a hipótese em vez de a justificar', () => {
  const v = classifyLadder({
    mechanism: 'x',
    pillar: null,
    evidence: [peca()],
    contradictions: [peca(), peca()],
  });
  assert.equal(v.state, 'rejected');
  assert.match(LADDER_PHRASING.rejected, /não se sustentou/i);
});

test('só o validado ganha peso no planeamento', () => {
  assert.equal(influencesPlanning('validated'), 'weight');
  assert.equal(influencesPlanning('signal'), 'suggest');
  assert.equal(influencesPlanning('hypothesis'), 'suggest');
  assert.equal(influencesPlanning('observation'), 'none');
  assert.equal(influencesPlanning('rejected'), 'none');
});

test('os limiares estão rotulados como política, não como ciência', () => {
  assert.match(LEARNING_POLICY_V1.version, /POLICY_V1/);
  assert.equal(LEARNING_POLICY_V1.validatedMinEvidence, 3);
  assert.equal(LEARNING_POLICY_V1.validatedMinAgreeingMetrics, 2);
});

/* ── Proveniência ─────────────────────────────────────────────────────────── */

test('um insight de desempenho sem amostra nem método não passa', () => {
  const falta = missingProvenance({ kind: 'performance_evidence', source: 'instagram' });
  assert.deepEqual(falta.sort(), ['amostra', 'método'].sort());
  assert.deepEqual(
    missingProvenance({ kind: 'performance_evidence', source: 'instagram', sampleSize: 3, method: 'mediana t24h' }),
    [],
  );
});

test('uma afirmação sem fonte não passa', () => {
  assert.ok(missingProvenance({ kind: 'fact' }).includes('fonte'));
});

/* ── Voz ──────────────────────────────────────────────────────────────────── */

test('o filtro apanha jargão e pose de guru', () => {
  assert.equal(checkVoice('O segredo que ninguém te conta sobre UGC').ok, false);
  assert.equal(checkVoice('5 dicas para gravar melhor').ok, false);
  assert.equal(checkVoice('Isso vai mudar a tua vida').ok, false);
  assert.equal(checkVoice('Fiquei duas horas mexendo no cenário para no fim voltar ao primeiro').ok, true);
});

test('uma citação atribuída a ela tem de existir no material dela', () => {
  const fontes = ['fiquei tipo, pra quê fui mexer nisso', 'no fim o primeiro estava melhor'];
  assert.equal(quoteIsGrounded('pra quê fui mexer nisso', fontes), true);
  assert.equal(quoteIsGrounded('Pra quê fui mexer nisso?', fontes), true, 'pontuação e maiúscula não contam');
  // A frase artificial nomeada no briefing.
  assert.equal(quoteIsGrounded('O brief pedia sorriso. Eu gravei emburrada.', fontes), false);
});
