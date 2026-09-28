import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOND_INTENTS,
  INTENTS,
  MIN_COMMENTS_FOR_READING,
  aggregateIntents,
  compareCommunity,
  type CommentInput,
  type Intent,
} from './community';
import { LEARNING_LEVEL_VIEW, readAgainstObjective, ladderView } from './outcome';

const comentarios = (spec: Partial<Record<Intent, number>>, extra = 0): CommentInput[] => {
  const out: CommentInput[] = [];
  let i = 0;
  for (const [intent, n] of Object.entries(spec)) {
    for (let k = 0; k < (n ?? 0); k += 1) {
      out.push({ id: `c${i++}`, intent: intent as Intent, confidence: 'medium' });
    }
  }
  for (let k = 0; k < extra; k += 1) out.push({ id: `c${i++}`, intent: null, confidence: null });
  return out;
};

/* ── Nem todo comentário vale o mesmo ─────────────────────────────────────── */

test('as oito intenções do PDF existem', () => {
  for (const i of ['identification', 'curiosity', 'question', 'own_experience',
                   'conversation', 'tag_share', 'generic_praise', 'purchase_intent']) {
    assert.ok((INTENTS as readonly string[]).includes(i), i);
  }
});

test('elogio superficial não conta como vínculo', () => {
  assert.ok(!BOND_INTENTS.includes('generic_praise'));
  const a = aggregateIntents(comentarios({ generic_praise: 12 }));
  assert.equal(a.bond, 0);
  assert.equal(a.praiseOnly, 12);
  assert.match(a.reading, /quase tudo elogio/);
});

test('quarenta elogios e quatro identificações não são a mesma comunidade', () => {
  const elogio = aggregateIntents(comentarios({ generic_praise: 40 }));
  const vinculo = aggregateIntents(comentarios({ identification: 20, own_experience: 12, question: 8 }));
  assert.equal(elogio.total, 40);
  assert.equal(vinculo.total, 40);
  assert.notEqual(elogio.bond, vinculo.bond);
  assert.match(vinculo.reading, /vínculo/);
});

test('amostra pequena diz-se em voz alta', () => {
  const a = aggregateIntents(comentarios({ identification: 3 }));
  assert.equal(a.tooSmall, true);
  assert.match(a.reading, /Poucos para dizer que é padrão/);
  assert.ok(MIN_COMMENTS_FOR_READING >= 10);
});

test('o que não foi classificado aparece, em vez de desaparecer da conta', () => {
  const a = aggregateIntents(comentarios({ identification: 4 }, 36));
  assert.equal(a.total, 40);
  assert.equal(a.classified, 4);
  assert.equal(a.unclassified, 36);
});

test('classificação de confiança baixa não entra na leitura', () => {
  const a = aggregateIntents([
    { id: '1', intent: 'identification', confidence: 'low' },
    { id: '2', intent: 'identification', confidence: 'high' },
  ]);
  assert.equal(a.classified, 1);
});

test('comparar duas amostras fracas não produz conclusão', () => {
  const a = aggregateIntents(comentarios({ identification: 3 }));
  const b = aggregateIntents(comentarios({ generic_praise: 3 }));
  assert.equal(compareCommunity(a, b), null);
});

test('com amostra suficiente, a comparação diz o que mudou', () => {
  const a = aggregateIntents(comentarios({ identification: 8, question: 6, own_experience: 4 }));
  const b = aggregateIntents(comentarios({ generic_praise: 16, identification: 2 }));
  const r = compareCommunity(a, b);
  assert.equal(r?.direction, 'better');
});

/* ── Julgar contra o objetivo ─────────────────────────────────────────────── */

test('uma peça é julgada contra o objetivo que tinha, não contra views', () => {
  const sinais = [
    { name: 'reach', value: 5000, relativeToMedian: 2.1 },
    { name: 'non_follower_reach', value: 3000, relativeToMedian: 1.8 },
    { name: 'shares', value: 20, relativeToMedian: 1.5 },
    { name: 'follows', value: 8, relativeToMedian: 1.4 },
    { name: 'saves', value: 1, relativeToMedian: 0.2 },
  ];
  const atrair = readAgainstObjective({ objective: 'attract', signals: sinais });
  assert.equal(atrair.outcome, 'met');

  // Os mesmos números, planeada para Reter, não cumprem.
  const reter = readAgainstObjective({ objective: 'retain', signals: sinais });
  assert.notEqual(reter.outcome, 'met');
});

test('sem sinal medido, o veredito é «ainda não dá para dizer»', () => {
  const r = readAgainstObjective({
    objective: 'prove',
    signals: [{ name: 'profile_visits', value: null, relativeToMedian: null }],
  });
  assert.equal(r.outcome, 'unknown');
  assert.ok(r.missing.length > 0);
});

test('a comunidade responde por sinais que a API não dá', () => {
  const comunidade = aggregateIntents(comentarios({ identification: 10, question: 6, own_experience: 4 }));
  const r = readAgainstObjective({
    objective: 'retain',
    signals: [{ name: 'saves', value: 3, relativeToMedian: 0.4 }],
    community: comunidade,
  });
  assert.ok(r.used.some((u) => u.name === 'qualified_interaction'));
  assert.notEqual(r.outcome, 'unknown');
});

test('comunidade pequena não empresta sinal nenhum', () => {
  const comunidade = aggregateIntents(comentarios({ identification: 2 }));
  const r = readAgainstObjective({
    objective: 'retain',
    signals: [],
    community: comunidade,
  });
  assert.equal(r.outcome, 'unknown');
});

/* ── A escada na linguagem do PDF ─────────────────────────────────────────── */

test('os seis degraus do código mostram-se como os quatro níveis do PDF', () => {
  assert.equal(LEARNING_LEVEL_VIEW.observation.level, 'observation');
  assert.equal(LEARNING_LEVEL_VIEW.signal.level, 'signal');
  assert.equal(LEARNING_LEVEL_VIEW.hypothesis.level, 'pattern');
  assert.equal(LEARNING_LEVEL_VIEW.testing.level, 'pattern');
  assert.equal(LEARNING_LEVEL_VIEW.validated.level, 'consolidated');
  assert.equal(ladderView('rejected').level, 'demoted');
});
