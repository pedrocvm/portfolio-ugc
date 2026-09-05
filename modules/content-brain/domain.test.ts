import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FUNCTIONAL_PILLARS,
  LEGACY_TERRITORY,
  MIN_STORIES_FOR_WEEK,
  PILLAR_SPEC,
  answerIdeaRequest,
  canGenerateScript,
  canStructure,
  canTransition,
  composeStage,
  contentDecision,
  contentGate,
  defaultPrivacy,
  eligibleForSuggestion,
  excludedTopicIn,
  factStatusAfterEdit,
  factsEditReopens,
  isAllowedBeauty,
  isExcludedTopic,
  isFunctionalPillar,
  isLegacyPillar,
  pillarCoverage,
  pillarToMap,
  type FunctionalPillar,
  type StoryFactState,
} from './domain';

/* ── Pilares funcionais ───────────────────────────────────────────────────── */

test('pilar é função, e as cinco etiquetas antigas não são pilares', () => {
  assert.equal(FUNCTIONAL_PILLARS.length, 4);
  for (const legado of ['A_SALA', 'TESTEI', 'CASA_A_DOIS', 'CORPO', 'LARGUEI_O_TURNO']) {
    assert.equal(isFunctionalPillar(legado), false, `${legado} não pode ser pilar`);
    assert.equal(isLegacyPillar(legado), true);
  }
});

test('uma etiqueta antiga vira território, nunca função', () => {
  // Reclassificar por palpite era o que o briefing proíbe: A_SALA descreve
  // assunto, e o mesmo assunto serve atração ou autoridade conforme o ângulo.
  assert.equal(LEGACY_TERRITORY.A_SALA, 'hospitality');
  assert.equal(LEGACY_TERRITORY.CORPO, 'training');
  for (const t of Object.values(LEGACY_TERRITORY)) {
    assert.equal(isFunctionalPillar(t), false);
  }
});

test('cada pilar declara matéria-prima e métricas próprias', () => {
  for (const p of FUNCTIONAL_PILLARS) {
    const spec = PILLAR_SPEC[p];
    assert.ok(spec.rawMaterial.length >= 3, `${p} precisa de matéria-prima`);
    assert.ok(spec.discovery.length >= 3, `${p} precisa de perguntas`);
    assert.ok(spec.primaryMetrics.length >= 1);
  }
  // Alcance não pode ser a métrica primária de toda a gente: seria julgar
  // conexão e autoridade pela régua de atração.
  assert.equal(PILLAR_SPEC.attraction_journey.primaryMetrics.includes('reach'), true);
  assert.equal(PILLAR_SPEC.authority_conversion.primaryMetrics.includes('reach'), false);
  assert.equal(PILLAR_SPEC.connection_personal.primaryMetrics.includes('reach'), false);
});

/* ── Skincare, em código ──────────────────────────────────────────────────── */

test('skincare está fora, e maquiagem continua dentro', () => {
  assert.equal(excludedTopicIn('rotina de skincare para rosácea'), 'skincare');
  assert.equal(excludedTopicIn('protetor solar novo'), 'skincare');
  assert.equal(excludedTopicIn('cronograma capilar'), 'haircare');
  assert.equal(excludedTopicIn('testei um batom novo'), null);
  assert.equal(isAllowedBeauty('maquiagem para o casamento'), true);
  assert.equal(isAllowedBeauty('maquiagem depois do skincare'), false);
});

test('o portão de conteúdo recusa skincare antes de olhar para o resto', () => {
  const gate = contentGate({ story: null, pillar: null, text: 'rotina de skincare' });
  assert.equal(gate.ok, false);
  assert.equal(gate.ok === false && gate.excluded, 'skincare');
});

test('acentos e maiúsculas não escapam ao filtro', () => {
  assert.equal(isExcludedTopic('ROSÁCEA'), true);
  assert.equal(isExcludedTopic('Rotina De Pele'), true);
});

/* ── O invariant ──────────────────────────────────────────────────────────── */

const story = (over: Partial<StoryFactState> = {}): StoryFactState => ({
  status: 'confirmed',
  factStatus: 'confirmed',
  factConfirmedAt: '2026-09-05T10:00:00Z',
  privacyLevel: 'content_ok',
  allowedForContent: true,
  pillar: 'attraction_journey',
  frameId: 'frame-1',
  ...over,
});

test('sem fatos confirmados não há conteúdo estruturado', () => {
  const r = canStructure(story({ factStatus: 'needs_confirmation', factConfirmedAt: null }));
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : '', /confirme/i);
});

test('confirmado sem carimbo de hora também não passa', () => {
  // Duas colunas que discordam é o caminho para o invariant ser contornado
  // por uma escrita parcial.
  assert.equal(canStructure(story({ factConfirmedAt: null })).ok, false);
});

