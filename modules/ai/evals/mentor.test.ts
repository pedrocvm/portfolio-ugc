import assert from 'node:assert/strict';
import test from 'node:test';

import * as registry from '../prompts/registry.ts';
import { CORE_PROMPT, PROMPT_VERSION } from '../../assistant/prompt.ts';
import { guessNiche, isExcludedNiche } from '../../brands/niches.ts';
import {
  ctaVerdict,
  educationVerdict,
  functionBalance,
  hooksCompleteness,
  nicheTerritory,
  storyProblems,
} from '../../creator/content-engine.ts';
import {
  BRAGA_REAL,
  EXPERIMENT_SPEC,
  KNOWLEDGE_KINDS,
  MENTOR_SOURCE,
  PERFORMANCE_HEURISTICS,
  REELS_TEST_POLICY,
  ruleById,
} from '../../creator/mentor-playbook.ts';
import { KNOWN_CONFLICTS, PRECEDENCE, resolveStrategy } from '../../creator/learning.ts';
import {
  brollTestProblems,
  carolBaseline,
  duplicateContent,
  evaluatePerformance,
  reelsTestEligibility,
  testLoad,
} from '../../creator/reels-test.ts';
import { MAX_CONTENT_DECISIONS } from '../../morning/domain.ts';

/** Os dez casos de avaliação do Content OS.
 *
 *  A mesma convenção de `autopilot.test.ts`: cada caso diz se a verificação é
 *  comportamental (a regra vive em código puro e o teste exercita-a) ou
 *  estrutural (a regra vive no prompt e o teste exige que lá esteja). O que
 *  precisa de modelo corre em `npm run eval:ai`, e não é isto. */

type PromptShape = { task: string; system: string };
const PROMPTS = (Object.values(registry) as unknown[]).filter(
  (v): v is PromptShape => typeof v === 'object' && v !== null && 'task' in v && 'system' in v,
);
const prompt = (task: string) => {
  const p = PROMPTS.find((x) => x.task === task);
  assert.ok(p, `o prompt «${task}» desapareceu`);
  return p.system;
};

/* ── 1. «Me dê um conteúdo educativo» → prova de ofício, não 5 dicas ─────── */

test('caso 1 · comportamental: educar é prova de ofício, e «5 dicas» reprova', () => {
  assert.equal(educationVerdict({ hook: '5 dicas de iluminação para UGC', script: 'Dica um, dois, três.' }).verdict, 'guru');
  assert.equal(
    educationVerdict({
      hook: 'Eu quase descartei esse take por causa da luz. Foi isso que eu mudei.',
      script: 'Bruto: a sombra comia a cara. Ajuste: troquei o lado da janela. Final: ficou este, e a marca aprovou.',
    }).verdict,
    'proof_of_craft',
  );
});

test('caso 1 · estrutural: o plano e a Carol AI pedem prova de ofício, nunca aula', () => {
  assert.match(prompt('daily_content_plan'), /PROVA DE OFÍCIO, nunca aula/);
  assert.match(prompt('daily_content_plan'), /Nunca «5 dicas de\s+iluminação»/);
  assert.match(CORE_PROMPT, /Nunca «5 dicas de iluminação»/);
  assert.match(CORE_PROMPT, /não quer ser mentora de UGC/);
});

/* ── 2. Conversão selecionada para Reels Test → feed ─────────────────────── */

test('caso 2 · comportamental: conteúdo de conversão não vai para Reels Test', () => {
  const v = reelsTestEligibility({
    contentFunction: 'convert',
    durationSeconds: 6,
    hook: 'A marca ficou com o take que eu escolhi.',
    cta: 'Salva isso.',
    format: 'B-roll',
  });
  assert.equal(v.eligible, false);
  assert.equal(v.recommendation, 'feed');
});

/* ── 3. Reels Test universal de 6 s ──────────────────────────────────────── */

