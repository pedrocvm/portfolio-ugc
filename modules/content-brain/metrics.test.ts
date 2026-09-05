import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIN_BASELINE_SAMPLE,
  SNAPSHOT_KINDS,
  buildBaseline,
  cohortKey,
  dueSnapshots,
  formatMetric,
  median,
  missingMetric,
  percentile,
  presentMetric,
  relativeToMedian,
  sameCohort,
  shouldAskTrial,
  snapshotAgeBucket,
  toSeconds,
  trialFromApi,
  type MetricValue,
} from './metrics';

const V = 'v26.0';

/* ── Indisponível não é zero ──────────────────────────────────────────────── */

test('ausência e zero real são coisas diferentes', () => {
  const ausente = missingMetric({ metric: 'reach', reason: 'anterior à conta profissional', apiVersion: V });
  const zero = presentMetric({ metric: 'shares', value: 0, apiVersion: V });

  assert.equal(ausente.valueRaw, null);
  assert.equal(ausente.available, false);
  assert.equal(zero.valueRaw, 0);
  assert.equal(zero.available, true);

  assert.equal(formatMetric(ausente), 'indisponível');
  assert.equal(formatMetric(zero), '0');
});

test('a tela nunca mostra undefined nem NaN', () => {
  assert.equal(formatMetric(null), 'indisponível');
  assert.equal(formatMetric(undefined), 'indisponível');
  const semUnidade: MetricValue = {
    metric: 'avg_watch', valueRaw: 5238, unitRaw: 'unknown', valueNormalizedSeconds: null,
    available: true, apiVersion: V, fetchedAt: new Date().toISOString(),
  };
  // Unidade desconhecida não vira segundos adivinhados.
  assert.equal(formatMetric(semUnidade), '5.238');
});

test('uma métrica ausente não entra na mediana como zero', () => {
  const amostras = [
    presentMetric({ metric: 'reach', value: 1000, apiVersion: V }),
    presentMetric({ metric: 'reach', value: 2000, apiVersion: V }),
    presentMetric({ metric: 'reach', value: 3000, apiVersion: V }),
    missingMetric({ metric: 'reach', reason: 'não devolvida', apiVersion: V }),
    missingMetric({ metric: 'reach', reason: 'não devolvida', apiVersion: V }),
  ];
  const b = buildBaseline('reach', amostras, { minSample: 3 });
  assert.equal(b.n, 3);
  assert.equal(b.median, 2000);
});

/* ── Unidade de watch time ────────────────────────────────────────────────── */

test('watch time guarda o bruto e deriva os segundos pela unidade documentada', () => {
  const m = presentMetric({ metric: 'ig_reels_avg_watch_time', value: 11768, unit: 'milliseconds', apiVersion: V });
  assert.equal(m.valueRaw, 11768, 'o bruto não pode ser tocado');
  assert.equal(m.unitRaw, 'milliseconds');
  assert.equal(m.valueNormalizedSeconds, 11.768);
});

test('um erro de 1000× na normalização falha aqui', () => {
  // O valor real de uma corrida contra a API: 11768 ms num Reel de ~18s.
  const ms = toSeconds(11768, 'milliseconds');
  assert.equal(ms, 11.768);
  assert.ok(ms !== null && ms < 60, '11768 ms não pode virar 11768 segundos');
  assert.equal(toSeconds(11768, 'seconds'), 11768);
  // Sem unidade conhecida, não se adivinha.
  assert.equal(toSeconds(11768, 'unknown'), null);
  assert.equal(toSeconds(null, 'milliseconds'), null);
});

test('tempo mostra-se em unidade humana', () => {
  const curto = presentMetric({ metric: 'w', value: 11768, unit: 'milliseconds', apiVersion: V });
  assert.equal(formatMetric(curto), '11,8 s');
  const longo = presentMetric({ metric: 'w', value: 18547084, unit: 'milliseconds', apiVersion: V });
  assert.equal(formatMetric(longo), '309 min 07 s');
});

/* ── Janelas de snapshot ──────────────────────────────────────────────────── */

const H = 60 * 60 * 1000;

test('um snapshot é tirado dentro da janela e uma vez só', () => {
  const publicado = new Date('2026-09-05T10:00:00Z');
  const uma = new Date('2026-09-05T11:05:00Z');
  assert.deepEqual(dueSnapshots({ publishedAt: publicado, existing: [], now: uma }), ['t1h']);
  assert.deepEqual(dueSnapshots({ publishedAt: publicado, existing: ['t1h'], now: uma }), []);
});

test('um job repetido não duplica o mesmo snapshot', () => {
  const publicado = new Date('2026-09-05T10:00:00Z');
  const agora = new Date('2026-09-06T10:30:00Z');
  const primeira = dueSnapshots({ publishedAt: publicado, existing: [], now: agora });
  assert.deepEqual(primeira, ['t24h']);
  const segunda = dueSnapshots({ publishedAt: publicado, existing: primeira, now: agora });
  assert.deepEqual(segunda, []);
});

test('a janela tem tolerância porque o cron nunca cai no segundo exato', () => {
  const publicado = new Date('2026-09-05T10:00:00Z');
  // 15 minutos antes da hora ainda conta; 45 minutos depois já não.
  assert.deepEqual(dueSnapshots({ publishedAt: publicado, existing: [], now: new Date('2026-09-05T10:45:00Z') }), ['t1h']);
  assert.deepEqual(dueSnapshots({ publishedAt: publicado, existing: [], now: new Date('2026-09-05T10:30:00Z') }), []);
});

