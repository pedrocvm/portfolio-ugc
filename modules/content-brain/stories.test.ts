import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STORY_SEQUENCE_POLICY_V1,
  compareSequence,
  groupStorySequences,
  sequenceMetrics,
  storyCoverage,
  storyGuidance,
  type SequenceMetrics,
  type StoryReading,
} from './stories';
import { STORY_WINDOWS, FEED_WINDOWS, dueSnapshots, latestDue } from './metrics';

const t = (iso: string) => iso;

/* ── Agrupar ──────────────────────────────────────────────────────────────── */

test('frames com menos de 90 minutos entre si são a mesma sequência', () => {
  const seqs = groupStorySequences([
    { id: 'a', publishedAt: t('2026-09-08T10:00:00Z') },
    { id: 'b', publishedAt: t('2026-09-08T10:20:00Z') },
    { id: 'c', publishedAt: t('2026-09-08T11:30:00Z') },
  ]);
  assert.equal(seqs.length, 1);
  assert.deepEqual(seqs[0].storyIds, ['a', 'b', 'c']);
  assert.equal(seqs[0].storyCount, 3);
});

test('um intervalo maior do que o limite abre outra sequência', () => {
  const seqs = groupStorySequences([
    { id: 'a', publishedAt: t('2026-09-08T10:00:00Z') },
    { id: 'b', publishedAt: t('2026-09-08T13:00:00Z') },
  ]);
  assert.equal(seqs.length, 2);
});

test('o dia local corta, mesmo com intervalo curto', () => {
  // Lisboa no verão é UTC+1. 20:00Z e 20:20Z são 21:00 e 21:20 do mesmo dia;
  // 22:50Z e 23:10Z são 23:50 de um dia e 00:10 do seguinte.
  const mesmo = groupStorySequences([
    { id: 'a', publishedAt: t('2026-09-08T20:00:00Z') },
    { id: 'b', publishedAt: t('2026-09-08T20:20:00Z') },
  ]);
  assert.equal(mesmo.length, 1);
  const outro = groupStorySequences([
    { id: 'a', publishedAt: t('2026-09-08T22:50:00Z') },
    { id: 'b', publishedAt: t('2026-09-08T23:10:00Z') },
  ]);
  assert.equal(outro.length, 2);
});

test('a ordem de entrada não muda o resultado', () => {
  const frames = [
    { id: 'c', publishedAt: t('2026-09-08T11:30:00Z') },
    { id: 'a', publishedAt: t('2026-09-08T10:00:00Z') },
    { id: 'b', publishedAt: t('2026-09-08T10:20:00Z') },
  ];
  assert.deepEqual(groupStorySequences(frames)[0].storyIds, ['a', 'b', 'c']);
  assert.equal(groupStorySequences(frames)[0].startedAt, '2026-09-08T10:00:00Z');
});

test('sem frames não há sequências', () => {
  assert.deepEqual(groupStorySequences([]), []);
});

/* ── Métricas ─────────────────────────────────────────────────────────────── */

const frame = (id: string, at: string, over: Partial<StoryReading> = {}): StoryReading => ({
  id, publishedAt: at, reach: null, views: null, replies: null, shares: null, navigation: null, profileActivity: null, follows: null, ...over,
});

test('a proxy de retenção é o último alcance sobre o primeiro, e chama-se proxy', () => {
  const m = sequenceMetrics([
    frame('a', '2026-09-08T10:00:00Z', { reach: 312, replies: 3 }),
    frame('b', '2026-09-08T10:10:00Z', { reach: 280, replies: 2 }),
    frame('c', '2026-09-08T10:20:00Z', { reach: 241, replies: 3 }),
  ]);
  assert.equal(m.firstReach, 312);
  assert.equal(m.lastReach, 241);
  assert.equal(m.reachRetentionProxy, 0.772);
  assert.equal(m.replies, 8);
  assert.equal(m.coverage, 'complete');
  assert.deepEqual(m.dropBetweenFrames, [0.103, 0.139]);
});

test('um frame sem alcance não vira zero', () => {
  const m = sequenceMetrics([
    frame('a', '2026-09-08T10:00:00Z', { reach: 300 }),
    frame('b', '2026-09-08T10:10:00Z'),
    frame('c', '2026-09-08T10:20:00Z', { reach: 200 }),
  ]);
  assert.equal(m.measured, 2);
  assert.equal(m.coverage, 'partial');
  assert.equal(m.replies, null);
  // A proxy usa só os medidos: 200/300, não 0/300.
  assert.equal(m.reachRetentionProxy, 0.667);
});

test('com um frame só não há proxy', () => {
  const m = sequenceMetrics([frame('a', '2026-09-08T10:00:00Z', { reach: 300 })]);
  assert.equal(m.reachRetentionProxy, null);
  assert.equal(m.coverage, 'complete');
});

/* ── Comparar ─────────────────────────────────────────────────────────────── */

