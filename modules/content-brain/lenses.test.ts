import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FUNCTIONAL_PILLARS,
  LENS_LIBRARY,
  LENS_LIBRARY_VERSION,
  NO_LENS_FITS_LINE,
  NO_MEMORY_LINE,
  ROTATION_DAYS,
  VISIBLE_LENSES_MOBILE,
  auditLibrary,
  canStructure,
  checkAbstractStructure,
  checkMemoryPrompt,
  contentGate,
  excludedTopicIn,
  isLensId,
  lensById,
  lensesForPillar,
  nextLensAfterMiss,
  rankLenses,
  type FunctionalPillar,
  type LensState,
} from './domain';

const estado = (over: Partial<LensState> & { lensId: string }): LensState => ({
  timesShown: 0,
  timesSelected: 0,
  storiesFound: 0,
  contentDerived: 0,
  dismissedCount: 0,
  preference: 'none',
  lastUsedAt: null,
  ...over,
});

const now = new Date('2026-09-06T10:00:00Z');
const haDias = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

/* ── A biblioteca ─────────────────────────────────────────────────────────── */

test('a biblioteca inteira passa nas suas próprias regras', () => {
  // Isto é o teste que apanha uma lente nova mal escrita antes do commit.
  assert.deepEqual(auditLibrary(), []);
});

test('cada lente pertence a um pilar funcional, e os quatro têm lentes', () => {
  for (const lens of LENS_LIBRARY) {
    assert.ok(FUNCTIONAL_PILLARS.includes(lens.pillar), `${lens.id} tem pilar inválido`);
  }
  for (const p of FUNCTIONAL_PILLARS) {
    assert.ok(lensesForPillar(p).length >= 8, `${p} tem poucas lentes`);
  }
});

test('a lente de um pilar não aparece nos outros', () => {
  const atracao = lensesForPillar('attraction_journey').map((l) => l.id);
  const conexao = lensesForPillar('connection_personal').map((l) => l.id);
  assert.equal(atracao.some((id) => conexao.includes(id)), false);
  assert.ok(atracao.includes('expectation_vs_reality'));
  assert.equal(conexao.includes('expectation_vs_reality'), false);
});

test('a biblioteca é extensível sem enum rígido, mas valida em runtime', () => {
  assert.equal(isLensId('failure'), true);
  assert.equal(isLensId('lente_que_nao_existe'), false);
  assert.equal(isLensId(null), false);
  assert.equal(lensById('failure')?.label, 'Algo que deu errado');
  assert.equal(lensById('inventada'), null);
  assert.match(LENS_LIBRARY_VERSION, /V1$/);
});

/* ── Perguntas que não pressupõem fato ────────────────────────────────────── */

test('uma pergunta que dá o acontecimento como certo é recusada', () => {
  // A do briefing, literalmente.
  const ma = checkMemoryPrompt('Quando uma marca recusou sua proposta, o que você sentiu?');
  assert.equal(ma.ok, false);
  assert.ok(ma.reason);

  assert.equal(checkMemoryPrompt('Na vez que você quase desistiu, o que te segurou?').ok, false);
  assert.equal(checkMemoryPrompt('Como você se sentiu quando perdeu o cliente?').ok, false);
  assert.equal(checkMemoryPrompt('Conta sobre a vez que deu tudo errado.').ok, false);

  // A certa.
  assert.equal(
    checkMemoryPrompt('Alguma marca respondeu de um jeito diferente do que você esperava?').ok,
    true,
  );
  assert.equal(
    checkMemoryPrompt('Teve alguma abordagem que você achava que ia funcionar e não funcionou?').ok,
    true,
  );
});

test('nenhuma pergunta da biblioteca pressupõe fato', () => {
  const maus: string[] = [];
  for (const lens of LENS_LIBRARY) {
    for (const p of [...lens.memoryPrompts, ...lens.followUpPrompts]) {
      const c = checkMemoryPrompt(p);
      if (!c.ok) maus.push(`${lens.id}: «${p}» — ${c.reason}`);
    }
  }
  assert.deepEqual(maus, []);
});

