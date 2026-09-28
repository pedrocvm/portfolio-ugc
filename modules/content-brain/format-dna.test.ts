import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DNA_DIMENSIONS,
  durationBandOf,
  dnaFromMedia,
  dnaFromPack,
  formatMaturity,
  maturityInfluence,
  unknownDimensions,
} from './format-dna';
import { emptyPack, parsePack } from './pack';

/* ── A assinatura sai do pack ─────────────────────────────────────────────── */

test('o DNA vem do pack, que é onde alguém decidiu', () => {
  const p = parsePack('spoken_reel', {
    hook: 'x',
    lines: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }],
    scenes: [{ order: 0, what: 'cozinha' }, { order: 1, what: 'sala' }],
  });
  assert.ok(p.ok);
  const dna = dnaFromPack({ pack: p.pack, format: 'reel', modality: 'none', durationSeconds: 32 });
  assert.equal(dna.source, 'pack');
  assert.equal(dna.confidence, 'high');
  assert.equal(dna.presentation, 'talking_head');
  assert.equal(dna.construction, 'multi_scene');
  assert.equal(dna.durationBand, '20_40s');
  assert.equal(dna.pace, 'medium');
});

test('Tech UGC com gravação de tela muda presença e apresentação', () => {
  const p = parsePack('tech_ugc', {
    productUnderstanding: 'a', useSituation: 'b', argument: 'c',
    lines: [{ text: 'd' }],
    screenRecordings: [{ kind: 'screen_recording', what: 'o fluxo de marcação', ready: true }],
  });
  assert.ok(p.ok);
  const dna = dnaFromPack({ pack: p.pack, format: 'reel', modality: 'tech_ugc' });
  assert.equal(dna.presentation, 'screen_recording');
  assert.equal(dna.presence, 'product_interface');
  assert.equal(dna.modality, 'tech_ugc');
  assert.equal(dna.format, 'reel', 'modalidade e formato são eixos diferentes');
});

test('o que o pack não diz fica nulo, e diz-se que ficou', () => {
  const dna = dnaFromPack({ pack: emptyPack('carousel'), format: 'carousel', modality: 'none' });
  assert.equal(dna.pace, null);
  assert.equal(dna.audio, null);
  assert.ok(unknownDimensions(dna).includes('pace'));
  assert.ok(unknownDimensions(dna).includes('durationBand'));
});

test('sem pack, a inferência é marcada como inferência', () => {
  const dna = dnaFromMedia({ mediaType: 'VIDEO', mediaProductType: 'REELS', caption: '' });
  assert.equal(dna.source, 'inferred');
  assert.equal(dna.confidence, 'low');
  assert.equal(dna.format, 'reel');
  assert.equal(dna.presentation, null, 'não se adivinha apresentação a partir de nada');
});

test('as faixas de duração não deixam buracos', () => {
  assert.equal(durationBandOf(5), 'under_10s');
  assert.equal(durationBandOf(10), '10_20s');
  assert.equal(durationBandOf(20), '20_40s');
  assert.equal(durationBandOf(60), '40_60s');
  assert.equal(durationBandOf(61), 'over_60s');
  assert.equal(durationBandOf(null), null);
});

test('as dez dimensões do PDF estão todas representadas', () => {
  assert.equal(DNA_DIMENSIONS.length, 10);
});

/* ── Maturidade ───────────────────────────────────────────────────────────── */

test('Reel não é declarado vencedor por ter sido o único formato usado', () => {
  // Onze publicações, todas Reels, todas acima da mediana delas mesmas.
  const v = formatMaturity({ dimension: 'format', value: 'reel', pieces: 11, above: 11, alternatives: 0 });
  assert.equal(v.state, 'early_signal');
  assert.match(v.because, /sem alternativa comparável/);
  assert.notEqual(v.state, 'consistent_pattern');
});

test('formato nunca usado fica «não testado», não «ruim»', () => {
  const v = formatMaturity({ dimension: 'format', value: 'carousel', pieces: 0, above: 0, alternatives: 11 });
  assert.equal(v.state, 'untested');
  assert.equal(maturityInfluence('untested'), 'test');
  assert.notEqual(v.state, 'no_advantage');
});

test('uma peça só não vira padrão', () => {
  const v = formatMaturity({ dimension: 'opening', value: 'question', pieces: 1, above: 1, alternatives: 5 });
  assert.equal(v.state, 'testing');
});

test('padrão consistente exige repetição, comparação e contextos diferentes', () => {
  const mesmoContexto = formatMaturity({
    dimension: 'opening', value: 'question', pieces: 4, above: 4, alternatives: 3, cohorts: 1,
  });
  assert.equal(mesmoContexto.state, 'conditional');

  const variado = formatMaturity({
    dimension: 'opening', value: 'question', pieces: 4, above: 4, alternatives: 3, cohorts: 2,
  });
  assert.equal(variado.state, 'consistent_pattern');
  assert.equal(maturityInfluence('consistent_pattern'), 'prefer');
});

test('«sem vantagem» só existe depois de comparar', () => {
  const v = formatMaturity({ dimension: 'pace', value: 'slow', pieces: 4, above: 0, alternatives: 4 });
  assert.equal(v.state, 'no_advantage');
  assert.equal(maturityInfluence('no_advantage'), 'avoid');

  const semComparar = formatMaturity({ dimension: 'pace', value: 'slow', pieces: 4, above: 0, alternatives: 1 });
  assert.equal(semComparar.state, 'early_signal');
});

test('não existe nota de 0 a 100 em lado nenhum', () => {
  const v = formatMaturity({ dimension: 'format', value: 'reel', pieces: 5, above: 3, alternatives: 3 });
  assert.equal(typeof v.state, 'string');
  assert.ok(!('score' in v));
});
