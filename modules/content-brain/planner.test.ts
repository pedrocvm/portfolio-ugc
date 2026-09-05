import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_CANDIDATES_PER_DAY,
  SERIES_POLICY_V1,
  acceptEpisodes,
  candidateFor,
  checkQuestion,
  consolidate,
  filterQuestions,
  nextEpisodeLine,
  nextStep,
  pillarCoverage,
  planWeek,
  seriesEligibility,
  unsupportedBeats,
  validFrames,
  validateSlots,
  type ClusterInput,
  type PlannerStory,
} from './domain';

/* ── Planeamento semanal ──────────────────────────────────────────────────── */

const cobertura = (n: Record<string, number>) =>
  pillarCoverage(
    Object.entries(n).flatMap(([p, q]) => Array.from({ length: q }, () => ({ pillar: p, status: 'confirmed' }))),
  );

const historia = (id: string, pillar: PlannerStory['pillar'], ready = false): PlannerStory => ({
  id, title: `história ${id}`, pillar, ready, eligible: true, seriesId: null,
});

test('a semana escolhe entre histórias reais e nunca gera texto', () => {
  const plano = planWeek({
    weekStart: '2026-09-07',
    primaryPillar: 'attraction_journey',
    coverage: cobertura({ attraction_journey: 5, connection_personal: 3, authority_conversion: 3, information_retention: 3 }),
    stories: [
      historia('a', 'attraction_journey', true),
      historia('b', 'attraction_journey'),
      historia('c', 'attraction_journey'),
      historia('d', 'connection_personal'),
    ],
    commercialDeadlines: [],
    capacity: 4,
  });

  assert.equal(plano.mappingOnly, false);
  const slots = plano.slots.filter((s) => s.kind === 'story');
  assert.ok(slots.length >= 2);
  // Todos os slots apontam para um id que existe.
  assert.deepEqual(validateSlots(plano.slots, { storyIds: ['a', 'b', 'c', 'd'], contentIds: [] }), { ok: true });
});

test('sem inventário o planner pede mapeamento em vez de encher a semana', () => {
  const plano = planWeek({
    weekStart: '2026-09-07',
    primaryPillar: 'attraction_journey',
    coverage: cobertura({}),
    stories: [],
    commercialDeadlines: [],
    capacity: 4,
  });

  assert.equal(plano.mappingOnly, true);
  assert.equal(plano.slots.length, 1);
  assert.equal(plano.slots[0].kind, 'map_pillar');
  assert.match(plano.rationale, /matéria-prima/i);
  assert.doesNotMatch(plano.rationale, /ideia|gerar/i);
});

test('um slot que aponta para uma história inexistente é inválido', () => {
  const r = validateSlots(
    [{ kind: 'story', order: 0, pillar: 'attraction_journey', purpose: 'primary', storyId: 'fantasma', title: 'x', ready: false }],
    { storyIds: ['a'], contentIds: [] },
  );
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.invalid.length, 1);
});

test('prazo comercial entra primeiro e o plano orgânico acomoda-se', () => {
  const plano = planWeek({
    weekStart: '2026-09-07',
    primaryPillar: 'attraction_journey',
    coverage: cobertura({ attraction_journey: 5 }),
    stories: [historia('a', 'attraction_journey', true)],
    commercialDeadlines: [{ contentId: 'c1', title: 'Peça da marca', dueAt: '2026-09-09' }],
    capacity: 3,
  });
  assert.equal(plano.slots[0].kind, 'content');
  assert.equal(plano.slots[0].purpose, 'commercial');
});

test('histórias prontas entram antes das que ainda precisam de trabalho', () => {
  const plano = planWeek({
    weekStart: '2026-09-07',
    primaryPillar: 'attraction_journey',
    coverage: cobertura({ attraction_journey: 5 }),
    stories: [historia('cru', 'attraction_journey', false), historia('pronta', 'attraction_journey', true)],
    commercialDeadlines: [],
    capacity: 2,
  });
  const primeiro = plano.slots.find((s) => s.kind === 'story');
  assert.equal(primeiro?.kind === 'story' && primeiro.storyId, 'pronta');
});

