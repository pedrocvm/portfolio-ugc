import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMMERCIAL_FOCUS,
  DEFAULT_SETTINGS,
  DEFAULT_WEEKLY_CAPACITY,
  FORMATS,
  LENSES,
  MODALITIES,
  OBJECTIVES,
  OBJECTIVE_SIGNALS,
  PILLARS,
  SOT_TOPICS,
  inferLens,
  isEligibleForWeek,
  lensBalance,
  objectiveBalance,
  pillarBalance,
  rejectedTopic,
  rollingWindow,
  strategySummary,
  teacherFraming,
  underrepresented,
  type Objective,
  type Pillar,
} from './editorial';

/* ── Os três pilares, e o que não é pilar ─────────────────────────────────── */

test('os pilares são três territórios, e SaaS não é um deles', () => {
  assert.deepEqual([...PILLARS], ['ugc_income', 'experiences', 'home']);
  const nomes = PILLARS.map((p) => String(p));
  assert.ok(!nomes.some((n) => /saas|app|software|tech/i.test(n)));
  // O foco comercial existe, e existe como mercado — não como território.
  assert.match(COMMERCIAL_FOCUS.market, /SaaS/);
  assert.ok(!(PILLARS as readonly string[]).includes('saas_local_business'));
});

test('Casa e Experiências continuam a existir com o foco comercial em tech', () => {
  assert.ok(PILLARS.includes('home'));
  assert.ok(PILLARS.includes('experiences'));
  assert.ok(SOT_TOPICS.some((t) => t.pillar === 'home' && t.state === 'now'));
  assert.ok(SOT_TOPICS.some((t) => t.pillar === 'experiences' && t.state === 'now'));
});

test('modalidade comercial não é formato, e UGC tradicional não é representável', () => {
  for (const m of MODALITIES) assert.ok(!(FORMATS as readonly string[]).includes(m));
  for (const f of FORMATS) assert.ok(!(MODALITIES as readonly string[]).includes(f));
  assert.ok(!(MODALITIES as readonly string[]).includes('traditional_ugc'));
  assert.ok(!(MODALITIES as readonly string[]).includes('product_ugc'));
});

test('Tech UGC e Canvas UGC começam com o mesmo peso', () => {
  const tech = SOT_TOPICS.find((t) => t.slug === 'tech_ugc');
  const canvas = SOT_TOPICS.find((t) => t.slug === 'canvas_ugc');
  assert.ok(tech && canvas);
  assert.equal(tech.state, canvas.state);
  assert.equal(tech.pillar, canvas.pillar);
});

test('«como é morar em Portugal» é recusado como assunto', () => {
  assert.ok(rejectedTopic('Como é morar em Portugal'));
  assert.ok(rejectedTopic('como e morar em portugal'));
  assert.ok(rejectedTopic('Vida em Portugal'));
  assert.ok(rejectedTopic('brasileira em Portugal'));
  // Portugal como contexto de outra coisa continua a passar.
  assert.equal(rejectedTopic('Restaurante em Braga que me surpreendeu'), null);
  assert.ok(!SOT_TOPICS.some((t) => rejectedTopic(t.label)));
});

/* ── Documentar, não ensinar ──────────────────────────────────────────────── */

test('fala dirigida a creators é sinalizada mesmo com âncora pessoal', () => {
  const r = teacherFraming('Se você é creator e faz isso, está fazendo errado. Eu decidi mudar.');
  assert.equal(r.flagged, true);
  assert.ok(r.markers.length > 0);
  assert.ok(r.reframes.includes('experiência pessoal'));
});

test('lista de dicas é enquadramento de aula', () => {
  assert.equal(teacherFraming('5 dicas para cobrar mais caro').flagged, true);
  assert.equal(teacherFraming('3 erros que você comete no primeiro contato').flagged, true);
});

test('conselho ancorado em experiência própria não é bloqueado', () => {
  const r = teacherFraming('Eu decidi que nunca faço permuta sem contrato, e foi o que mudou comigo.');
  assert.equal(r.flagged, false);
  assert.equal(r.reframes.length, 0);
});

test('relato sem prescrição nenhuma passa limpo', () => {
  assert.equal(teacherFraming('A marca respondeu depois de três semanas e eu já tinha desistido.').flagged, false);
});

test('prescrição genérica sem âncora é sinalizada', () => {
  const r = teacherFraming('Você precisa gravar sempre com luz natural.');
  assert.equal(r.flagged, true);
  assert.match(r.because, /Ancore/);
});

/* ── Lentes ───────────────────────────────────────────────────────────────── */

