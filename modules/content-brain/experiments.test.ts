import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPERIMENT_POLICY_V1,
  compareMetric,
  experimentReady,
  experimentVerdict,
  matchedWindow,
  statusAfter,
  type Arm,
} from './experiments';

const arm = (label: string, rows: [string, string, Record<string, number | null>][]): Arm => ({
  label,
  readings: rows.map(([mediaId, kind, metrics]) => ({ mediaId, snapshotKind: kind as Arm['readings'][number]['snapshotKind'], metrics })),
});

/* ── Idade ────────────────────────────────────────────────────────────────── */

test('só se comparam leituras da mesma idade', () => {
  const controlo = arm('A', [['a1', 't24h', { shares: 10 }], ['a2', 't24h', { shares: 12 }]]);
  const variante = arm('B', [['b1', 't7d', { shares: 90 }], ['b2', 't7d', { shares: 100 }]]);
  assert.equal(matchedWindow(controlo, variante, 'shares'), null, 'T+24h contra 7 dias não é comparação');
  assert.equal(compareMetric(controlo, variante, 'shares').direction, 'unknown');
});

test('quando há várias janelas, escolhe a que tem mais peças dos dois lados', () => {
  const controlo = arm('A', [['a1', 't24h', { shares: 10 }], ['a2', 't7d', { shares: 20 }], ['a3', 't7d', { shares: 22 }]]);
  const variante = arm('B', [['b1', 't24h', { shares: 11 }], ['b2', 't7d', { shares: 30 }], ['b3', 't7d', { shares: 34 }]]);
  assert.equal(matchedWindow(controlo, variante, 'shares')!.kind, 't7d');
});

test('métrica ausente sai da amostra e não entra como zero', () => {
  const controlo = arm('A', [['a1', 't24h', { shares: 10 }], ['a2', 't24h', { shares: null }], ['a3', 't24h', { shares: 12 }]]);
  const variante = arm('B', [['b1', 't24h', { shares: 20 }], ['b2', 't24h', { shares: 22 }]]);
  const c = compareMetric(controlo, variante, 'shares');
  assert.equal(c.sample.control, 2, 'o null não conta como peça medida');
  assert.equal(c.controlMedian, 11, 'nem puxa a mediana para baixo como se fosse zero');
});

/* ── Veredito ─────────────────────────────────────────────────────────────── */

const vazio = arm('A', []);

test('sem leitura nenhuma o teste fica pendente, não inconclusivo', () => {
  const v = experimentVerdict({ control: vazio, variant: vazio, primaryMetric: 'shares' });
  assert.equal(v.outcome, 'pending');
  assert.equal(experimentReady(v), false);
});

test('um braço vazio não dá veredito, por mais forte que o outro esteja', () => {
  const v = experimentVerdict({
    control: arm('A', [['a1', 't24h', { shares: 1 }], ['a2', 't24h', { shares: 1 }]]),
    variant: arm('B', []),
    primaryMetric: 'shares',
  });
  assert.equal(v.outcome, 'inconclusive');
  assert.equal(v.repeatWorth, true);
});

test('uma diferença pequena é ruído, não resultado', () => {
  const v = experimentVerdict({
    control: arm('A', [['a1', 't24h', { shares: 100 }], ['a2', 't24h', { shares: 100 }]]),
    variant: arm('B', [['b1', 't24h', { shares: 105 }], ['b2', 't24h', { shares: 105 }]]),
    primaryMetric: 'shares',
  });
  assert.equal(v.outcome, 'inconclusive');
  assert.match(v.because, /dentro do que varia sozinho/);
});

test('uma diferença material com amostra pequena é sinal, nunca prova', () => {
  const v = experimentVerdict({
    control: arm('A', [['a1', 't24h', { shares: 10 }], ['a2', 't24h', { shares: 10 }]]),
    variant: arm('B', [['b1', 't24h', { shares: 20 }], ['b2', 't24h', { shares: 20 }]]),
    primaryMetric: 'shares',
  });
  assert.equal(v.outcome, 'favourable');
  assert.match(v.because, /É um sinal, não uma prova/);
  assert.equal(v.repeatWorth, true);
});

test('com amostra dos dois lados e nada a contradizer, a evidência é consistente', () => {
  const v = experimentVerdict({
    control: arm('A', [['a1', 't24h', { shares: 10, saves: 5 }], ['a2', 't24h', { shares: 10, saves: 5 }], ['a3', 't24h', { shares: 10, saves: 5 }]]),
    variant: arm('B', [['b1', 't24h', { shares: 20, saves: 9 }], ['b2', 't24h', { shares: 20, saves: 9 }], ['b3', 't24h', { shares: 20, saves: 9 }]]),
    primaryMetric: 'shares',
    secondaryMetrics: ['saves'],
  });
  assert.equal(v.outcome, 'consistent');
  assert.deepEqual(v.supporting, ['saves']);
  assert.equal(v.repeatWorth, false);
});