test('mesmo com capacidade grande, só entra o que existe', () => {
  const plano = planWeek({
    weekStart: '2026-09-07',
    primaryPillar: 'attraction_journey',
    coverage: cobertura({ attraction_journey: 1 }),
    stories: [historia('a', 'attraction_journey')],
    commercialDeadlines: [],
    capacity: 7,
  });
  assert.equal(plano.slots.filter((s) => s.kind === 'story').length, 1);
  // O resto não vira slot vazio: vira uma ação de mapear, uma só.
  assert.equal(plano.slots.filter((s) => s.kind === 'map_pillar').length, 1);
});

/* ── Séries ───────────────────────────────────────────────────────────────── */

const cluster = (id: string, over: Partial<ClusterInput> = {}): ClusterInput => ({
  storyId: id,
  title: `h${id}`,
  pillar: 'attraction_journey',
  territories: ['ugc_journey'],
  factConfirmed: true,
  allowedForContent: true,
  occurredAt: '2026-09-01',
  ...over,
});

test('uma história só não faz série', () => {
  const r = seriesEligibility([cluster('1')]);
  assert.equal(r.ok, false);
});

test('histórias por confirmar não sustentam série', () => {
  const r = seriesEligibility([cluster('1', { factConfirmed: false }), cluster('2', { factConfirmed: false })]);
  assert.equal(r.ok, false);
});

test('três histórias confirmadas no mesmo arco viram sugestão forte', () => {
  const r = seriesEligibility([cluster('1'), cluster('2'), cluster('3')]);
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.strength, 'strong');
  assert.equal(r.ok === true && r.storyIds.length, 3);
  assert.equal(SERIES_POLICY_V1.strongStories, 3);
});

test('histórias sem nada em comum não viram série à força', () => {
  const r = seriesEligibility([
    cluster('1', { territories: ['pets'], pillar: 'connection_personal' }),
    cluster('2', { territories: ['tech'], pillar: 'authority_conversion' }),
  ]);
  assert.equal(r.ok, false);
});

test('um episódio sem história real é recusado', () => {
  const { accepted, rejected } = acceptEpisodes(
    [{ storyId: 'existe' }, { storyId: null, title: 'Episódio 4: a viver' }, { storyId: 'fantasma' }],
    ['existe'],
  );
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 2);
});

test('a série não cobra episódios que ainda não aconteceram', () => {
  const linha = nextEpisodeLine({ unusedStories: 0, mechanism: 'journey' });
  assert.match(linha, /não vou inventar/i);
  assert.doesNotMatch(linha, /faltam|precisa gravar/i);
});

/* ── Entrevista ───────────────────────────────────────────────────────────── */

test('perguntas que induzem a resposta são recusadas', () => {
  assert.equal(checkQuestion('E se você dissesse que quase desistiu?').ok, false);
  assert.equal(checkQuestion('Podemos fingir que o teu namorado fez isso?').ok, false);
  assert.equal(checkQuestion('O que você pensou quando viu isso?').ok, true);
});

test('uma pergunta de cada vez', () => {
  assert.equal(checkQuestion('O que aconteceu? E depois? E o que sentiu?').ok, false);
  const { accepted, rejected } = filterQuestions([
    { kind: 'fact', text: 'O que aconteceu depois?' },
    { kind: 'reaction', text: 'E se você dissesse que foi horrível?' },
  ]);
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
});

test('a entrevista resume antes de continuar a perguntar', () => {
  assert.deepEqual(nextStep({ answers: 0, hasFacts: false, hasMeaning: false, hasPrivacyAnswer: false, hasContinuityAnswer: false }), { step: 'ask', kind: 'fact' });
  assert.deepEqual(nextStep({ answers: 3, hasFacts: true, hasMeaning: false, hasPrivacyAnswer: false, hasContinuityAnswer: false }), { step: 'summarize' });
  assert.deepEqual(nextStep({ answers: 4, hasFacts: true, hasMeaning: true, hasPrivacyAnswer: true, hasContinuityAnswer: true }), { step: 'ready' });
});