test('história privada nunca vira conteúdo', () => {
  assert.equal(canStructure(story({ privacyLevel: 'private' })).ok, false);
  assert.equal(canStructure(story({ allowedForContent: false })).ok, false);
});

test('não se salta de capturada para publicada', () => {
  const capturada = story({ status: 'captured', factStatus: 'draft', factConfirmedAt: null });
  assert.equal(canTransition(capturada, 'published').ok, false);
  assert.equal(canTransition(capturada, 'structured').ok, false);
  assert.equal(canTransition(capturada, 'needs_confirmation').ok, true);
});

test('estruturar exige confirmação mesmo quando a tabela permitiria', () => {
  const mapeada = story({ status: 'mapped', factStatus: 'needs_confirmation', factConfirmedAt: null });
  assert.equal(canTransition(mapeada, 'structured').ok, false);
});

test('pronta para gravar exige ponto escolhido', () => {
  assert.equal(canTransition(story({ status: 'structured', frameId: null }), 'ready_to_record').ok, false);
  assert.equal(canTransition(story({ status: 'structured' }), 'ready_to_record').ok, true);
});

test('descartada não ressuscita', () => {
  assert.equal(canTransition(story({ status: 'rejected' }), 'confirmed').ok, false);
  assert.equal(canStructure(story({ status: 'rejected' })).ok, false);
});

test('o roteiro é a última etapa e não a primeira', () => {
  const s = story();
  assert.equal(canGenerateScript(s, { hasFrame: false, hasStructure: false }).ok, false);
  assert.equal(canGenerateScript(s, { hasFrame: true, hasStructure: false }).ok, false);
  assert.equal(canGenerateScript(s, { hasFrame: true, hasStructure: true }).ok, true);
  // E nunca sem fatos, por muito que tenha estrutura.
  assert.equal(
    canGenerateScript(story({ factStatus: 'draft', factConfirmedAt: null }), { hasFrame: true, hasStructure: true }).ok,
    false,
  );
});

/* ── Edição de fatos ──────────────────────────────────────────────────────── */

test('mudar um fato reabre a confirmação; mexer no espaço não', () => {
  assert.equal(factsEditReopens(['Fiquei duas horas'], ['Fiquei vinte minutos']), true);
  assert.equal(factsEditReopens(['Fiquei duas horas'], ['  Fiquei   duas horas ']), false);
  assert.equal(factsEditReopens(['a'], ['a', 'b']), true);
});

test('editar uma história já estruturada devolve-a à confirmação', () => {
  const depois = factStatusAfterEdit(story({ status: 'structured' }), true);
  assert.equal(depois.factStatus, 'needs_confirmation');
  assert.equal(depois.factConfirmedAt, null);
  assert.equal(depois.status, 'needs_confirmation');
});

/* ── Privacidade por origem ───────────────────────────────────────────────── */

test('um evento inferido entra restrito; o que ela contou entra liberado', () => {
  const email = defaultPrivacy('gmail_event');
  assert.equal(email.allowedForContent, false);
  assert.equal(email.privacyLevel, 'restricted');

  const audio = defaultPrivacy('user_audio');
  assert.equal(audio.allowedForContent, true);
  // Mesmo o que ela contou passa por confirmação factual: a transcrição pode
  // ter entendido mal.
  assert.equal(audio.factStatus, 'needs_confirmation');
});

test('privada e descartada saem das sugestões', () => {
  const base = { id: 'a', title: 'x', pillar: 'attraction_journey' as const, usedByContentId: null };
  assert.equal(eligibleForSuggestion({ ...story(), ...base }), true);
  assert.equal(eligibleForSuggestion({ ...story({ privacyLevel: 'private' }), ...base }), false);
  assert.equal(eligibleForSuggestion({ ...story({ status: 'rejected' }), ...base }), false);
  assert.equal(eligibleForSuggestion({ ...story(), ...base, usedByContentId: 'c1' }), false);
});

/* ── Cobertura e decisão do dia ───────────────────────────────────────────── */

test('cobertura conta só o que ainda dá para usar', () => {
  const cov = pillarCoverage([
    { pillar: 'attraction_journey', status: 'confirmed' },
    { pillar: 'attraction_journey', status: 'ready_to_record' },
    { pillar: 'attraction_journey', status: 'archived' },
    { pillar: 'connection_personal', status: 'confirmed' },
  ]);
  const atracao = cov.find((c) => c.pillar === 'attraction_journey')!;
  assert.equal(atracao.available, 2);
  assert.equal(atracao.ready, 1);
  assert.equal(atracao.needsMapping, MIN_STORIES_FOR_WEEK > 2);
});

