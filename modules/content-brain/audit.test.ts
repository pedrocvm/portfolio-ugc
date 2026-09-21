import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUDIT_ENGINE_VERSION,
  MATERIAL_CHANGE,
  MIN_EVIDENCE_FOR_LEARNED,
  accountSeries,
  auditDelta,
  buildAudit,
  compareAccountWindows,
  conclusionKey,
  draftRecommendations,
  genericAdvice,
  periodRange,
  rankConclusions,
  staleRecommendations,
  type AccountDay,
  type AuditConclusion,
  type AuditInput,
} from './audit';

/* ── Períodos ─────────────────────────────────────────────────────────────── */

const NOW = new Date('2026-09-21T12:00:00Z');

test('a janela anterior tem o mesmo tamanho da atual e acaba onde a atual começa', () => {
  const r = periodRange('30d', { now: NOW });
  assert.equal(r.from, '2026-08-22T12:00:00.000Z');
  assert.equal(r.to, '2026-09-21T12:00:00.000Z');
  assert.equal(r.previous?.to, r.from);
  assert.equal(r.previous?.from, '2026-07-23T12:00:00.000Z');
});

test('«todo o histórico» não tem janela anterior — e por isso não diz que piorou', () => {
  const r = periodRange('all', { now: NOW });
  assert.equal(r.from, null);
  assert.equal(r.previous, null);
});

test('um período personalizado deriva a janela anterior do próprio tamanho', () => {
  const r = periodRange('custom', { now: NOW, from: '2026-09-11T12:00:00Z', to: '2026-09-21T12:00:00Z' });
  assert.equal(r.previous?.from, '2026-09-01T12:00:00.000Z');
  assert.equal(r.previous?.to, '2026-09-11T12:00:00.000Z');
});

/* ── Evolução da conta ────────────────────────────────────────────────────── */

const dia = (observedOn: string, followersCount: number | null, extra: Partial<AccountDay> = {}): AccountDay => ({
  observedOn,
  followersCount,
  reach: null,
  views: null,
  accountsEngaged: null,
  totalInteractions: null,
  profileLinkTaps: null,
  ...extra,
});

test('o crescimento líquido deriva do histórico próprio, não de uma métrica da Meta', () => {
  const s = accountSeries([dia('2026-09-01', 1000), dia('2026-09-02', 1012), dia('2026-09-03', 1008)]);
  assert.equal(s[0].followersDelta, null);
  assert.equal(s[1].followersDelta, 12);
  assert.equal(s[2].followersDelta, -4);
});

test('um dia sem contagem não vira delta zero: compara com o último dia medido', () => {
  const s = accountSeries([dia('2026-09-01', 1000), dia('2026-09-02', null), dia('2026-09-03', 1020)]);
  assert.equal(s[1].followersDelta, null, 'o dia sem medição não inventa delta');
  assert.equal(s[2].followersDelta, 20, 'o dia seguinte compara com o último medido, não com zero');
});

test('uma janela com poucos dias medidos devolve «não sei», nunca «não mudou»', () => {
  const atual = accountSeries([dia('2026-09-20', 100, { reach: 500 }), dia('2026-09-21', 101, { reach: 600 })]);
  const anterior = accountSeries([
    dia('2026-09-01', 90, { reach: 400 }), dia('2026-09-02', 91, { reach: 410 }),
    dia('2026-09-03', 92, { reach: 420 }), dia('2026-09-04', 93, { reach: 430 }),
  ]);
  const reach = compareAccountWindows(atual, anterior).find((m) => m.metric === 'reach')!;
  assert.equal(reach.direction, 'unknown');
  assert.equal(reach.sample.current, 2);
});

test('uma variação abaixo do limiar é «estável», não «caiu»', () => {
  const dias = (base: number) =>
    accountSeries([1, 2, 3, 4].map((d) => dia(`2026-09-0${d}`, 100 + d, { reach: base })));
  const quase = compareAccountWindows(dias(100), dias(Math.round(100 / (1 - MATERIAL_CHANGE / 2))));
  assert.equal(quase.find((m) => m.metric === 'reach')!.direction, 'flat');
});

/* ── Conclusões ───────────────────────────────────────────────────────────── */