const seq = (n: number, proxy: number): SequenceMetrics => ({
  storyCount: n, measured: n, coverage: 'complete', firstReach: 300, lastReach: 300 * proxy,
  reachRetentionProxy: proxy, dropBetweenFrames: [], replies: null, shares: null, navigation: null,
  profileActivity: null, follows: null, interactionRate: null,
});

test('«melhor que 4 das últimas 5» só com sequências de tamanho comparável', () => {
  const c = compareSequence(seq(5, 0.77), [seq(5, 0.6), seq(4, 0.7), seq(6, 0.8), seq(5, 0.5), seq(5, 0.72), seq(2, 0.9)]);
  assert.equal(c.comparable, 5);
  assert.equal(c.better, 4);
  assert.equal(c.line, 'Melhor que 4 das últimas 5 sequências de tamanho comparável.');
});

test('com menos de três comparáveis a frase não existe', () => {
  const c = compareSequence(seq(5, 0.77), [seq(5, 0.6), seq(1, 0.9)]);
  assert.equal(c.line, null);
});

/* ── Cobertura ────────────────────────────────────────────────────────────── */

test('sem captura ligada, o produto diz que não tem histórico — não «0 Stories»', () => {
  const c = storyCoverage({ firstCapturedAt: null, storiesCaptured: 0, syncScheduled: false });
  assert.match(c.line, /não está ligada/);
  assert.doesNotMatch(c.line, /0 Stories/);
});

test('a cobertura diz desde quando', () => {
  const c = storyCoverage({ firstCapturedAt: '2026-09-08T09:00:00Z', storiesCaptured: 4, syncScheduled: true });
  assert.equal(c.since, '2026-09-08T09:00:00Z');
  assert.match(c.line, /desde 08\/09\/2026/);
});

/* ── Orientação ───────────────────────────────────────────────────────────── */

const semana = (i: number) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString();

test('sem amostra suficiente a orientação diz «ainda não sei»', () => {
  const g = storyGuidance(
    [{ startedAt: semana(1), metrics: seq(5, 0.8), tags: ['talking'] }, { startedAt: semana(2), metrics: seq(3, 0.6), tags: [] }],
    { now: new Date('2026-09-20T00:00:00Z') },
  );
  assert.equal(g.lines.length, 0);
  assert.match(g.because, /Ainda não sei/);
});

test('com três de cada lado, uma etiqueta pode ser comparada — com amostra e confiança', () => {
  const seqs = [
    ...[0.82, 0.8, 0.85].map((p, i) => ({ startedAt: semana(i), metrics: seq(5, p), tags: ['talking'] })),
    ...[0.6, 0.55, 0.62].map((p, i) => ({ startedAt: semana(10 + i), metrics: seq(5, p), tags: ['broll'] })),
  ];
  const g = storyGuidance(seqs, { now: new Date('2026-09-20T00:00:00Z') });
  const linha = g.lines.find((l) => l.text.includes('«talking»'));
  assert.ok(linha, 'faltou a comparação por etiqueta');
  assert.match(linha!.text, /mantiveram mais gente/);
  assert.equal(linha!.sample, 'Amostra: 3 vs 3 sequências.');
  assert.equal(linha!.confidence, 'low');
});

test('a orientação nunca usa um número que não seja dela', () => {
  const g = storyGuidance([], {});
  assert.doesNotMatch(g.because, /\d+%/);
});

/* ── Janelas ──────────────────────────────────────────────────────────────── */

test('stories têm janelas próprias e o feed continua com as suas', () => {
  const now = new Date('2026-09-08T22:55:00Z');
  const publicado = '2026-09-08T00:00:00Z';
  assert.deepEqual(dueSnapshots({ publishedAt: publicado, existing: [], now, productType: 'STORY' }), ['t23h']);
  assert.deepEqual(dueSnapshots({ publishedAt: publicado, existing: [], now }), ['t24h']);
  assert.ok(!STORY_WINDOWS.includes('t30d'));
  assert.ok(!FEED_WINDOWS.includes('t23h'));
});

test('a leitura atual é para o feed, depois das 24 h, uma vez por dia — nunca para stories', () => {
  const now = new Date('2026-09-08T12:00:00Z');
  assert.equal(latestDue({ publishedAt: '2024-01-01T00:00:00Z', productType: 'REELS', lastLatestAt: null, now }), true);
  assert.equal(latestDue({ publishedAt: '2024-01-01T00:00:00Z', productType: 'REELS', lastLatestAt: '2026-09-08T02:00:00Z', now }), false);
  assert.equal(latestDue({ publishedAt: '2026-09-08T06:00:00Z', productType: 'REELS', lastLatestAt: null, now }), false);
  assert.equal(latestDue({ publishedAt: '2024-01-01T00:00:00Z', productType: 'STORY', lastLatestAt: null, now }), false);
});

test('a política de sequências está versionada', () => {
  assert.equal(STORY_SEQUENCE_POLICY_V1.version, 'CAROL_STORY_SEQUENCE_V1');
});
