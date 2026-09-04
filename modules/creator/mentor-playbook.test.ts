import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTENT_FUNCTIONS,
  EDITORIAL_MODES,
  EXPERIMENT_SPEC,
  FUNCTION_SPEC,
  KNOWLEDGE_KINDS,
  MENTOR_PLAYBOOK,
  MENTOR_SOURCE,
  PERFORMANCE_HEURISTICS,
  PLAYBOOK_RULES,
  REELS_TEST_POLICY,
  WRITTEN_HOOK_TYPES,
  describePlaybook,
  knowledgeKindOf,
  playbookForScreen,
  ruleById,
} from './mentor-playbook';

/* ── O playbook é uma estrutura versionada, não um parágrafo ─────────────── */

test('o playbook tem versão, fonte e a proveniência do Gemini escrita', () => {
  assert.equal(MENTOR_PLAYBOOK.version, 'MENTOR_PLAYBOOK_V1');
  assert.equal(MENTOR_SOURCE.effectiveAt, '2026-09-01');
  assert.match(MENTOR_SOURCE.recordedBy, /Gemini/);
  // Alta sobre estratégia; nenhuma sobre o algoritmo. Tem de estar escrito onde
  // alguém o lê antes de citar «2000 views é bom» como fato.
  assert.match(MENTOR_SOURCE.authority, /none as evidence about the platform algorithm/);
});

test('os dois eixos existem e não são o mesmo', () => {
  assert.deepEqual([...CONTENT_FUNCTIONS], ['attract_connect', 'educate_retain', 'convert']);
  assert.deepEqual([...EDITORIAL_MODES], ['authority', 'entertainment', 'information', 'personal']);
  const soma = CONTENT_FUNCTIONS.reduce((s, f) => s + FUNCTION_SPEC[f].targetShare, 0);
  assert.ok(Math.abs(soma - 1) < 0.001, `os alvos das funções somam ${soma}`);
});

test('os cinco tipos de gancho escrito da mentora estão representados', () => {
  assert.deepEqual([...WRITTEN_HOOK_TYPES], ['identification', 'experience', 'emotion', 'teaching', 'update']);
});

/* ── Regra, heurística, experiência: não se trata tudo igual ─────────────── */

test('regra, heurística e experiência estão separadas', () => {
  assert.deepEqual([...KNOWLEDGE_KINDS], [
    'MENTOR_RULE', 'MENTOR_HEURISTIC', 'MENTOR_EXPERIMENT', 'OBSERVED_CAROL_SIGNAL', 'CANONICAL_BUSINESS_POLICY',
  ]);
  assert.equal(ruleById('lens')?.kind, 'MENTOR_RULE');
  assert.equal(ruleById('frequency')?.kind, 'MENTOR_EXPERIMENT');
  assert.equal(ruleById('weak_test')?.kind, 'MENTOR_HEURISTIC');
  assert.equal(ruleById('skincare_out')?.kind, 'CANONICAL_BUSINESS_POLICY');
});

test('a frequência de três a cinco por dia não é lei', () => {
  assert.equal(REELS_TEST_POLICY.frequency.kind, 'MENTOR_EXPERIMENT');
  assert.equal(REELS_TEST_POLICY.frequency.min, 3);
  assert.equal(REELS_TEST_POLICY.frequency.max, 5);
});

test('os números da mentora são heurísticas, com a nota a dizê-lo', () => {
  assert.equal(PERFORMANCE_HEURISTICS.kind, 'MENTOR_HEURISTIC');
  assert.equal(PERFORMANCE_HEURISTICS.worthAnalysingViews, 2000);
  assert.equal(PERFORMANCE_HEURISTICS.feedCandidateViews, 3000);
  assert.match(PERFORMANCE_HEURISTICS.note, /Não é um fato sobre o Instagram/);
});

test('uma frase nova da mentoria classifica-se pelo que é', () => {
  assert.equal(knowledgeKindOf('Estou mostrando o que está por trás do meu trabalho?'), 'MENTOR_RULE');
  assert.equal(knowledgeKindOf('2000 views é bom'), 'MENTOR_HEURISTIC');
  assert.equal(knowledgeKindOf('3 a 5 testes por dia'), 'MENTOR_EXPERIMENT');
  assert.equal(knowledgeKindOf('Testar conteúdo em inglês'), 'MENTOR_EXPERIMENT');
});

/* ── O que a mentora ensinou está lá, e está resolvido com a auditoria ───── */

test('a lente central existe e é regra', () => {
  assert.equal(MENTOR_PLAYBOOK.strategicLens, 'Estou mostrando o que está por trás do meu trabalho?');
  assert.match(ruleById('lens')?.rule ?? '', /por trás/);
});

test('o conteúdo técnico é prova de ofício, não aula', () => {
  const r = ruleById('technical_content');
  assert.ok(r);
  assert.match(r.rule, /nunca como aula/);
  assert.match(r.why, /quase descartei esse take/);
});

test('skincare continua fora, e maquiagem é experimental', () => {
  assert.match(ruleById('skincare_out')?.rule ?? '', /fora/);
  assert.equal(ruleById('aesthetic_experimental')?.kind, 'MENTOR_EXPERIMENT');
  assert.equal(EXPERIMENT_SPEC.aesthetic_territory.whatWeTest.includes('nunca como prioridade comercial'), true);
});

test('o Reels Test é para público frio, com remate simples', () => {
  assert.match(REELS_TEST_POLICY.purpose, /público frio/);
  assert.ok(REELS_TEST_POLICY.excluded.includes('conversão direta'));
  assert.deepEqual([...REELS_TEST_POLICY.cta.preferred], ['seguir', 'salvar', 'comentar']);
  assert.equal(REELS_TEST_POLICY.brollFormat.minSeconds, 5);
  assert.equal(REELS_TEST_POLICY.brollFormat.maxSeconds, 7);
});

test('Braga Real está no playbook como série, com o olhar de sala', () => {
  const braga = MENTOR_PLAYBOOK.seriesConcepts[0];
  assert.equal(braga.name, 'Braga Real');
  assert.ok(braga.avoid.includes('top 5 lugares instagramáveis'));
  assert.equal(braga.pillar, 'A_SALA');
});

/* ── O que vai para o modelo e o que vai para a tela ─────────────────────── */

test('o playbook dito ao modelo aplica, não recita', () => {
  const texto = describePlaybook();
  assert.match(texto, /TRÊS GANCHOS/);
  assert.match(texto, /NUNCA a concorrência/);
  assert.match(texto, /B-roll que JÁ EXISTE/);
  assert.match(texto, /Nunca «5 dicas de iluminação»/);
  // Heurísticas com número não vão para o prompt: o modelo não decide se 2000
  // views é bom; quem decide é o motor, contra a linha de base dela.
  assert.doesNotMatch(texto, /2000/);
  assert.doesNotMatch(texto, /3 a 5/);
});

test('a tela de estratégia tem as três listas', () => {
  const s = playbookForScreen();
  assert.ok(s.following.length >= 10);
  assert.ok(s.testing.some((t) => t.kind === 'english_content'));
  assert.ok(s.heuristics.every((h) => h.kind === 'MENTOR_HEURISTIC' || h.kind === 'MENTOR_EXPERIMENT'));
  for (const r of PLAYBOOK_RULES) assert.ok(r.why.length > 20, `${r.id} sem porquê`);
});