const vazio: AuditInput = {
  range: periodRange('30d', { now: NOW }),
  account: { current: [], previous: [] },
  feed: { points: [], comparable: 0, total: 0 },
  stories: { points: [], measuredSequences: 0 },
  learnings: [],
  experiments: [],
  now: NOW,
};

test('sem dados nenhuns não se fabrica conclusão nenhuma', () => {
  const r = buildAudit(vazio);
  assert.deepEqual(r.conclusions, []);
  assert.equal(r.nextTest, null);
  assert.match(r.coverage, /Ainda não importei nenhum conteúdo/);
});

test('conteúdo importado sem leitura comparável diz isso, em vez de mostrar zeros', () => {
  const r = buildAudit({ ...vazio, feed: { points: [], comparable: 0, total: 18 } });
  assert.equal(r.conclusions.length, 0);
  assert.match(r.coverage, /ainda não tenho medições comparáveis/);
});

test('um ponto do Feed sem evidência não vira conclusão', () => {
  const r = buildAudit({
    ...vazio,
    feed: { points: [{ text: 'Ainda não sei: nenhuma peça tem métricas comparáveis.', sample: '0', confidence: 'low', evidence: [] }], comparable: 0, total: 4 },
  });
  assert.equal(r.conclusions.length, 0, 'uma frase de «não sei» pertence à cobertura, não às conclusões');
});

test('um aprendizado validado vira conclusão com as peças que o sustentam', () => {
  const r = buildAudit({
    ...vazio,
    learnings: [{
      id: 'l1', statement: 'Reels de demonstração ficaram acima da sua mediana em compartilhamentos.',
      ladderState: 'validated', sampleSize: 4, confidence: 'high',
      evidenceIds: ['m1', 'm2', 'm3', 'm4'], derivedAt: NOW.toISOString(),
    }],
  });
  const c = r.conclusions.find((x) => x.bucket === 'learned')!;
  assert.deepEqual(c.evidence.mediaIds, ['m1', 'm2', 'm3', 'm4']);
  assert.deepEqual(c.evidence.learningIds, ['l1']);
  assert.equal(c.sample, 'Baseado em 4 conteúdos');
  assert.equal(c.engineVersion, AUDIT_ENGINE_VERSION);
});

test('um aprendizado contradito aparece como atenção, com a data da contradição', () => {
  const r = buildAudit({
    ...vazio,
    learnings: [{
      id: 'l2', statement: 'Conteúdos falando não se sustentaram.', ladderState: 'rejected',
      sampleSize: 3, confidence: 'medium', evidenceIds: ['m9'], derivedAt: NOW.toISOString(),
      contradictedAt: NOW.toISOString(),
    }],
  });
  assert.equal(r.conclusions[0].bucket, 'attention');
  assert.match(r.conclusions[0].text, /Deixei de tratar isso como padrão/);
});

test('nunca saem mais de seis conclusões, e a confiança ordena antes da amostra', () => {
  const faz = (i: number, conf: 'low' | 'medium' | 'high', n: number): AuditConclusion => ({
    key: conclusionKey('learned', `c${i}`), bucket: 'learned', text: `c${i}`, sample: '', sampleSize: n,
    confidence: conf, metric: null, comparator: '', evidence: { mediaIds: [], learningIds: [], experimentIds: [], sequenceIds: [] },
    engineVersion: AUDIT_ENGINE_VERSION,
  });
  const out = rankConclusions([faz(1, 'low', 90), faz(2, 'high', 3), ...Array.from({ length: 8 }, (_, i) => faz(i + 3, 'medium', i))]);
  assert.equal(out.length, 6);
  assert.equal(out[0].text, 'c2', 'a de confiança alta vem primeiro mesmo com amostra menor');
});

test('a mesma conclusão duas vezes só aparece uma', () => {
  const c: AuditConclusion = {
    key: conclusionKey('learned', 'igual'), bucket: 'learned', text: 'igual', sample: '', sampleSize: 3,
    confidence: 'low', metric: null, comparator: '', evidence: { mediaIds: [], learningIds: [], experimentIds: [], sequenceIds: [] },
    engineVersion: AUDIT_ENGINE_VERSION,
  };
  assert.equal(rankConclusions([c, { ...c }]).length, 1);
});

