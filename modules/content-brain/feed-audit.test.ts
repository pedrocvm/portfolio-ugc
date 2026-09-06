import assert from 'node:assert/strict';
import test from 'node:test';

import { auditPiece, feedSummary, type FeedPieceInput } from './feed-audit';
import type { RelativeReading } from './metrics';

const leitura = (metric: string, ratio: number | null, extra: Partial<RelativeReading> = {}): RelativeReading =>
  ratio === null
    ? { metric, value: null, median: null, ratio: null, reading: `${metric}: indisponível`, comparable: false, ...extra }
    : { metric, value: ratio * 100, median: 100, ratio, reading: `${metric}: ${ratio}× a sua mediana`, comparable: true, ...extra };

const peca = (over: Partial<FeedPieceInput> = {}): FeedPieceInput => ({
  mediaId: 'm1',
  title: 'O cenário que eu compliquei',
  publishedAt: '2026-09-01T10:00:00Z',
  mediaProductType: 'REELS',
  pillarLabel: null,
  mechanism: null,
  tags: { format: null, theme: null, hook: null, source: null, confidence: null },
  readings: [],
  latestKind: 'latest',
  readingAgeDays: 40,
  ...over,
});

test('«bom» e «ruim» não existem: a leitura é relativa à mediana dela', () => {
  const a = auditPiece(peca({ readings: [leitura('comments', 1.8), leitura('reach', 0.7)] }));
  assert.match(a.relativeLine, /Comentários: 1,8×/);
  assert.match(a.relativeLine, /Alcance: 0,7×/);
  assert.doesNotMatch(`${a.relativeLine} ${a.hypothesis} ${a.engagementQuality}`, /\b(bom|ruim|viralizou|morreu)\b/i);
});

test('sem mecanismo registado não há hipótese de causa', () => {
  const a = auditPiece(peca({ readings: [leitura('comments', 1.8)] }));
  assert.match(a.hypothesis, /sem mecanismo registado não dá para saber porquê/);
});

test('com mecanismo, a hipótese é repetir o mecanismo — não o vídeo', () => {
  const a = auditPiece(peca({ mechanism: 'talking_head:eu complico', readings: [leitura('comments', 1.8)] }));
  assert.match(a.hypothesis, /repetir o mecanismo/);
  assert.match(a.hypothesis, /não copiar o vídeo/);
  assert.match(a.nextTest, /Repetir «talking_head:eu complico»/);
});

test('amostra insuficiente diz-se, e o próximo teste é esperar', () => {
  const a = auditPiece(peca({ readings: [leitura('views', null)] }));
  assert.match(a.hypothesis, /Amostra insuficiente/);
  assert.match(a.nextTest, /Esperar a leitura/);
});

test('null não é zero: uma métrica indisponível não entra na linha relativa', () => {
  const a = auditPiece(peca({ readings: [leitura('comments', 1.5), leitura('saves', null)] }));
  assert.doesNotMatch(a.relativeLine, /Salvamentos: 0/);
  assert.doesNotMatch(a.relativeLine, /saves/);
});

test('alcance alto sem conversa fica dito', () => {
  const a = auditPiece(peca({ readings: [leitura('reach', 2.1), leitura('comments', 0.8)] }));
  assert.match(a.engagementQuality, /alcance alto sem conversa/);
});

/* ── Resumo ───────────────────────────────────────────────────────────────── */

const item = (id: string, format: string | null, comments: number | null) => {
  const input = peca({ mediaId: id, title: id, tags: { format, theme: null, hook: null, source: format ? 'ai_caption' : null, confidence: 0.8 }, readings: comments === null ? [] : [leitura('comments', comments)] });
  return { input, audit: auditPiece(input) };
};

test('sem peças comparáveis o resumo diz «ainda não sei»', () => {
  const s = feedSummary([item('a', 'humor', null), item('b', 'humor', null)]);
  assert.equal(s.length, 1);
  assert.match(s[0].text, /Ainda não sei/);
  assert.equal(s[0].confidence, 'low');
});

test('um grupo com três peças acima da mediana vira um ponto com amostra e prova', () => {
  const s = feedSummary([item('a', 'humor', 1.6), item('b', 'humor', 1.9), item('c', 'humor', 1.5), item('d', 'estético', 0.9), item('e', 'estético', 1.0), item('f', 'estético', 1.1)]);
  const humor = s.find((p) => p.text.includes('«humor»'));
  assert.ok(humor, 'faltou o ponto do humor');
  assert.match(humor!.text, /comentários acima da sua mediana/);
  assert.equal(humor!.sample, '3 peças');
  assert.deepEqual(humor!.evidence, ['a', 'b', 'c']);
  assert.equal(humor!.confidence, 'low');
});

test('um grupo com duas peças não conclui: diz que a amostra é pequena', () => {
  const s = feedSummary([item('a', 'inglês', 1.9), item('b', 'inglês', 2.1), item('c', 'humor', 1.0), item('d', 'humor', 1.1), item('e', 'humor', 0.9)]);
  const pequeno = s.find((p) => p.text.includes('Amostra pequena demais'));
  assert.ok(pequeno);
  assert.match(pequeno!.text, /«inglês» \(2\)/);
  assert.equal(s.some((p) => p.text.includes('«inglês» estão gerando')), false);
});

test('nunca mais do que cinco pontos', () => {
  const muitos = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].flatMap((f) => [item(`${f}1`, f, 1.6), item(`${f}2`, f, 1.7), item(`${f}3`, f, 1.8)]);
  assert.ok(feedSummary(muitos).length <= 5);
});

test('uma mediana pequena não sustenta um sinal nem uma «peça mais forte»', () => {
  const a = auditPiece(peca({ readings: [leitura('shares', 53, { median: 1 }), leitura('reach', 1.1)] }));
  assert.equal(a.signals.length, 0);
  assert.equal(a.strongest?.metric, 'reach');
  // A linha relativa continua a dizer o número: é verdade, só não é padrão.
  assert.match(a.relativeLine, /Compartilhamentos: 53,0×/);
});

test('«outro» e «não classificado» não viram grupo de aprendizado', () => {
  const s = feedSummary([item('a', 'outro', 1.8), item('b', 'outro', 1.9), item('c', 'outro', 1.7), item('d', 'outro', 1.6)]);
  assert.equal(s.some((p) => p.text.includes('«outro»')), false);
});