test('caso 3 · comportamental: B-roll de 6 s tem visual + escrito, remate simples, e serve o frio', () => {
  const ganchos = hooksCompleteness(
    { visual: 'Carol editando, close na timeline', written: 'Demorei meses para perceber que o vídeo bonito não era o melhor.' },
    { needsSpeech: false },
  );
  assert.equal(ganchos.complete, true);
  assert.deepEqual(
    brollTestProblems({
      brollSeconds: 6,
      writtenHook: 'Demorei meses para perceber que o vídeo bonito não era o melhor.',
      caption: 'Passei semanas editando para ficar bonito. O que funcionou foi o take torto em que eu falei a verdade. Salva isso.',
      cta: 'Salva isso.',
    }),
    [],
  );
  assert.equal(ctaVerdict('Salva isso.', 'cold').ok, true);
  assert.equal(REELS_TEST_POLICY.brollFormat.minSeconds, 5);
});

/* ── 4. «Quero repostar o mesmo vídeo» ───────────────────────────────────── */

test('caso 4 · comportamental: repost igual é apanhado e a variante passa', () => {
  const a = { assetIds: ['take-1'], hook: 'Eu quase mandei esse take assim.', caption: 'A história do take que parecia certo.' };
  assert.equal(duplicateContent(a, { ...a }).duplicate, true);
  const variante = duplicateContent(a, { assetIds: ['take-1'], hook: 'O corte que salvou o vídeo estava no segundo 1.', caption: 'Não era a luz, era o ritmo.' });
  assert.equal(variante.duplicate, false);
  assert.equal(variante.variantOk, true);
  assert.match(CORE_PROMPT, /check_duplicate_content/);
});

/* ── 5. 2000 views não é excelente quando o normal é 8000 ───────────────── */

test('caso 5 · comportamental: a linha de base dela ganha à heurística da mentora', () => {
  const baseline = carolBaseline([{ views: 8000 }, { views: 7500 }, { views: 8500 }, { views: 9000 }]);
  const v = evaluatePerformance({ views: PERFORMANCE_HEURISTICS.worthAnalysingViews }, baseline);
  assert.equal(v.verdict, 'weak');
  assert.equal(v.basis, 'carol_baseline');
  assert.equal(PERFORMANCE_HEURISTICS.kind, 'MENTOR_HEURISTIC');
});

/* ── 6. 3 a 5 testes, mas há duas gravações comerciais ───────────────────── */

test('caso 6 · comportamental: com duas gravações de marca é um teste, com B-roll', () => {
  const r = testLoad({ intensiveMode: true, commercialShootsToday: 2, minutesCommitted: 200, brollAvailable: 3, readyTests: 0 });
  assert.equal(r.recommended, 1);
  assert.match(r.because, /B-roll que já existe/);
  assert.equal(ruleById('frequency')?.kind, 'MENTOR_EXPERIMENT');
});

/* ── 7. Inglês é experiência, não mudança de perfil ──────────────────────── */

test('caso 7 · estrutural: inglês só na faixa de experiência', () => {
  assert.match(prompt('daily_content_plan'), /O feed não muda de língua/);
  assert.match(CORE_PROMPT, /é uma experiência medida, não o feed inteiro/);
  assert.match(EXPERIMENT_SPEC.english_content.whatWeTest, /sem mudar o feed inteiro/);
});

/* ── 8. «Quero conteúdo de skincare» ─────────────────────────────────────── */

test('caso 8 · comportamental: skincare fica fora, no motor e na prospeção', () => {
  const t = nicheTerritory('Quero conteúdo de skincare');
  assert.equal(t.commercial, 'excluded');
  assert.equal(isExcludedNiche(guessNiche('sérum de skincare para rosácea')?.id ?? null), true);
  assert.equal(ruleById('skincare_out')?.kind, 'CANONICAL_BUSINESS_POLICY');
  assert.match(CORE_PROMPT, /skincare está fora como\s+nicho/);
});

/* ── 9. Braga Real ───────────────────────────────────────────────────────── */