test('um enquadramento que não se apoia em fatos é recusado', () => {
  const { accepted, rejected } = validFrames(
    [
      { id: 'a', label: 'Eu complico tentando melhorar', because: 'fatos 0 e 2', factIndexes: [0, 2] },
      { id: 'b', label: 'Quase desisti da carreira', because: 'inventado', factIndexes: [] },
      { id: 'c', label: 'Fora do alcance', because: 'x', factIndexes: [9] },
    ],
    3,
  );
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 2);
});

test('um momento sem fato de apoio é marcado, não aceite em silêncio', () => {
  const sem = unsupportedBeats(
    {
      beats: [
        { order: 1, purpose: 'open', intent: 'entrar no problema', factIndexes: [0] },
        { order: 2, purpose: 'turn', intent: 'a crise que ela nunca contou', factIndexes: [] },
      ],
    },
    2,
  );
  assert.equal(sem.length, 1);
  assert.equal(sem[0].order, 2);
});

/* ── Candidatos proativos ─────────────────────────────────────────────────── */

const ctx = { seenKeys: [] as string[], recent: [] as { source: 'brand_reply'; brandId: string | null; at: string }[] };

test('um evento comercial vira pergunta, nunca conteúdo', () => {
  const r = candidateFor(
    { source: 'brand_reply', externalKey: 'thread-1', brandId: 'b1', brandName: 'Cecotec', fact: 'Ela disse que encontrou você pelo Instagram.', occurredAt: '2026-09-05T09:00:00Z' },
    ctx,
  );
  assert.equal(r.ok, true);
  assert.match(r.ok === true ? r.candidate.question : '', /significado|só mais um/i);
  // A pergunta não sugere a resposta.
  assert.doesNotMatch(r.ok === true ? r.candidate.question : '', /marco importante|incrível|não foi\?/i);
});

test('não se pergunta duas vezes sobre o mesmo acontecimento', () => {
  const evento = { source: 'brand_reply' as const, externalKey: 't1', brandId: 'b1', fact: 'Uma marca respondeu em dois dias.', occurredAt: '2026-09-05T09:00:00Z' };
  const primeira = candidateFor(evento, ctx);
  assert.equal(primeira.ok, true);
  const segunda = candidateFor(evento, { ...ctx, seenKeys: [primeira.ok === true ? primeira.candidate.dedupeKey : ''] });
  assert.equal(segunda.ok, false);
});

test('o cooldown impede seis emails da mesma marca virarem seis cartões', () => {
  const r = candidateFor(
    { source: 'brand_reply', externalKey: 't2', brandId: 'b1', fact: 'Outra resposta da mesma marca.', occurredAt: '2026-09-05T09:00:00Z' },
    { seenKeys: [], recent: [{ source: 'brand_reply', brandId: 'b1', at: '2026-09-04T09:00:00Z' }], now: new Date('2026-09-05T09:00:00Z') },
  );
  assert.equal(r.ok, false);
});

test('sem fato concreto não há pergunta', () => {
  const r = candidateFor({ source: 'brand_reply', externalKey: 't3', fact: 'ok', occurredAt: '2026-09-05T09:00:00Z' }, ctx);
  assert.equal(r.ok, false);
});

test('eventos do mesmo dia e da mesma marca consolidam num cartão', () => {
  const base = { source: 'brand_reply' as const, question: 'q', brandId: 'b1', brandName: 'X', evidenceRefs: [] as string[] };
  const juntos = consolidate([
    { ...base, dedupeKey: 'k1', fact: 'Respondeu de manhã.', occurredAt: '2026-09-05T09:00:00Z' },
    { ...base, dedupeKey: 'k2', fact: 'E mandou o briefing à tarde.', occurredAt: '2026-09-05T16:00:00Z' },
  ]);
  assert.equal(juntos.length, 1);
  assert.match(juntos[0].fact, /manhã.*briefing/s);
  assert.equal(MAX_CANDIDATES_PER_DAY, 2);
});