test('a chave de uma conclusão é estável entre corridas', () => {
  assert.equal(conclusionKey('learned', 'Reels de demonstração'), conclusionKey('learned', 'Reels de demonstração'));
  assert.notEqual(conclusionKey('learned', 'a'), conclusionKey('attention', 'a'));
});

/* ── Recomendações ────────────────────────────────────────────────────────── */

test('conselho de manual é recusado em código', () => {
  for (const frase of [
    'Poste mais vezes por semana.',
    'Seja consistente.',
    'Faça Reels.',
    'Use um CTA no final.',
    'Capriche no gancho.',
    'Crie conteúdo de valor.',
    'Engaje com a audiência.',
  ]) {
    assert.equal(genericAdvice(frase), true, frase);
  }
});

test('um conselho específico dela passa', () => {
  assert.equal(
    genericAdvice('Repita o formato de demonstração mantendo o corpo e mudando só os primeiros segundos.'),
    false,
  );
});

test('uma hipótese gera um teste já preenchido, com a evidência apontada', () => {
  const recs = draftRecommendations({
    ...vazio,
    learnings: [{
      id: 'l3', statement: 'Conteúdos como «demonstração» parecem render mais em compartilhamentos. Vale repetir esse caminho.',
      ladderState: 'hypothesis', sampleSize: 3, confidence: 'medium', evidenceIds: ['m1', 'm2', 'm3'], derivedAt: NOW.toISOString(),
    }],
  });
  const r = recs.find((x) => x.kind === 'test_variable')!;
  assert.ok(r.testDraft, 'o «Criar teste» não pode começar numa tela vazia');
  assert.equal(r.testDraft!.primaryMetric, 'shares');
  assert.deepEqual(r.evidence.mediaIds, ['m1', 'm2', 'm3']);
  assert.equal(r.evidence.learningIds[0], 'l3');
});

test('um sinal de uma só peça não pede mudança de estratégia', () => {
  const [r] = draftRecommendations({
    ...vazio,
    learnings: [{
      id: 'l4', statement: 'Há um sinal em conteúdos como «bastidores».', ladderState: 'signal',
      sampleSize: 1, confidence: 'low', evidenceIds: ['m7'], derivedAt: NOW.toISOString(),
    }],
  });
  assert.match(r.statement, /Ainda não mudaria a estratégia/);
});

test('um teste com resultado é a recomendação mais acionável que existe', () => {
  const recs = draftRecommendations({
    ...vazio,
    experiments: [{
      id: 'e1', label: 'Abertura curta', outcome: 'consistent', because: 'retenção 40% acima',
      sampleSize: 6, primaryMetric: 'avg_watch_time_seconds', mediaIds: ['m1', 'm2'],
    }],
    learnings: [{
      id: 'l5', statement: 'sinal fraco', ladderState: 'signal', sampleSize: 1,
      confidence: 'low', evidenceIds: [], derivedAt: NOW.toISOString(),
    }],
  });
  assert.equal(recs[0].kind, 'close_experiment');
  assert.deepEqual(recs[0].evidence.experimentIds, ['e1']);
});

test('uma recomendação cuja evidência morreu fica inválida, não superada', () => {
  const stale = staleRecommendations(
    [{ dedupeKey: 'test_variable:l9', evidence: { mediaIds: [], learningIds: ['l9'], experimentIds: [], sequenceIds: [] } }],
    [],
    { learningIds: new Set(), experimentIds: new Set() },
  );
  assert.equal(stale[0].status, 'invalid');
});

test('uma recomendação que os dados novos deixaram de pedir fica superada', () => {
  const stale = staleRecommendations(
    [{ dedupeKey: 'test_variable:l9', evidence: { mediaIds: [], learningIds: ['l9'], experimentIds: [], sequenceIds: [] } }],
    [],
    { learningIds: new Set(['l9']), experimentIds: new Set() },
  );
  assert.equal(stale[0].status, 'superseded');
});

test('uma recomendação que a auditoria nova continua gerando não é encerrada', () => {
  const fresh = draftRecommendations({
    ...vazio,
    learnings: [{
      id: 'l9', statement: 'x', ladderState: 'hypothesis', sampleSize: 3, confidence: 'medium',
      evidenceIds: [], derivedAt: NOW.toISOString(),
    }],
  });
  const stale = staleRecommendations(
    [{ dedupeKey: 'test_variable:l9', evidence: { mediaIds: [], learningIds: ['l9'], experimentIds: [], sequenceIds: [] } }],
    fresh,
    { learningIds: new Set(['l9']), experimentIds: new Set() },
  );
  assert.deepEqual(stale, []);
});