test('caso 9 · estrutural: Braga Real é olhar de sala, nunca top 5 instagramável', () => {
  assert.ok(BRAGA_REAL.avoid.includes('top 5 lugares instagramáveis'));
  assert.match(prompt('braga_places'), /«top 5 instagramáveis»/);
  assert.match(CORE_PROMPT, /nunca «top 5\s+lugares instagramáveis»/);
});

/* ── 10. Referência viral: destrinchar, adaptar, não copiar ──────────────── */

test('caso 10 · estrutural: o método extrai a lógica e acaba em «como isto vira Carol»', () => {
  const p = prompt('reference_deconstruction');
  assert.match(p, /Extrais a LÓGICA, nunca a fala/);
  assert.match(p, /como isto vira\s+Carol/);
});

/* ── O que a definição de pronto exige, verificável ──────────────────────── */

test('regra, heurística e experiência não se tratam igual', () => {
  assert.ok(KNOWLEDGE_KINDS.includes('MENTOR_RULE') && KNOWLEDGE_KINDS.includes('MENTOR_HEURISTIC') && KNOWLEDGE_KINDS.includes('MENTOR_EXPERIMENT'));
  assert.match(MENTOR_SOURCE.recordedBy, /Gemini/);
});

test('a precedência resolve os conflitos por escrito: educação vira prova de ofício', () => {
  assert.equal(PRECEDENCE[0], 'EXPLICIT_CAROL_DECISION');
  assert.equal(resolveStrategy([{ source: 'MENTOR_PLAYBOOK', claim: 'tutoriais' }, { source: 'LATEST_PROFILE_AUDIT', claim: 'prova de ofício' }]).winner?.claim, 'prova de ofício');
  assert.match(KNOWN_CONFLICTS.find((c) => c.id === 'education')?.resolution ?? '', /prova de ofício/);
});

test('o vilão nunca é a concorrência, e o plano diz-lhe isso', () => {
  assert.ok(storyProblems({ hero: 'quem vê', villain: 'a concorrência', guide: 'a Carol' }).some((p) => p.includes('concorrência')));
  assert.match(prompt('daily_content_plan'), /NUNCA a concorrência/);
});

test('o equilíbrio de função diz o que falta hoje', () => {
  const b = functionBalance([{ contentFunction: 'educate_retain' }, { contentFunction: 'educate_retain' }, { contentFunction: 'educate_retain' }, { contentFunction: 'convert' }, { contentFunction: 'convert' }]);
  assert.equal(b.missing, 'attract_connect');
});

test('a manhã comporta o teste como terceira decisão, e não mais do que isso', () => {
  assert.equal(MAX_CONTENT_DECISIONS, 3);
});

test('a Carol AI aplica a mentoria em português do Brasil, e a versão subiu', () => {
  assert.equal(PROMPT_VERSION, 'carol-assistant-v5');
  assert.match(CORE_PROMPT, /Falas português do Brasil/);
  assert.match(CORE_PROMPT, /Nunca recitas a mentoria/);
  assert.match(CORE_PROMPT, /get_three_hooks/);
  assert.match(CORE_PROMPT, /get_reels_test_lab/);
});

test('os prompts novos têm versão e não carregam número da mentora', () => {
  const PRICE = /\b\d{2,4}\s?(€|eur)\b/i;
  for (const task of ['daily_content_plan', 'three_hooks', 'reference_deconstruction', 'insights_screenshot', 'broll_tags', 'braga_places']) {
    const p = (Object.values(registry) as unknown[]).find(
      (v): v is { task: string; version: string; system: string } =>
        typeof v === 'object' && v !== null && 'task' in v && (v as { task: string }).task === task,
    );
    assert.ok(p, `falta o prompt «${task}»`);
    assert.match(p.version, /^v\d+$/);
    assert.doesNotMatch(p.system, PRICE);
    // 2000 e 3000 são heurísticas que o motor compara com a linha de base
    // dela. Escritas no prompt, o modelo passava a decidir sozinho.
    assert.doesNotMatch(p.system, /\b(2000|3000)\b/, `${task}: tem um número da mentora escrito`);
  }
  assert.equal(registry.planDailyContent.version, 'v5');
});
