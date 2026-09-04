import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KNOWN_CONFLICTS,
  PRECEDENCE,
  deriveLearnings,
  effectivePrecedence,
  experimentSummary,
  lifecycleStage,
  resolveStrategy,
  type PerfRow,
} from './learning';

/* ── Precedência ──────────────────────────────────────────────────────────── */

test('a ordem é fixa: decisão dela, números, auditoria, mentoria, inferência', () => {
  assert.deepEqual([...PRECEDENCE], [
    'EXPLICIT_CAROL_DECISION', 'VERIFIED_PERFORMANCE', 'LATEST_PROFILE_AUDIT', 'MENTOR_PLAYBOOK', 'GENERIC_INFERENCE',
  ]);
});

test('a mentoria perde para a auditoria, e as duas perdem para uma decisão dela', () => {
  const r = resolveStrategy([
    { source: 'MENTOR_PLAYBOOK', claim: 'tutoriais de CapCut' },
    { source: 'LATEST_PROFILE_AUDIT', claim: 'nada de aula: prova de ofício' },
  ]);
  assert.equal(r.winner?.source, 'LATEST_PROFILE_AUDIT');

  const dela = resolveStrategy([
    { source: 'LATEST_PROFILE_AUDIT', claim: 'skincare é natural nela' },
    { source: 'EXPLICIT_CAROL_DECISION', claim: 'skincare fica fora' },
  ]);
  assert.equal(dela.winner?.claim, 'skincare fica fora');
});

test('um número com três peças ainda não é «verificado»', () => {
  assert.equal(effectivePrecedence({ source: 'VERIFIED_PERFORMANCE', claim: 'x', sampleSize: 2 }), 'GENERIC_INFERENCE');
  assert.equal(effectivePrecedence({ source: 'VERIFIED_PERFORMANCE', claim: 'x', sampleSize: 6, confidence: 'medium' }), 'VERIFIED_PERFORMANCE');
  // Com amostra, o número ganha à mentoria.
  const r = resolveStrategy([
    { source: 'MENTOR_PLAYBOOK', claim: 'B-roll de 6 s alcança mais' },
    { source: 'VERIFIED_PERFORMANCE', claim: 'talking head alcança mais nela', sampleSize: 9, confidence: 'medium' },
  ]);
  assert.equal(r.winner?.source, 'VERIFIED_PERFORMANCE');
});

test('os conflitos conhecidos estão resolvidos por escrito', () => {
  const edu = KNOWN_CONFLICTS.find((c) => c.id === 'education');
  assert.match(edu?.resolution ?? '', /prova de ofício/);
  const sk = KNOWN_CONFLICTS.find((c) => c.id === 'skincare');
  assert.equal(sk?.decidedBy, 'EXPLICIT_CAROL_DECISION');
  for (const c of KNOWN_CONFLICTS) assert.ok(c.resolution.length > 30, c.id);
});

/* ── Aprendizados ─────────────────────────────────────────────────────────── */

const row = (over: Partial<PerfRow>): PerfRow => ({
  ideaId: 'x', format: 'talking head', track: 'main', language: 'pt-BR', contentFunction: 'attract_connect',
  views: 1000, comments: 2, saves: 5, shares: 1, reach: 900, nonFollowerReach: 300, profileVisits: 4,
  ...over,
});

test('«talking head está gerando mais comentários que B-roll» sai dos números', () => {
  const rows = [
    ...[12, 14, 11, 13].map((c, i) => row({ ideaId: `th${i}`, format: 'talking head', comments: c })),
    ...[3, 4, 2, 3].map((c, i) => row({ ideaId: `br${i}`, format: 'B-roll de 6 s', comments: c })),
  ];
  const l = deriveLearnings(rows);
  assert.ok(l.length >= 1);
  const comentarios = l.find((x) => x.evidence.metric === 'comments');
  assert.ok(comentarios, 'faltou o aprendizado de comentários');
  assert.match(comentarios.statement, /Talking head está gerando mais comentários que B-roll/);
  assert.equal(comentarios.kind, 'OBSERVED_CAROL_SIGNAL');
  assert.equal(comentarios.confidence, 'low');
  assert.equal(comentarios.sampleSize, 8);
});

test('com menos de três peças por grupo não se conclui nada', () => {
  const rows = [
    row({ ideaId: 'a', format: 'talking head', comments: 20 }),
    row({ ideaId: 'b', format: 'talking head', comments: 20 }),
    row({ ideaId: 'c', format: 'B-roll', comments: 1 }),
  ];
  assert.deepEqual(deriveLearnings(rows), []);
});

test('no máximo três aprendizados, os mais fortes primeiro', () => {
  const rows = [
    ...[10, 12, 11].map((c, i) => row({ ideaId: `en${i}`, language: 'en', comments: c, saves: 30, shares: 9, nonFollowerReach: 800 })),
    ...[2, 3, 2].map((c, i) => row({ ideaId: `pt${i}`, language: 'pt-BR', comments: c, saves: 5, shares: 1, nonFollowerReach: 200 })),
  ];
  const l = deriveLearnings(rows);
  assert.ok(l.length <= 3);
  assert.match(l[0].statement, /Inglês está gerando mais/);
});

/* ── Experiências e ciclo ─────────────────────────────────────────────────── */

test('uma experiência resume-se em cinco linhas', () => {
  const s = experimentSummary({ kind: 'english_content', hypothesis: '', whatWeTest: '', result: null, learning: null, repeat: null, sampleSize: 0 });
  assert.match(s, /^HIPÓTESE: Um vídeo em inglês/);
  assert.match(s, /O QUE TESTAMOS/);
  assert.match(s, /RESULTADO: ainda sem peças medidas/);
});

test('o ciclo vai de ideia a candidata a feed', () => {
  assert.equal(lifecycleStage({ status: 'ready', track: 'reels_test', measurements: 0, hasLearning: false, promotionCandidate: false, variantOf: false }), 'idea');
  assert.equal(lifecycleStage({ status: 'published', track: 'reels_test', measurements: 0, hasLearning: false, promotionCandidate: false, variantOf: false }), 'test');
  assert.equal(lifecycleStage({ status: 'published', track: 'reels_test', measurements: 2, hasLearning: false, promotionCandidate: false, variantOf: false }), 'measure');
  assert.equal(lifecycleStage({ status: 'published', track: 'reels_test', measurements: 2, hasLearning: true, promotionCandidate: true, variantOf: false }), 'feed_candidate');
});
