import assert from 'node:assert/strict';
import test from 'node:test';

import {
  audienceBalance,
  estimateMinutes,
  freshUntilFor,
  genericProblems,
  ideaFingerprint,
  isRepeat,
  isStale,
  pillarPriority,
  platformTreatmentsDiffer,
  qualityVerdict,
  seriesIsViable,
  shouldGenerate,
  similarity,
} from './domain';

const NOW = new Date('2026-09-02T00:00:00Z');

const GUIAO =
  'Abro a mostrar dois vídeos lado a lado, digo que um vendeu e o outro não, ' +
  'e explico que a diferença foi o gancho e não a luz. Depois mostro a timeline ' +
  'do CapCut com o corte aos 1,2 segundos e fecho a perguntar qual escolheriam.';

/* ── Pilares ──────────────────────────────────────────────────────────────── */

test('o pilar que não sai há mais tempo vem primeiro', () => {
  const historia = [
    { pillar: 'EDITING', at: '2026-09-01' },
    { pillar: 'EDITING', at: '2026-08-31' },
    { pillar: 'CREATOR_JOURNEY', at: '2026-08-30' },
  ];
  const ordem = pillarPriority(historia);
  assert.notEqual(ordem[0], 'EDITING');
  assert.ok(ordem.indexOf('EDITING') > ordem.indexOf('PORTFOLIO'));
});

test('o equilíbrio de públicos inclina-se para o lado que falta', () => {
  const soCreators = audienceBalance([
    { pillar: 'CREATOR_EDUCATION' },
    { pillar: 'BUSINESS' },
    { pillar: 'CREATOR_EDUCATION' },
    { pillar: 'BUSINESS' },
  ]);
  assert.equal(soCreators.tilt, 'brand');

  const soMarcas = audienceBalance([
    { pillar: 'UGC_AUTHORITY' },
    { pillar: 'PORTFOLIO' },
    { pillar: 'CREATIVE_STRATEGY' },
    { pillar: 'UGC_AUTHORITY' },
  ]);
  assert.equal(soMarcas.tilt, 'creator');
});

test('com pouca história não se inclina para lado nenhum', () => {
  assert.equal(audienceBalance([{ pillar: 'BUSINESS' }]).tilt, 'balanced');
});

/* ── Repetição ────────────────────────────────────────────────────────────── */

test('a mesma ideia com outras palavras é a mesma ideia', () => {
  const a = ideaFingerprint({
    platform: 'instagram',
    pillar: 'CREATIVE_STRATEGY',
    hook: 'Um UGC bonito pode ser um anúncio mau',
  });
  const b = ideaFingerprint({
    platform: 'instagram',
    pillar: 'CREATIVE_STRATEGY',
    hook: 'Anúncio mau: quando o UGC é bonito',
  });
  assert.equal(a, b);
});

test('o mesmo gancho repetido é apanhado mesmo com a impressão digital diferente', () => {
  const anterior = [
    { fingerprint: 'outra', hook: 'Demorei meses a perceber que UGC bonito não vende nada' },
  ];
  const { repeat, because } = isRepeat(
    {
      platform: 'tiktok',
      pillar: 'UGC_AUTHORITY',
      hook: 'Demorei meses a perceber que UGC bonito não vende',
    },
    anterior,
  );
  assert.equal(repeat, true);
  assert.ok(because?.includes('gancho'));
});

test('uma ideia nova não é marcada como repetida', () => {
  const anterior = [{ fingerprint: 'x', hook: 'Como consegui o primeiro cliente internacional' }];
  const { repeat } = isRepeat(
    { platform: 'tiktok', pillar: 'EDITING', hook: 'O corte que faz um vídeo parecer um anúncio verdadeiro' },
    anterior,
  );
  assert.equal(repeat, false);
});

test('a semelhança é simétrica e mede palavras, não letras', () => {
  assert.equal(similarity('gato preto grande', 'gato preto grande'), 1);
  assert.equal(similarity('', 'qualquer coisa'), 0);
});

/* ── Porta anti-genérico ──────────────────────────────────────────────────── */

test('«5 dicas para ser UGC creator» não passa', () => {
  const problemas = genericProblems({
    hook: '5 dicas para ser UGC creator em 2026',
    script: GUIAO,
  });
  assert.ok(problemas.some((p) => p.includes('lugar-comum')));
});

test('«3 erros que tu cometes» não passa', () => {
  const problemas = genericProblems({ hook: '3 erros que ninguém te conta sobre UGC', script: GUIAO });
  assert.ok(problemas.some((p) => p.includes('lugar-comum')));
});

test('uma ideia sem guião não é trabalho preparado', () => {
  const problemas = genericProblems({
    hook: 'O maior erro que cometi quando comecei foi tentar deixar tudo bonito',
    script: 'Falar sobre isso.',
  });
  assert.ok(problemas.some((p) => p.includes('gravar')));
});

test('uma ideia concreta com guião passa a porta', () => {
  assert.deepEqual(
    genericProblems({
      hook: 'O maior erro que cometi quando comecei em UGC foi tentar deixar tudo bonito',
      script: GUIAO,
    }),
    [],
  );
});

