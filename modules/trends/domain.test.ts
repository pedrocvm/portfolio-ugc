import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dedupeTrends,
  shortlistForDeepAnalysis,
  trendFingerprint,
  trendFit,
  trendProblems,
  type Trend,
} from './domain';

const NOW = new Date('2026-09-02T00:00:00Z');

const trend = (over: Partial<Trend> = {}): Trend => ({
  title: 'Breakdown de edição em ecrã dividido',
  kind: 'editing',
  platform: 'tiktok',
  description: 'O criador mostra a timeline do CapCut ao lado do vídeo final.',
  whyTrending: 'Está a aparecer em vários perfis de edição desde meados de Agosto, com muitos comentários a pedir tutorial.',
  evidence: [{ url: 'https://www.tiktok.com/@editor/video/999', note: 'exemplo com 400k' }],
  publishedAt: '2026-08-26',
  detectedAt: '2026-09-02T06:35:00Z',
  ...over,
});

const perfil = {
  topics: ['edição', 'ugc', 'capcut'],
  avoidedFormats: ['dança'],
  talkingHeadTolerance: 0.7,
  editingComplexity: 0.6,
};

test('a mesma tendência escrita de duas maneiras tem a mesma impressão digital', () => {
  const a = trendFingerprint({ title: 'Breakdown de edição em ecrã dividido', kind: 'editing', platform: 'tiktok' });
  const b = trendFingerprint({ title: 'Ecrã dividido: breakdown da edição', kind: 'editing', platform: 'tiktok' });
  assert.equal(a, b);
});

test('tendências diferentes não colidem', () => {
  const a = trendFingerprint({ title: 'Breakdown de edição', kind: 'editing', platform: 'tiktok' });
  const b = trendFingerprint({ title: 'Micro-vlog da manhã', kind: 'format', platform: 'tiktok' });
  assert.notEqual(a, b);
});

test('a deduplicação apanha a mesma tendência repetida', () => {
  const lista = dedupeTrends([
    trend(),
    trend({ title: 'Ecrã dividido com breakdown da edição' }),
    trend({ title: 'Micro-vlog de manhã', kind: 'format' }),
  ]);
  assert.equal(lista.length, 2);
});

test('uma tendência sem prova clicável não entra', () => {
  assert.ok(trendProblems(trend({ evidence: [] })).includes('sem prova clicável'));
  assert.ok(trendProblems(trend({ evidence: [{ url: 'vi no TikTok' }] })).includes('sem prova clicável'));
  assert.deepEqual(trendProblems(trend()), []);
});

/* ── Os casos que o briefing nomeia ───────────────────────────────────────── */

test('uma tendência de há meses não é recomendada como actual', () => {
  const velha = trendFit({ trend: trend({ publishedAt: '2026-01-10' }), ...perfil, now: NOW });
  assert.equal(velha.freshness, 'stale');
  assert.equal(velha.verdict, 'skip');
  assert.ok(velha.reason.toLowerCase().includes('passou o momento'));
});

test('viral mas irrelevante é recusado', () => {
  const viral = trendFit({
    trend: trend({
      title: 'Prank no supermercado',
      kind: 'format',
      description: 'Uma pegadinha polémica a estranhos, com milhões de visualizações.',
      whyTrending: 'Está em todo o lado esta semana, com muito drama de comentários.',
    }),
    ...perfil,
    now: NOW,
  });
  assert.equal(viral.verdict, 'skip');
  assert.ok(viral.reason.includes('não serve a imagem dela'));
});

test('o que ela já faz sobe', () => {
  const encaixa = trendFit({ trend: trend(), ...perfil, now: NOW });
  assert.notEqual(encaixa.verdict, 'skip');
  assert.ok(encaixa.score >= 45);
});

test('um formato que ela evita cai', () => {
  const evitado = trendFit({
    trend: trend({ title: 'Coreografia de dança com o produto', kind: 'format' }),
    ...perfil,
    now: NOW,
  });
  assert.equal(evitado.verdict, 'skip');
  assert.ok(evitado.reason.includes('evita'));
});

test('sem perfil observado o encaixe é conservador, não optimista', () => {
  const semPerfil = trendFit({
    trend: trend({ description: 'Talking head longo a falar para a câmara sobre o mês.' }),
    topics: [],
    avoidedFormats: [],
    talkingHeadTolerance: null,
    editingComplexity: null,
    now: NOW,
  });
  const comPerfil = trendFit({
    trend: trend({ description: 'Talking head longo a falar para a câmara sobre o mês.' }),
    ...perfil,
    now: NOW,
  });
  assert.ok(semPerfil.score <= comPerfil.score);
});

test('a análise profunda só recebe o que sobrevive à triagem barata', () => {
  const candidatas = [
    trend(),
    trend({ title: 'Ecrã dividido: breakdown da edição' }),
    trend({ title: 'Coisa de 2024', publishedAt: '2024-05-01' }),
    trend({ title: 'Micro-vlog matinal', kind: 'format' }),
  ];
  const curta = shortlistForDeepAnalysis(candidatas, { max: 12, now: NOW });
  assert.equal(curta.length, 2);
  assert.equal(
    curta.some((t) => t.title.includes('2024')),
    false,
  );
});

test('o corte de custo respeita o máximo', () => {
  const muitas = Array.from({ length: 40 }, (_, i) => trend({ title: `Formato ${'abcdefghij'[i % 10]}${i}xxxx original distinto` }));
  assert.equal(shortlistForDeepAnalysis(muitas, { max: 12, now: NOW }).length, 12);
});