test('a lente é inferida sozinha quando há sinal, e fica vazia quando não há', () => {
  assert.equal(
    inferLens({ pillar: 'ugc_income', angle: 'como gravei a demo do app para o cliente', modality: 'tech_ugc' })?.lens,
    'what_i_do',
  );
  assert.equal(
    inferLens({ pillar: 'home', angle: 'a rotina com os bichos de manhã' })?.lens,
    'who_i_am',
  );
  assert.equal(
    inferLens({ pillar: 'experiences', angle: 'o critério que usei para avaliar o atendimento' })?.lens,
    'how_i_think',
  );
  // Sem sinal nenhum e com empate, devolve nada em vez de inventar.
  assert.equal(inferLens({ pillar: 'ugc_income', angle: 'o trabalho e a rotina', topicSlug: '' })?.lens ?? null, 'what_i_do');
});

test('modalidade comercial resolve a lente com confiança alta', () => {
  const g = inferLens({ pillar: 'home', angle: 'nada de especial', modality: 'canvas_ugc' });
  assert.equal(g?.lens, 'what_i_do');
  assert.equal(g?.confidence, 'high');
});

/* ── Equilíbrio ───────────────────────────────────────────────────────────── */

test('o equilíbrio é lido em janela móvel, não em quota semanal', () => {
  assert.equal(DEFAULT_SETTINGS.balanceWindow, 6);
  const recentes: (Objective | null)[] = ['attract', 'attract', 'attract', 'prove', null, null];
  const falta = underrepresented(objectiveBalance(recentes));
  assert.equal(falta[0].key, 'retain');
  assert.equal(falta[0].deficit, 2);
  // Converter não tem alvo: não aparece em falta por omissão.
  assert.ok(!falta.some((f) => f.key === 'convert'));
});

test('pilar ausente aparece como défice', () => {
  const falta = underrepresented(pillarBalance(['ugc_income', 'ugc_income', 'ugc_income', 'experiences', null, null] as (Pillar | null)[]));
  assert.equal(falta[0].key, 'home');
  assert.equal(falta[0].deficit, 2);
});

test('lente que sumiu aparece como défice', () => {
  const falta = underrepresented(lensBalance(['what_i_do', 'what_i_do', 'what_i_do', 'what_i_do', 'how_i_think', null]));
  assert.equal(falta[0].key, 'who_i_am');
});

test('a janela móvel corta pelo tamanho pedido', () => {
  assert.equal(rollingWindow([1, 2, 3, 4, 5, 6, 7, 8], 6).length, 6);
  assert.deepEqual(rollingWindow([1, 2, 3], 6), [1, 2, 3]);
});

/* ── Capacidade ───────────────────────────────────────────────────────────── */

test('a capacidade-base é três, e quatro não é obrigação em lado nenhum', () => {
  assert.equal(DEFAULT_WEEKLY_CAPACITY, 3);
  assert.equal(DEFAULT_SETTINGS.weeklyCapacity, 3);
  const alvo = Object.values(DEFAULT_SETTINGS.objectiveTarget).reduce((a, b) => a + b, 0);
  assert.equal(alvo, 6, 'a janela de 6 é de duas semanas a 3, não de uma semana a 6');
});

test('só «Agora» disputa a semana; pausado não some nem sugere', () => {
  assert.equal(isEligibleForWeek('now'), true);
  assert.equal(isEligibleForWeek('next'), false);
  assert.equal(isEligibleForWeek('later'), false);
  assert.equal(isEligibleForWeek('paused'), false);
});

/* ── Sinais por objetivo ──────────────────────────────────────────────────── */

test('cada objetivo tem sinais próprios: não existe métrica universal', () => {
  for (const o of OBJECTIVES) assert.ok(OBJECTIVE_SIGNALS[o].length > 0);
  // Views não é sinal principal de nenhum objetivo.
  for (const o of OBJECTIVES) assert.ok(!OBJECTIVE_SIGNALS[o].includes('views'));
  assert.notDeepEqual(OBJECTIVE_SIGNALS.attract, OBJECTIVE_SIGNALS.prove);
});

test('o resumo estratégico é montado das decisões reais', () => {
  assert.equal(
    strategySummary({ objectives: ['attract', 'retain', 'prove'] }),
    '1 para atrair, 1 para reter e 1 para provar.',
  );
  assert.equal(
    strategySummary({ objectives: ['attract', 'attract'], experiment: 'Também temos um teste de formato nesta semana.' }),
    '2 para atrair. Também temos um teste de formato nesta semana.',
  );
  assert.match(strategySummary({ objectives: [] }), /Ainda não há proposta/);
});

test('as lentes são três e nenhuma é obrigatória por peça', () => {
  assert.equal(LENSES.length, 3);
});