test('o veredicto é uma frase, não oito números', () => {
  const boa = qualityVerdict({
    originality: 85, specificity: 80, carolFit: 78, authority: 82,
    engagement: 70, recordability: 90, platformNative: 75, freshness: 80,
  });
  assert.equal(boa.verdict, 'record_today');
  assert.equal(boa.phrase, 'Eu gravaria este hoje.');

  const media = qualityVerdict({
    originality: 60, specificity: 55, carolFit: 60, authority: 55,
    engagement: 50, recordability: 70, platformNative: 60, freshness: 60,
  });
  assert.equal(media.verdict, 'good_not_urgent');
});

test('originalidade e possibilidade de gravar têm veto, não média', () => {
  // Tudo excelente menos a originalidade: a média salvaria; o veto não deixa.
  const generica = qualityVerdict({
    originality: 20, specificity: 95, carolFit: 95, authority: 95,
    engagement: 95, recordability: 95, platformNative: 95, freshness: 95,
  });
  assert.equal(generica.verdict, 'reject');

  const impossivel = qualityVerdict({
    originality: 95, specificity: 95, carolFit: 95, authority: 95,
    engagement: 95, recordability: 10, platformNative: 95, freshness: 95,
  });
  assert.equal(impossivel.verdict, 'reject');
  assert.ok(impossivel.phrase.includes('sozinha'));
});

/* ── Plataforma ───────────────────────────────────────────────────────────── */

test('o Reel republicado no TikTok é apanhado', () => {
  const igual = platformTreatmentsDiffer(
    { platform: 'instagram', hook: 'Um UGC bonito pode ser um anúncio mau', format: 'reel', script: GUIAO },
    { platform: 'tiktok', hook: 'Um UGC bonito pode ser um anúncio mau', format: 'reel', script: GUIAO },
  );
  assert.equal(igual.differ, false);
  assert.ok(igual.because.includes('gancho'));
});

test('tratamentos nativos diferentes passam', () => {
  const diferente = platformTreatmentsDiffer(
    {
      platform: 'instagram',
      hook: 'Um UGC bonito pode ser um anúncio mau',
      format: 'reel com comparação lado a lado',
      script: GUIAO,
    },
    {
      platform: 'tiktok',
      hook: 'Consegui o primeiro cliente de fora antes de o meu inglês ficar bom',
      format: 'talking head com capturas de ecrã',
      script: 'Conto a história desde o email até ao pagamento, com as capturas por cima.',
    },
  );
  assert.equal(diferente.differ, true);
});

/* ── Carga e envelhecimento ───────────────────────────────────────────────── */

test('com sete ideias por gravar não se somam mais catorze', () => {
  const cheio = shouldGenerate(10, { cap: 6 });
  assert.equal(cheio.generate, false);
  assert.equal(cheio.refreshOnly, true);
  assert.ok(cheio.because.includes('substituo'));

  assert.equal(shouldGenerate(2, { cap: 6 }).generate, true);
  assert.equal(shouldGenerate(2, { cap: 6 }).refreshOnly, false);
});

test('uma ideia de tendência morre com a tendência', () => {
  assert.equal(isStale({ freshUntil: '2026-08-30', generatedAt: '2026-08-20T00:00:00Z' }, NOW), true);
  assert.equal(isStale({ freshUntil: '2026-09-20', generatedAt: '2026-08-20T00:00:00Z' }, NOW), false);
});

test('sem prazo declarado uma ideia envelhece à mesma', () => {
  assert.equal(isStale({ freshUntil: null, generatedAt: '2026-07-01T00:00:00Z' }, NOW), true);
  assert.equal(isStale({ freshUntil: null, generatedAt: '2026-08-30T00:00:00Z' }, NOW), false);
});

test('uma ideia sem tendência não ganha prazo inventado', () => {
  assert.equal(freshUntilFor({ hasTrend: false }, NOW), null);
  assert.equal(freshUntilFor({ hasTrend: true, trendFreshness: 'fresh' }, NOW), '2026-09-12');
});

/* ── Séries ───────────────────────────────────────────────────────────────── */

test('uma série sem premissa nem episódios pela frente não é uma série', () => {
  const fraca = seriesIsViable({ name: 'UGC Lab', premise: 'coisas', structure: '', nextTopics: [] });
  assert.equal(fraca.viable, false);
  assert.deepEqual(fraca.missing, ['premissa', 'estrutura repetível', 'episódios pela frente']);
});

test('uma série completa é viável', () => {
  const boa = seriesIsViable({
    name: 'Como eu faria este anúncio',
    premise: 'Pego num anúncio real de uma marca e mostro como o teria feito em UGC.',
    structure: 'Mostro o anúncio, aponto o que falha, gravo a minha versão em 20 segundos.',
    nextTopics: ['aspirador', 'app de finanças'],
  });
  assert.equal(boa.viable, true);
});

/* ── Tempo ────────────────────────────────────────────────────────────────── */

test('a estimativa cresce com as tomadas e com o peso da edição', () => {
  const simples = estimateMinutes({ shots: 3, durationSeconds: 25, editingComplexity: 'simple' });
  const pesada = estimateMinutes({ shots: 3, durationSeconds: 25, editingComplexity: 'heavy' });
  assert.ok(pesada.edit > simples.edit);
  assert.equal(simples.record, pesada.record);

  const muitas = estimateMinutes({ shots: 8, durationSeconds: 45, editingComplexity: 'medium' });
  assert.ok(muitas.record > simples.record);
});
