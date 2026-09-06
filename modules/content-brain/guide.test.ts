import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTENT_BRAIN_GUIDE_VERSION,
  GUIDE_STEPS,
  TEACHING_STEPS,
  clampStep,
  guidePatch,
  guidePercent,
  isFirstGuideStep,
  isLastGuideStep,
  nextGuideStep,
  prevGuideStep,
  readGuideState,
  resumeGuideStep,
  shouldOfferFirstRun,
  type GuideState,
} from './guide';

const estado = (over: Partial<GuideState> = {}): GuideState => ({
  version: CONTENT_BRAIN_GUIDE_VERSION,
  lastStep: 0,
  dismissedAt: null,
  completedAt: null,
  ...over,
});

/* ── A forma do guia ──────────────────────────────────────────────────────── */

test('são oito etapas de ensino mais o fecho', () => {
  assert.equal(TEACHING_STEPS, 8);
  assert.equal(GUIDE_STEPS.length, TEACHING_STEPS + 1);
  assert.equal(GUIDE_STEPS[GUIDE_STEPS.length - 1], 'ready');
});

test('nenhuma etapa se repete', () => {
  assert.equal(new Set(GUIDE_STEPS).size, GUIDE_STEPS.length);
});

/* ── A primeira visita ────────────────────────────────────────────────────── */

test('sem estado nenhum, o convite aparece', () => {
  assert.equal(shouldOfferFirstRun(null), true);
});

test('quem disse «agora não» não volta a ser interrompida nesta versão', () => {
  const depois = guidePatch({ current: null, dismissedAt: '2026-09-06T10:00:00.000Z' });
  assert.equal(shouldOfferFirstRun(depois), false);
});

test('quem concluiu não volta a ser interrompida nesta versão', () => {
  const depois = guidePatch({ current: null, step: 8, completedAt: '2026-09-06T10:00:00.000Z' });
  assert.equal(shouldOfferFirstRun(depois), false);
});

test('quem apenas começou já não é interrompida', () => {
  // Abrir o guia escreve estado. Sem isto, fechar a meio devolvia o convite.
  const depois = guidePatch({ current: null, step: 2 });
  assert.equal(shouldOfferFirstRun(depois), false);
});

test('uma versão nova do fluxo pode voltar a oferecer', () => {
  const antiga = estado({ completedAt: '2026-09-06T10:00:00.000Z' });
  assert.equal(shouldOfferFirstRun(antiga, CONTENT_BRAIN_GUIDE_VERSION + 1), true);
});

test('um deploy não reabre nada: a mesma versão continua calada', () => {
  const visto = estado({ dismissedAt: '2026-09-06T10:00:00.000Z' });
  assert.equal(shouldOfferFirstRun(visto, CONTENT_BRAIN_GUIDE_VERSION), false);
});

/* ── Retomar ──────────────────────────────────────────────────────────────── */

test('reabrir volta à etapa onde ficou', () => {
  assert.equal(resumeGuideStep(estado({ lastStep: 4 })), 4);
});

test('um guia concluído reabre do princípio', () => {
  assert.equal(resumeGuideStep(estado({ lastStep: 6, completedAt: '2026-09-06T10:00:00.000Z' })), 0);
});

test('a posição de uma versão antiga não vale para a nova', () => {
  assert.equal(resumeGuideStep(estado({ lastStep: 6 }), CONTENT_BRAIN_GUIDE_VERSION + 1), 0);
});

test('uma posição impossível não rebenta a tela', () => {
  assert.equal(resumeGuideStep(estado({ lastStep: 99 })), GUIDE_STEPS.length - 1);
});

/* ── Navegação ────────────────────────────────────────────────────────────── */

test('a primeira etapa não tem anterior e a última não tem seguinte', () => {
  assert.equal(isFirstGuideStep(0), true);
  assert.equal(prevGuideStep(0), 0);
  assert.equal(isLastGuideStep(GUIDE_STEPS.length - 1), true);
  assert.equal(nextGuideStep(GUIDE_STEPS.length - 1), GUIDE_STEPS.length - 1);
});

test('anterior e seguinte andam uma etapa', () => {
  assert.equal(nextGuideStep(0), 1);
  assert.equal(prevGuideStep(3), 2);
});

test('a barra enche ao longo das oito e fica cheia no fecho', () => {
  assert.equal(guidePercent(0), 13);
  assert.equal(guidePercent(7), 100);
  assert.equal(guidePercent(8), 100);
});

test('o corte protege índices fora do intervalo', () => {
  assert.equal(clampStep(-5), 0);
  assert.equal(clampStep(500), GUIDE_STEPS.length - 1);
});

/* ── O que se escreve ─────────────────────────────────────────────────────── */

test('o estado salvo tem sempre versão, posição e as duas datas', () => {
  const p = guidePatch({ current: null, step: 3 });
  assert.deepEqual(Object.keys(p).sort(), ['completedAt', 'dismissedAt', 'lastStep', 'version']);
  assert.equal(p.version, CONTENT_BRAIN_GUIDE_VERSION);
});

test('concluir não apaga o «agora não» anterior', () => {
  const antes = guidePatch({ current: null, dismissedAt: '2026-09-06T10:00:00.000Z' });
  const depois = guidePatch({ current: antes, completedAt: '2026-09-07T10:00:00.000Z' });
  assert.equal(depois.dismissedAt, '2026-09-06T10:00:00.000Z');
  assert.equal(depois.completedAt, '2026-09-07T10:00:00.000Z');
});

test('estado de uma versão antiga não se mistura com a nova', () => {
  const antigo = estado({ lastStep: 6, completedAt: '2026-09-01T10:00:00.000Z', version: 0 });
  const novo = guidePatch({ current: antigo, step: 1 });
  assert.equal(novo.completedAt, null);
  assert.equal(novo.lastStep, 1);
});

/* ── Leitura do que está na base ──────────────────────────────────────────── */

test('valor ausente ou lixo lê-se como «nunca abriu»', () => {
  for (const v of [null, undefined, 42, 'sim', [], {}, { lastStep: 3 }]) {
    assert.equal(readGuideState(v), null, `${JSON.stringify(v)} devia ler-se como nada`);
  }
});

test('o que foi escrito lê-se de volta igual', () => {
  const p = guidePatch({ current: null, step: 5, dismissedAt: '2026-09-06T10:00:00.000Z' });
  assert.deepEqual(readGuideState(JSON.parse(JSON.stringify(p))), p);
});

test('uma posição corrompida na base não passa para a tela', () => {
  const lido = readGuideState({ version: 1, lastStep: -3, dismissedAt: 1, completedAt: '' });
  assert.deepEqual(lido, { version: 1, lastStep: 0, dismissedAt: null, completedAt: null });
});
