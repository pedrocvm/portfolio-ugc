import assert from 'node:assert/strict';
import test from 'node:test';

import {
  brollTestProblems,
  carolBaseline,
  duplicateContent,
  evaluatePerformance,
  feedPromotionCandidate,
  matchBroll,
  plateauDetected,
  reelsTestEligibility,
  suggestBrollTags,
  testLoad,
} from './reels-test';

/* ── Elegibilidade ────────────────────────────────────────────────────────── */

const broll6s = {
  contentFunction: 'attract_connect',
  durationSeconds: 6,
  hook: 'Demorei meses para perceber que o vídeo bonito não era necessariamente o melhor.',
  caption: 'Passei semanas editando para ficar bonito. O que funcionou foi o take torto em que eu falei a verdade. Salva isso.',
  cta: 'Salva isso.',
  format: 'B-roll de 6 s com texto na tela',
  modes: ['personal'],
  usesExistingAsset: true,
};

test('um B-roll universal de 6 s é candidato a Reels Test', () => {
  const v = reelsTestEligibility(broll6s);
  assert.equal(v.eligible, true);
  assert.equal(v.recommendation, 'reels_test_first');
  assert.match(v.because, /Eu testaria isto primeiro em Reels Test/);
  assert.ok(v.criteria.shortness >= 100);
  assert.ok(v.criteria.repeatability >= 90);
});

test('conteúdo de conversão nunca vai para Reels Test', () => {
  const v = reelsTestEligibility({ ...broll6s, contentFunction: 'convert', cta: 'Salva isso.' });
  assert.equal(v.eligible, false);
  assert.equal(v.recommendation, 'feed');
  assert.match(v.because, /conversão/);
});

test('um remate de venda tira a peça do teste', () => {
  const v = reelsTestEligibility({ ...broll6s, cta: 'Pede orçamento no link na bio' });
  assert.equal(v.eligible, false);
});

test('conteúdo que exige contexto não serve para público frio', () => {
  const v = reelsTestEligibility({
    contentFunction: 'educate_retain',
    durationSeconds: 45,
    hook: 'Como eu disse no vídeo anterior, o brief da marca pedia outra coisa',
    script: 'Continuando a parte 2 sobre o deliverable e o retainer.',
    cta: 'Comenta',
    format: 'talking head',
    requiresContext: true,
  });
  assert.equal(v.eligible, false);
  assert.match(v.because, /contexto/);
});

/* ── B-roll ───────────────────────────────────────────────────────────────── */

test('o formato de B-roll pede 5 a 7 s, gancho escrito, legenda com solução e remate simples', () => {
  assert.deepEqual(
    brollTestProblems({
      brollSeconds: 6,
      writtenHook: 'Eu quase mandei esse take assim.',
      caption: 'Estava tecnicamente certo e ainda assim não funcionava. O que mudou foi o corte no segundo 1. Salva pra quando o teu vídeo parecer certo e não prender.',
      cta: 'Salva isso.',
    }),
    [],
  );
  const mau = brollTestProblems({ brollSeconds: 20, writtenHook: '', caption: 'ok', cta: 'Me contrata' });
  assert.ok(mau.some((p) => p.includes('5 a 7')));
  assert.ok(mau.includes('sem gancho escrito'));
  assert.ok(mau.some((p) => p.includes('legenda')));
  assert.ok(mau.some((p) => p.includes('pede demais')));
});

/* ── Duplicados ───────────────────────────────────────────────────────────── */

test('«quero repostar o mesmo vídeo» é apanhado, e uma variante passa', () => {
  const original = { assetIds: ['take-1'], hook: 'Eu quase mandei esse take assim.', caption: 'A história do take que parecia certo e não prendia.' };
  const igual = duplicateContent(original, { ...original });
  assert.equal(igual.duplicate, true);
  assert.match(igual.because, /mesmo conteúdo/);

  const variante = duplicateContent(original, {
    assetIds: ['take-1'],
    hook: 'O corte que salvou o vídeo estava no segundo 1.',
    caption: 'O mesmo take, outra leitura: não era a luz, era o ritmo.',
  });
  assert.equal(variante.duplicate, false);
  assert.equal(variante.variantOk, true);
});

/* ── Linha de base e heurísticas ──────────────────────────────────────────── */

test('sem três peças não há linha de base', () => {
  assert.equal(carolBaseline([{ views: 100 }, { views: 200 }]).confidence, 'none');
  const b = carolBaseline([{ views: 100 }, { views: 8000 }, { views: 9000 }, { views: 7000 }]);
  assert.equal(b.medianViews, 7500);
  assert.equal(b.confidence, 'low');
});

test('2000 views não é excelente quando o normal dela é 8000', () => {
  const baseline = carolBaseline([{ views: 8000 }, { views: 7500 }, { views: 8500 }, { views: 9000 }, { views: 8000 }]);
  const v = evaluatePerformance({ views: 2000 }, baseline);
  assert.equal(v.basis, 'carol_baseline');
  assert.equal(v.verdict, 'weak');
  assert.match(v.because, /Fraco para o padrão dela/);
});