test('os exemplos são formas, não histórias dela', () => {
  assert.equal(checkAbstractStructure('Eu achava X → aconteceu Y → percebi Z').ok, true);
  // Uma quantidade concreta é um fato disfarçado de exemplo.
  assert.equal(checkAbstractStructure('Fiquei duas horas mudando o cenário').ok, false);
  assert.equal(checkAbstractStructure('Repeti 12 vezes o mesmo take').ok, false);

  const maus: string[] = [];
  for (const lens of LENS_LIBRARY) {
    for (const s of lens.abstractStructures) {
      if (!checkAbstractStructure(s).ok) maus.push(`${lens.id}: «${s}»`);
    }
  }
  assert.deepEqual(maus, []);
});

/* ── Ranking ──────────────────────────────────────────────────────────────── */

test('sem dados nenhuns, a ordem é a do pilar e não inventa estatística', () => {
  const r = rankLenses({ pillar: 'attraction_journey', states: [], now });
  assert.equal(r.length, lensesForPillar('attraction_journey').length);
  assert.deepEqual(
    r.map((x) => x.lens.id),
    lensesForPillar('attraction_journey').map((l) => l.id),
  );
  // E ninguém tem justificação inventada.
  assert.deepEqual(r.flatMap((x) => x.because), []);
});

test('a mesma lente não sai quatro semanas seguidas', () => {
  const semDados = rankLenses({ pillar: 'attraction_journey', states: [], now });
  const primeira = semDados[0].lens.id;

  const depoisDeUsar = rankLenses({
    pillar: 'attraction_journey',
    states: [estado({ lensId: primeira, lastUsedAt: haDias(1), timesSelected: 1 })],
    recentlyUsed: [primeira],
    now,
  });
  assert.notEqual(depoisDeUsar[0].lens.id, primeira, 'usada ontem e continua em primeiro');

  // Passada a janela de rotação, volta a poder aparecer: a vida dela repete-se.
  const passadoOTempo = rankLenses({
    pillar: 'attraction_journey',
    states: [estado({ lensId: primeira, lastUsedAt: haDias(ROTATION_DAYS + 5) })],
    now,
  });
  assert.equal(passadoOTempo[0].lens.id, primeira);
});

test('«não combina comigo» sai das recomendações sem apagar o histórico', () => {
  const fora = 'relationship';
  const r = rankLenses({
    pillar: 'connection_personal',
    states: [estado({ lensId: fora, preference: 'not_for_carol', timesShown: 4, storiesFound: 1 })],
    now,
  });
  assert.equal(r.some((x) => x.lens.id === fora), false);
  // A lente continua a existir na biblioteca — o que muda é a recomendação.
  assert.ok(lensById(fora));
});

test('o que ela disse que gosta sobe, e o que ela adiou desce', () => {
  const lentes = lensesForPillar('attraction_journey');
  const ultima = lentes[lentes.length - 1].id;
  const r = rankLenses({
    pillar: 'attraction_journey',
    states: [estado({ lensId: ultima, preference: 'liked' })],
    now,
  });
  assert.equal(r[0].lens.id, ultima);
  assert.ok(r[0].because.some((b) => /gosta/.test(b)));
});

test('histórias reais pesam mais do que cliques', () => {
  const lentes = lensesForPillar('information_retention');
  const produtiva = lentes[lentes.length - 1].id;
  const clicada = lentes[lentes.length - 2].id;

  const r = rankLenses({
    pillar: 'information_retention',
    states: [
      estado({ lensId: produtiva, timesShown: 3, timesSelected: 2, storiesFound: 2 }),
      estado({ lensId: clicada, timesShown: 9, timesSelected: 6, storiesFound: 0, dismissedCount: 4 }),
    ],
    now,
  });
  const pos = (id: string) => r.findIndex((x) => x.lens.id === id);
  assert.ok(pos(produtiva) < pos(clicada), 'a que só é clicada ficou à frente da que dá histórias');
});