test('o pilar a mapear é o de menor cobertura, e o empate resolve pela ordem canônica', () => {
  const cov = pillarCoverage([
    { pillar: 'attraction_journey', status: 'confirmed' },
    { pillar: 'attraction_journey', status: 'confirmed' },
    { pillar: 'attraction_journey', status: 'confirmed' },
    { pillar: 'connection_personal', status: 'confirmed' },
    { pillar: 'authority_conversion', status: 'confirmed' },
  ]);
  // Informação está a zero; autoridade a um. O menor ganha.
  assert.equal(pillarToMap(cov), 'information_retention');

  const empate = pillarCoverage([
    { pillar: 'attraction_journey', status: 'confirmed' },
    { pillar: 'attraction_journey', status: 'confirmed' },
    { pillar: 'attraction_journey', status: 'confirmed' },
  ]);
  assert.equal(pillarToMap(empate), 'information_retention');

  // Com tudo abastecido não há nada a mapear.
  const cheio = pillarCoverage(
    FUNCTIONAL_PILLARS.flatMap((p) =>
      Array.from({ length: MIN_STORIES_FOR_WEEK }, () => ({ pillar: p as string, status: 'confirmed' })),
    ),
  );
  assert.equal(pillarToMap(cheio), null);
});

const decisionInput = (over: Partial<Parameters<typeof contentDecision>[0]> = {}) => ({
  primaryPillar: 'attraction_journey' as FunctionalPillar,
  coverage: pillarCoverage([
    { pillar: 'attraction_journey', status: 'confirmed' },
    { pillar: 'attraction_journey', status: 'confirmed' },
    { pillar: 'attraction_journey', status: 'confirmed' },
    { pillar: 'information_retention', status: 'confirmed' },
    { pillar: 'information_retention', status: 'confirmed' },
    { pillar: 'information_retention', status: 'confirmed' },
    { pillar: 'authority_conversion', status: 'confirmed' },
    { pillar: 'authority_conversion', status: 'confirmed' },
    { pillar: 'authority_conversion', status: 'confirmed' },
    { pillar: 'connection_personal', status: 'confirmed' },
    { pillar: 'connection_personal', status: 'confirmed' },
    { pillar: 'connection_personal', status: 'confirmed' },
  ]),
  developing: 0,
  readyToRecord: 0,
  unlinkedMedia: 0,
  trialUnknown: 0,
  openCandidates: 0,
  signalsNeedingDecision: 0,
  weekCovered: true,
  ...over,
});

test('sem nada a decidir, o Hoje não inventa cartão de conteúdo', () => {
  assert.equal(contentDecision(decisionInput()), null);
});

test('sete sugestões viram um cartão só', () => {
  const d = contentDecision(decisionInput({ readyToRecord: 7 }));
  assert.equal(d?.type, 'content_record_ready');
  assert.equal(d?.covers, 7);
});

test('quando falta matéria-prima o cartão pede situação real, não ideia', () => {
  const d = contentDecision(
    decisionInput({ coverage: pillarCoverage([]), primaryPillar: 'attraction_journey' }),
  );
  assert.equal(d?.type, 'content_map_story');
  assert.match(d!.because, /situação real/i);
  assert.doesNotMatch(`${d!.headline} ${d!.because} ${d!.cta}`, /gerar|ideia|sugest/i);
});

test('vincular mídia nova ganha à gravação', () => {
  const d = contentDecision(decisionInput({ unlinkedMedia: 1, readyToRecord: 3 }));
  assert.equal(d?.type, 'content_link_media');
});

/* ── «Me dá uma ideia» ────────────────────────────────────────────────────── */

test('pedir uma ideia com banco vazio conduz à captura, não inventa história', () => {
  const r = answerIdeaRequest({
    pillar: 'attraction_journey',
    availableStories: [],
    discoveryQuestions: PILLAR_SPEC.attraction_journey.discovery,
  });
  assert.equal(r.kind, 'ask_for_material');
  assert.match(r.message, /situação real/i);
  assert.doesNotMatch(r.message, /aqui (vão|estão)|ideia \d|sugiro que você grave/i);
});

test('pedir uma ideia com banco cheio devolve o que ela contou', () => {
  const r = answerIdeaRequest({
    pillar: 'attraction_journey',
    availableStories: [
      { id: '1', title: 'Cenário que eu compliquei' },
      { id: '2', title: 'Primeira resposta de marca' },
    ],
    discoveryQuestions: [],
  });
  assert.equal(r.kind, 'existing_stories');
  assert.equal(r.kind === 'existing_stories' && r.stories.length, 2);
});

/* ── Etapa de composição ──────────────────────────────────────────────────── */

test('a etapa nunca chega a estrutura antes de fatos confirmados', () => {
  const s = composeStage({
    ...story({ factStatus: 'draft', factConfirmedAt: null }),
    hasMeaning: true,
    hasStructure: true,
  });
  assert.equal(s.current, 'raw_material');
  assert.ok(s.blocked);
});

test('com tudo pronto, a etapa seguinte é gravar', () => {
  const s = composeStage({ ...story(), hasMeaning: true, hasStructure: true });
  assert.equal(s.next, 'record');
  assert.equal(s.blocked, null);
});