test('uma métrica secundária que contradiz é sempre dita, e derruba a consistência', () => {
  const v = experimentVerdict({
    control: arm('A', [['a1', 't24h', { shares: 10, saves: 10 }], ['a2', 't24h', { shares: 10, saves: 10 }], ['a3', 't24h', { shares: 10, saves: 10 }]]),
    variant: arm('B', [['b1', 't24h', { shares: 20, saves: 4 }], ['b2', 't24h', { shares: 20, saves: 4 }], ['b3', 't24h', { shares: 20, saves: 4 }]]),
    primaryMetric: 'shares',
    secondaryMetrics: ['saves'],
  });
  assert.deepEqual(v.contradicting, ['saves']);
  assert.notEqual(v.outcome, 'consistent');
  assert.match(v.because, /sentido contrário/);
  assert.equal(v.repeatWorth, true);
});

test('descer numa métrica onde menos é melhor é sinal favorável, não contrário', () => {
  const desce = {
    control: arm('A', [['a1', 't24h', { skip: 60 }], ['a2', 't24h', { skip: 60 }]]),
    variant: arm('B', [['b1', 't24h', { skip: 30 }], ['b2', 't24h', { skip: 30 }]]),
    primaryMetric: 'skip',
  };
  assert.equal(experimentVerdict({ ...desce, higherIsBetter: false }).outcome, 'favourable');
  assert.equal(experimentVerdict(desce).outcome, 'contrary', 'com a direção por omissão, a mesma queda lê-se ao contrário');
});

test('o veredito nunca diz que a variante venceu', () => {
  const v = experimentVerdict({
    control: arm('introdução contextual', [['a1', 't24h', { shares: 10 }], ['a2', 't24h', { shares: 10 }], ['a3', 't24h', { shares: 10 }]]),
    variant: arm('demonstração imediata', [['b1', 't24h', { shares: 30 }], ['b2', 't24h', { shares: 30 }], ['b3', 't24h', { shares: 30 }]]),
    primaryMetric: 'shares',
  });
  assert.doesNotMatch(v.because, /venceu|ganhou|vencedor/i);
  assert.match(v.because, /sobre 3 contra 3 peças/);
  assert.match(v.because, /mediana 10 contra 30/);
});

/* ── Estado ───────────────────────────────────────────────────────────────── */

test('um teste medido nunca vira aprendizado sozinho: isso é decisão dela', () => {
  const v = experimentVerdict({
    control: arm('A', [['a1', 't24h', { shares: 10 }], ['a2', 't24h', { shares: 10 }], ['a3', 't24h', { shares: 10 }]]),
    variant: arm('B', [['b1', 't24h', { shares: 30 }], ['b2', 't24h', { shares: 30 }], ['b3', 't24h', { shares: 30 }]]),
    primaryMetric: 'shares',
  });
  assert.equal(statusAfter('running', v), 'measured');
  assert.equal(statusAfter('learned', v), 'learned');
  assert.equal(statusAfter('paused', v), 'paused', 'um teste em pausa não recomeça sozinho');
});

test('a política mínima por braço é o que governa o «já dá para olhar»', () => {
  const quase = experimentVerdict({
    control: arm('A', [['a1', 't24h', { shares: 10 }]]),
    variant: arm('B', [['b1', 't24h', { shares: 30 }]]),
    primaryMetric: 'shares',
  });
  assert.equal(EXPERIMENT_POLICY_V1.minPerArm, 2);
  assert.equal(experimentReady(quase), false);
});

/* ── Mediana, não média ───────────────────────────────────────────────────── */

test('um outlier num braço não decide o teste: a estatística é a mediana', () => {
  // Três peças de controlo: 10, 10 e uma de 100. A média do braço é 40 e
  // descreve o outlier; a mediana é 10 e descreve o braço. Com a média, este
  // teste leria uma QUEDA de 50%; com a mediana, uma subida de 100%.
  const v = experimentVerdict({
    control: arm('A', [['a1', 't24h', { shares: 10 }], ['a2', 't24h', { shares: 10 }], ['a3', 't24h', { shares: 100 }]]),
    variant: arm('B', [['b1', 't24h', { shares: 20 }], ['b2', 't24h', { shares: 20 }], ['b3', 't24h', { shares: 20 }]]),
    primaryMetric: 'shares',
  });
  assert.equal(v.primary.controlMedian, 10, 'a mediana do controlo é 10, não a média 40');
  assert.equal(v.primary.variantMedian, 20);
  assert.equal(v.primary.diff, 1, 'o dobro da mediana, não metade da média');
  assert.equal(v.primary.direction, 'up');
});

test('a mediana de um número par de peças é a média das duas do meio', () => {
  const v = experimentVerdict({
    control: arm('A', [['a1', 't24h', { shares: 10 }], ['a2', 't24h', { shares: 30 }]]),
    variant: arm('B', [['b1', 't24h', { shares: 100 }], ['b2', 't24h', { shares: 100 }]]),
    primaryMetric: 'shares',
  });
  assert.equal(v.primary.controlMedian, 20);
});