/* ── O que é novo ─────────────────────────────────────────────────────────── */

test('uma flutuação da conta não interrompe o dia dela', () => {
  const r = buildAudit({
    ...vazio,
    account: {
      current: accountSeries([1, 2, 3, 4].map((d) => dia(`2026-09-1${d}`, 100 + d, { reach: 1000 }))),
      previous: accountSeries([1, 2, 3, 4].map((d) => dia(`2026-09-0${d}`, 90 + d, { reach: 500 }))),
    },
  });
  assert.ok(r.conclusions.some((c) => c.bucket === 'improved'), 'a subida aparece na auditoria');
  assert.equal(auditDelta([], r).worthInterrupting, false, 'mas não vale uma interrupção');
});

test('um aprendizado novo com amostra e confiança vale a interrupção', () => {
  const r = buildAudit({
    ...vazio,
    learnings: [{
      id: 'l6', statement: 'Reels de demonstração são mais compartilhados.', ladderState: 'validated',
      sampleSize: 4, confidence: 'medium', evidenceIds: ['m1', 'm2', 'm3'], derivedAt: NOW.toISOString(),
    }],
  });
  assert.equal(auditDelta([], r).worthInterrupting, true);
  assert.equal(auditDelta(r.conclusions.map((c) => c.key), r).worthInterrupting, false, 'a mesma conclusão não interrompe duas vezes');
});

/* ── Uma peça só não é um aprendizado ─────────────────────────────────────── */

test('um ponto do Feed sustentado por uma peça vai para «merece atenção», nunca para «o que aprendemos»', () => {
  const r = buildAudit({
    ...vazio,
    feed: {
      points: [{
        text: 'A peça mais forte, relativa a você, é «Bate um consolo»: curtidas 3,5× a sua mediana.',
        sample: 'entre 3 peças comparáveis', confidence: 'low', evidence: ['m1'],
      }],
      comparable: 3, total: 7,
    },
  });
  assert.equal(r.conclusions.length, 1);
  assert.equal(r.conclusions[0].bucket, 'attention');
  assert.equal(r.conclusions[0].sampleSize, 1);
});

test('duas peças já podem sustentar um aprendizado', () => {
  const r = buildAudit({
    ...vazio,
    feed: {
      points: [{ text: 'Peças «demonstração» estão gerando compartilhamentos acima da sua mediana.', sample: '2 peças', confidence: 'low', evidence: ['m1', 'm2'] }],
      comparable: 4, total: 7,
    },
  });
  assert.equal(r.conclusions[0].bucket, 'learned');
});

test('nenhuma conclusão de «o que aprendemos» sai com uma peça só', () => {
  const r = buildAudit({
    ...vazio,
    feed: { points: [{ text: 'uma peça', sample: '', confidence: 'high', evidence: ['m1'] }], comparable: 3, total: 3 },
    learnings: [{
      id: 'l1', statement: 'validado com uma peça', ladderState: 'validated', sampleSize: 1,
      confidence: 'high', evidenceIds: ['m2'], derivedAt: NOW.toISOString(),
    }],
  });
  const aprendidos = r.conclusions.filter((c) => c.bucket === 'learned');
  assert.ok(aprendidos.every((c) => c.sampleSize >= MIN_EVIDENCE_FOR_LEARNED) || aprendidos.length === 0,
    `saiu um aprendizado com amostra 1: ${JSON.stringify(aprendidos.map((c) => [c.text, c.sampleSize]))}`);
});

/* ── Janela por dia ───────────────────────────────────────────────────────── */

test('a janela de 30 dias abrange 30 dias medidos, não 29', () => {
  // O retrato da conta é diário. Se o recorte usar o instante da corrida
  // (14:36) em vez do dia, o dia mais antigo cai fora e a janela encolhe.
  const r = periodRange('30d', { now: new Date('2026-09-21T14:36:00Z') });
  assert.equal(r.from!.slice(0, 10), '2026-08-22');
  assert.equal(r.to.slice(0, 10), '2026-09-21');
  assert.equal(r.previous!.from.slice(0, 10), '2026-07-23');
});