test('sem linha de base, a heurística da mentora serve — e diz que é heurística', () => {
  const v = evaluatePerformance({ views: 2000 }, carolBaseline([]));
  assert.equal(v.basis, 'mentor_heuristic');
  assert.equal(v.verdict, 'strong');
  assert.match(v.because, /heurística da mentora/);
  assert.equal(evaluatePerformance({ views: 150 }, carolBaseline([])).verdict, 'weak');
});

test('qualidade de engajamento e alcance de não seguidores calculam-se quando há dados', () => {
  const v = evaluatePerformance({ views: 1000, comments: 10, saves: 20, shares: 5, reach: 900, nonFollowerReach: 630 }, carolBaseline([]));
  assert.ok(v.engagementPerThousand! > 0);
  assert.equal(v.nonFollowerShare, 0.7);
});

/* ── Platô e feed ─────────────────────────────────────────────────────────── */

test('um teste que estabiliza acima do normal vira candidato a feed', () => {
  const baseline = carolBaseline([{ views: 300 }, { views: 400 }, { views: 350 }, { views: 500 }]);
  const medidas = [
    { views: 1200, measuredAt: '2026-09-02T10:00:00Z' },
    { views: 2900, measuredAt: '2026-09-03T10:00:00Z' },
    { views: 2960, measuredAt: '2026-09-04T10:00:00Z' },
  ];
  assert.equal(plateauDetected(medidas).plateau, true);
  const r = feedPromotionCandidate({ measurements: medidas, baseline, promoted: false });
  assert.equal(r.candidate, true);
  assert.match(r.headline ?? '', /Eu levaria para o feed/);
});

test('um teste ainda crescendo, ou já promovido, não é candidato', () => {
  const baseline = carolBaseline([{ views: 300 }, { views: 400 }, { views: 350 }]);
  const crescendo = [
    { views: 1200, measuredAt: '2026-09-02T10:00:00Z' },
    { views: 2400, measuredAt: '2026-09-03T10:00:00Z' },
  ];
  assert.equal(feedPromotionCandidate({ measurements: crescendo, baseline, promoted: false }).candidate, false);
  assert.equal(feedPromotionCandidate({ measurements: crescendo, baseline, promoted: true }).candidate, false);
  assert.equal(feedPromotionCandidate({ measurements: crescendo.slice(0, 1), baseline, promoted: false }).candidate, false);
});

/* ── Carga ────────────────────────────────────────────────────────────────── */

test('a mentora recomenda 3 a 5, mas com duas gravações comerciais é um', () => {
  const r = testLoad({ intensiveMode: true, commercialShootsToday: 2, minutesCommitted: 180, brollAvailable: 4, readyTests: 0 });
  assert.equal(r.recommended, 1);
  assert.equal(r.basis, 'MENTOR_EXPERIMENT');
  assert.match(r.because, /B-roll que já existe/);
});

test('sem modo intensivo é um por dia; com modo intensivo começa em três', () => {
  assert.equal(testLoad({ intensiveMode: false, commercialShootsToday: 0, minutesCommitted: 0, brollAvailable: 3, readyTests: 0 }).recommended, 1);
  assert.equal(testLoad({ intensiveMode: true, commercialShootsToday: 0, minutesCommitted: 0, brollAvailable: 3, readyTests: 0 }).recommended, 3);
  assert.equal(testLoad({ intensiveMode: true, commercialShootsToday: 0, minutesCommitted: 0, brollAvailable: 0, readyTests: 0 }).recommended, 2);
  assert.equal(testLoad({ intensiveMode: false, commercialShootsToday: 0, minutesCommitted: 0, brollAvailable: 3, readyTests: 2 }).recommended, 0);
});

/* ── B-roll ───────────────────────────────────────────────────────────────── */

test('o take certo do banco vem primeiro', () => {
  const banco = [
    { id: 'a', tags: ['editando', 'casa'], title: 'Carol na secretária com o CapCut aberto' },
    { id: 'b', tags: ['academia'], title: 'aparelho de pernas' },
    { id: 'c', tags: ['café', 'casa'], title: 'café na varanda' },
  ];
  const m = matchBroll({ tags: ['editando'], text: 'Carol editando o vídeo' }, banco);
  assert.equal(m[0]?.id, 'a');
  assert.ok(!m.some((x) => x.id === 'b'));
});

test('as etiquetas sugerem-se do nome do arquivo e da nota', () => {
  assert.deepEqual(suggestBrollTags({ fileName: 'IMG_editando_capcut_casa.mov' }), ['editando', 'casa']);
  assert.ok(suggestBrollTags({ note: 'eu digitando no laptop com café' }).includes('digitando'));
  assert.deepEqual(suggestBrollTags({ fileName: 'IMG_0031.mov' }), []);
});