test('uma janela que já passou não é inventada mais tarde', () => {
  const publicado = new Date('2026-09-05T10:00:00Z');
  const tarde = new Date('2026-09-06T09:00:00Z');
  // Vinte e três horas depois, T+1h não pode aparecer rotulado como primeira hora.
  assert.equal(dueSnapshots({ publishedAt: publicado, existing: [], now: tarde }).includes('t1h'), false);
});

test('cada janela tem uma idade correspondente e as tolerâncias não se sobrepõem', () => {
  for (const k of SNAPSHOT_KINDS) {
    const alvo = { t1h: 1, t6h: 6, t24h: 24, t72h: 72, t7d: 168, t30d: 720 }[k] * H;
    assert.equal(snapshotAgeBucket(alvo), k);
  }
});

test('uma data inválida não rebenta o varrimento', () => {
  assert.deepEqual(dueSnapshots({ publishedAt: 'não é data', existing: [] }), []);
});

/* ── Baseline própria ─────────────────────────────────────────────────────── */

test('mediana e percentis com amostra pequena', () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(percentile([1, 2, 3, 4, 5], 0.25), 2);
  assert.equal(percentile([1, 2, 3, 4, 5], 0.75), 4);
});

test('a mediana resiste ao outlier que a média não resiste', () => {
  // O Charabanc fez 13.912 contra uma mediana de ~2.000. A média diria 3.000
  // e descreveria uma conta que não existe.
  const valores = [1482, 1800, 2006, 2460, 13912];
  const amostras = valores.map((v) => presentMetric({ metric: 'views', value: v, apiVersion: V }));
  const b = buildBaseline('views', amostras);
  assert.equal(b.median, 2006);
  assert.ok(b.mean! > 4000);
});

test('amostra insuficiente diz que é insuficiente', () => {
  const b = buildBaseline('views', [presentMetric({ metric: 'views', value: 10, apiVersion: V })]);
  assert.equal(b.sufficient, false);
  assert.match(b.caveat!, /pouco|comparável/i);
  assert.equal(MIN_BASELINE_SAMPLE, 5);
});

test('sem baseline suficiente a leitura não inventa múltiplo', () => {
  const b = buildBaseline('views', [presentMetric({ metric: 'views', value: 100, apiVersion: V })]);
  const r = relativeToMedian({ metric: 'views', label: 'Views', value: presentMetric({ metric: 'views', value: 500, apiVersion: V }), baseline: b });
  assert.equal(r.ratio, null);
  assert.equal(r.comparable, false);
  assert.doesNotMatch(r.reading, /×/);
});

test('com baseline, a leitura é relativa à mediana dela', () => {
  const amostras = [1000, 1500, 2000, 2500, 3000].map((v) => presentMetric({ metric: 'reach', value: v, apiVersion: V }));
  const b = buildBaseline('reach', amostras);
  const r = relativeToMedian({ metric: 'reach', label: 'Alcance', value: presentMetric({ metric: 'reach', value: 3200, apiVersion: V }), baseline: b });
  assert.equal(r.ratio, 1.6);
  assert.match(r.reading, /1,6× a sua mediana/);
  // Nunca linguagem de urgência.
  assert.doesNotMatch(r.reading, /viral|explod|bombou/i);
});

test('métrica indisponível não vira comparação', () => {
  const b = buildBaseline('reach', [1000, 1500, 2000, 2500, 3000].map((v) => presentMetric({ metric: 'reach', value: v, apiVersion: V })));
  const r = relativeToMedian({ metric: 'reach', value: missingMetric({ metric: 'reach', reason: 'x', apiVersion: V }), baseline: b });
  assert.equal(r.comparable, false);
  assert.match(r.reading, /indisponível/);
});

/* ── Coorte ───────────────────────────────────────────────────────────────── */

test('não se compara T+6h com fecho de 30 dias', () => {
  const a = { platform: 'instagram', mediaType: 'REELS', snapshotKind: 't6h' as const };
  const b = { platform: 'instagram', mediaType: 'REELS', snapshotKind: 't30d' as const };
  assert.equal(sameCohort(a, b), false);
  assert.equal(sameCohort(a, { ...a }), true);
  assert.notEqual(cohortKey(a), cohortKey(b));
});

test('o pilar só restringe quando ambos o declaram', () => {
  const base = { platform: 'instagram', mediaType: 'REELS', snapshotKind: 't24h' as const };
  assert.equal(sameCohort({ ...base, pillar: null }, { ...base, pillar: 'attraction_journey' }), true);
  assert.equal(sameCohort({ ...base, pillar: 'connection_personal' }, { ...base, pillar: 'attraction_journey' }), false);
});

/* ── Trial Reel ───────────────────────────────────────────────────────────── */

test('is_shared_to_feed=false não prova Reel Test', () => {
  // Uma corrida real devolveu cinco Reels normais recentes com feed=false.
  assert.equal(trialFromApi({ mediaProductType: 'REELS', isSharedToFeed: false }), 'unknown');
  assert.equal(trialFromApi({ mediaProductType: 'REELS', isSharedToFeed: true }), 'unknown');
  assert.equal(trialFromApi({ mediaProductType: 'REELS', isSharedToFeed: null }), 'unknown');
});

test('pergunta-se uma vez e nunca mais', () => {
  const base = { trialStatus: 'unknown' as const, trialPromptedAt: null, mediaProductType: 'REELS' };
  assert.equal(shouldAskTrial(base), true);
  assert.equal(shouldAskTrial({ ...base, trialPromptedAt: '2026-09-05T10:00:00Z' }), false, '«não lembro» não volta a interromper');
  assert.equal(shouldAskTrial({ ...base, trialStatus: 'yes' }), false);
  assert.equal(shouldAskTrial({ ...base, mediaProductType: 'FEED' }), false);
});