test('sem aprendizado validado, o ranking não finge que sabe', () => {
  // Um sinal não entra. Só `validatedLenses` — e isso é preenchido pela escada.
  const semNada = rankLenses({ pillar: 'authority_conversion', states: [], now });
  const comValidado = rankLenses({
    pillar: 'authority_conversion',
    states: [],
    validatedLenses: ['brand_feedback'],
    now,
  });
  assert.deepEqual(semNada.flatMap((x) => x.because), []);
  assert.ok(comValidado.find((x) => x.lens.id === 'brand_feedback')!.because.some((b) => /validado/.test(b)));
});

test('a tela mostra poucas de cada vez', () => {
  assert.equal(VISIBLE_LENSES_MOBILE, 4);
  const r = rankLenses({ pillar: 'attraction_journey', states: [], now });
  assert.ok(r.length > VISIBLE_LENSES_MOBILE, 'há mais lentes do que as visíveis, e é isso que o «mais» resolve');
});

/* ── «Não lembrei de nada» ────────────────────────────────────────────────── */

test('não se lembrar troca de lente em vez de inventar', () => {
  const r = rankLenses({ pillar: 'attraction_journey', states: [], now });
  const primeira = r[0].lens.id;
  const seguinte = nextLensAfterMiss(r, [primeira]);
  assert.ok(seguinte);
  assert.notEqual(seguinte!.id, primeira);
  assert.match(NO_MEMORY_LINE, /outro caminho/i);
  assert.doesNotMatch(NO_MEMORY_LINE, /ideia|sugest/i);
});

test('quando todas as lentes foram tentadas, oferece contar diretamente', () => {
  const r = rankLenses({ pillar: 'attraction_journey', states: [], now });
  const todas = r.map((x) => x.lens.id);
  assert.equal(nextLensAfterMiss(r, todas), null);
  assert.match(NO_LENS_FITS_LINE, /contar diretamente/i);
  // Nunca «não há ideias disponíveis».
  assert.doesNotMatch(NO_LENS_FITS_LINE, /não há|nenhuma ideia/i);
});

/* ── A lente não é matéria-prima ──────────────────────────────────────────── */

test('uma lente sozinha nunca vira uma história estruturada', () => {
  // Escolher uma direção não é ter vivido nada. O portão continua a ser o
  // mesmo: fato confirmado por ela.
  const soComLente = {
    status: 'captured' as const,
    factStatus: 'draft' as const,
    factConfirmedAt: null,
    privacyLevel: 'content_ok' as const,
    allowedForContent: true,
    pillar: 'attraction_journey',
    frameId: null,
  };
  assert.equal(canStructure(soComLente).ok, false);

  const gate = contentGate({
    story: soComLente,
    pillar: 'attraction_journey',
    text: 'expectativa x realidade',
  });
  assert.equal(gate.ok, false);
});

test('lente não substitui pilar nem território', () => {
  const lens = lensById('expectation_vs_reality')!;
  // A lente tem um pilar; não É um pilar.
  assert.equal(FUNCTIONAL_PILLARS.includes(lens.id as FunctionalPillar), false);
  // E não é território: não há sobreposição de nomes com a lista de assuntos.
  const territorios = ['pets', 'relationship', 'training', 'home'];
  const lentesComNomeDeTerritorio = LENS_LIBRARY.filter((l) => territorios.includes(l.id));
  // As de conexão partilham o nome de propósito — mas continuam a ser lentes,
  // com pilar, perguntas e formatos, e não etiquetas.
  for (const l of lentesComNomeDeTerritorio) {
    assert.ok(l.memoryPrompts.length >= 2, `${l.id} devia ser uma lente completa`);
    assert.ok(l.pillar);
  }
});

test('skincare continua fora, e a biblioteca não o traz de volta', () => {
  const tudo = LENS_LIBRARY.flatMap((l) => [
    l.label, l.description, l.whatToLookFor, ...l.memoryPrompts, ...l.followUpPrompts,
  ]).join(' ');
  assert.equal(excludedTopicIn(tudo), null, 'uma lente menciona skincare ou haircare');
});
