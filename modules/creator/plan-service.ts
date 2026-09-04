import 'server-only';

import { localDay } from '@/lib/time';
import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { runPrompt } from '@/modules/ai/gateway';
import { planDailyContent } from '@/modules/ai/prompts/registry';
import type { ContentIdea } from '@/modules/ai/schemas';
import { contentWorthyMilestones, describeMilestones, markMilestoneUsed } from '@/modules/milestones/service';
import { usableTrends, type TrendRow } from '@/modules/trends/service';
import {
  PILLARS,
  PILLAR_LABEL,
  STRATEGY_VERSION,
  PLATFORM_BRIEF,
  estimateMinutes,
  freshUntilFor,
  ideaProblems,
  ideaFingerprint,
  ENERGY_LABEL,
  describeStrategy,
  describeRejections,
  energyBudget,
  energyOf,
  isPillar,
  pillarDebt,
  isRepeat,
  isStale,
  matchTrends,
  pillarPriority,
  platformTreatmentsDiffer,
  qualityVerdict,
  recentlyUsedPillars,
  seriesIsViable,
  shouldGenerate,
  SUGGESTED_STATUSES,
  type Pillar,
  type RejectionReason,
  type Platform,
} from './domain';
import { describeExemplars, exemplarsAsPrevious } from './audit-seed';
import { describeProfile, profileFresh } from './profile-service';
import { BRAGA_REAL, FUNCTION_SPEC, MODE_SPEC, PLAYBOOK_VERSION, describePlaybook, isEditorialMode } from './mentor-playbook';
import {
  FUNCTION_LABEL,
  classifyWrittenHook,
  craftAdjustedScore,
  educationVerdict,
  hooksCompleteness,
  inferFunction,
  inferModes,
  proofOfCraft,
  storyProblems,
  type DecisionTrace,
} from './content-engine';
import { brollTestProblems, matchBroll, reelsTestEligibility, suggestBrollTags, testLoad } from './reels-test';
import {
  brollBank,
  contentBalanceNow,
  contentSettings,
  describeBalance,
  describeBrollBank,
  markBrollUsed,
  recordHooks,
  refreshContentLearning,
  seedFromMentor,
  type BrollRow,
} from './content-os-service';

export * from './domain';

/** O plano de conteúdo do dia.
 *
 *  Uma ideia para Instagram e uma para TikTok, tratadas de forma nativa — e,
 *  quando o dia comporta, um Reels Test: B-roll de 5 a 7 segundos com gancho
 *  escrito, feito com o que já existe no banco. `platformTreatmentsDiffer`
 *  verifica as duas primeiras depois de o modelo responder, e uma ideia que
 *  não passa é rejeitada com o motivo em vez de ser salva na mesma.
 *
 *  Duas travagens antes de gerar seja o que for: se já há muitas ideias por
 *  gravar, refresca-se em vez de somar; e se o retrato dela não foi observado,
 *  o prompt diz isso em vez de fingir que conhece o estilo dela.
 *
 *  A mentoria entra como playbook, não como parágrafo: função e modo em falta,
 *  três ganchos, herói/vilão/guia, quantos testes cabem hoje. */

export const TRACKS = ['main', 'reels_test', 'english', 'braga_real', 'capcut', 'journey'] as const;
export type Track = (typeof TRACKS)[number];

export const TRACK_LABEL: Record<Track, string> = {
  main: 'Feed',
  reels_test: 'Reels Test',
  english: 'Em inglês',
  braga_real: 'Braga Real',
  capcut: 'Bastidor de edição',
  journey: 'Jornada',
};

export type ContentPlanResult = {
  generated: number;
  rejected: number;
  archived: number;
  reasons: string[];
  failures: string[];
};

type PlanContext = {
  profile: Awaited<ReturnType<typeof profileFresh>>;
  trends: TrendRow[];
  milestones: Awaited<ReturnType<typeof contentWorthyMilestones>>;
  history: RecentIdea[];
  series: string;
  jobs: string;
  recusadas: Awaited<ReturnType<typeof rejectedIdeas>>;
  bank: BrollRow[];
  balance: string;
};

async function planContext(): Promise<PlanContext> {
  const [profile, trends, milestones, history, series, jobs, recusadas, bank, balance] = await Promise.all([
    profileFresh(),
    usableTrends(6),
    contentWorthyMilestones(4),
    recentIdeas(30),
    activeSeries(),
    upcomingJobs(),
    rejectedIdeas(12),
    brollBank(40),
    contentBalanceNow(),
  ]);
  return { profile, trends, milestones, history, series, jobs, recusadas, bank, balance: describeBalance(balance) };
}

function promptInputs(ctx: PlanContext, planDate: string, over: { energy: string; audienceTilt: string; avoidPillars: string; pillars: string; seeds: string; testPlan: string; recentIdeas?: string; rejected?: string }) {
  return {
    today: planDate,
    strategy: describeStrategy(),
    profile: describeProfile(ctx.profile),
    energy: over.energy,
    pillars: over.pillars,
    avoidPillars: over.avoidPillars,
    audienceTilt: over.audienceTilt,
    trends: describeTrends(ctx.trends),
    milestones: describeMilestones(ctx.milestones),
    jobs: ctx.jobs,
    recentIdeas: over.recentIdeas ?? ctx.history.slice(0, 12).map((h) => `- [${h.platform}] ${h.hook}`).join('\n'),
    rejected: over.rejected ?? describeRejections(ctx.recusadas),
    series: ctx.series,
    seeds: over.seeds,
    exemplars: describeExemplars(),
    instagramBrief: describeBrief('instagram'),
    tiktokBrief: describeBrief('tiktok'),
    playbook: describePlaybook(),
    balance: ctx.balance,
    broll: describeBrollBank(ctx.bank),
    testPlan: over.testPlan,
  };
}

export async function runDailyContentPlan(
  opts: { now?: Date; force?: boolean } = {},
): Promise<ContentPlanResult> {
  const db = supabaseService();
  const now = opts.now ?? new Date();
  const planDate = localDay(now);
  const reasons: string[] = [];
  const failures: string[] = [];

  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { generated: 0, rejected: 0, archived: 0, reasons: [], failures: ['Sem usuário.'] };

  // ── Idempotência pelo dia ───────────────────────────────────────────────
  const { data: hoje } = await db
    .from('creator_content_idea')
    .select('id, platform, track')
    .eq('plan_date', planDate)
    .in('status', ['ready', 'saved', 'recorded', 'published']);

  const jaTem = new Set<Platform>(
    (hoje ?? []).filter((r) => r.track !== 'reels_test').map((r) => r.platform as Platform).filter((p): p is Platform => p === 'instagram' || p === 'tiktok'),
  );
  const jaTemTeste = (hoje ?? []).some((r) => r.track === 'reels_test');

  if (!opts.force && jaTem.size >= 2 && jaTemTeste) {
    return { generated: 0, rejected: 0, archived: 0, reasons: ['O plano de hoje já existe.'], failures: [] };
  }

  // A auditoria e a mentoria entram no sistema antes de o plano correr. É
  // idempotente: numa manhã normal não escrevem nada.
  const { seedFromAudit, seedsForPillar } = await import('./seed-service');
  await seedFromAudit();
  await seedFromMentor();

  // Os aprendizados derivam-se dos números antes de escolher: é o que faz a
  // manhã seguinte saber o que a anterior ensinou. Não gasta modelo.
  await refreshContentLearning();

  // ── Envelhecimento: o que morreu sai antes de entrar coisa nova ─────────
  const archived = await archiveStale(now);

  // ── Carga: não somar catorze quando já há sete por gravar ───────────────
  const { count: prontas } = await db
    .from('creator_content_idea')
    .select('id', { count: 'exact', head: true })
    // As sementes não contam para a carga: são matéria-prima, não fila. Os
    // testes também não: são outra fila, com outro custo.
    .in('status', ['ready', 'saved'])
    .neq('track', 'reels_test');

  const carga = shouldGenerate(prontas ?? 0);
  if (!carga.generate && jaTemTeste) {
    return { generated: 0, rejected: 0, archived, reasons: [carga.because], failures: [] };
  }
  if (carga.refreshOnly) reasons.push(carga.because);

  // ── Contexto ────────────────────────────────────────────────────────────
  const ctx = await planContext();
  const { history, trends, milestones, bank } = ctx;

  // Um dia com gravação de marca não comporta uma segunda produção. A melhor
  // ideia nesse dia é quase sempre a que sai da mesma sessão.
  const shoots = ctx.jobs.trim() ? ctx.jobs.trim().split('\n').length : 0;
  const orcamento = energyBudget({
    commercialShootToday: shoots > 0,
    minutesCommitted: shoots > 0 ? 120 : 0,
  });

  // ── Quantos testes cabem hoje. Estratégia da mentora; capacidade dela ───
  const { count: testesProntos } = await db
    .from('creator_content_idea')
    .select('id', { count: 'exact', head: true })
    .eq('track', 'reels_test')
    .in('status', ['ready', 'saved']);
  const settings = await contentSettings();
  const load = testLoad({
    intensiveMode: settings.intensiveTestMode,
    commercialShootsToday: shoots,
    minutesCommitted: shoots > 0 ? 120 : 0,
    brollAvailable: bank.length,
    readyTests: testesProntos ?? 0,
  });
  const querTeste = !jaTemTeste && load.recommended > 0;
  const testPlan = querTeste
    ? `${load.recommended} ${load.recommended === 1 ? 'teste' : 'testes'} hoje. ${load.because} Devolve UM em \`reels_test\`: B-roll de 5 a 7 s, gancho escrito, legenda com a solução, remate simples, com B-roll do banco se houver.`
    : `Zero testes hoje. ${load.because} Devolve \`reels_test: null\`.`;

  const ordem = pillarPriority(history.map((h) => ({ pillar: h.pillar, at: h.generatedAt })));
  const debt = pillarDebt(history.map((h) => ({ pillar: h.pillar })));
  const evitar = recentlyUsedPillars(
    history.map((h) => ({ pillar: h.pillar, at: h.generatedAt })),
    { window: 3 },
  );

  if (trends.length === 0) {
    reasons.push('Nenhuma tendência atual encaixava nela hoje, por isso o plano não usa nenhuma.');
  }

  const base = {
    pillars: ordem.map((p, i) => `${i + 1}. ${p} — ${PILLAR_LABEL[p]}`).join('\n'),
    avoidPillars: evitar.map((p) => PILLAR_LABEL[p]).join(', '),
    seeds: (await seedsForPillar(ordem[0], 4)).map((sd) => `- ${sd.title}: «${sd.hook}»`).join('\n'),
    testPlan,
  };

  const run = await runPrompt(
    planDailyContent,
    promptInputs(ctx, planDate, {
      ...base,
      energy:
        orcamento.max === 'high'
          ? 'O dia está livre. Cabe uma peça mais trabalhada.'
          : `Energia disponível: ${ENERGY_LABEL[orcamento.max]}. ${orcamento.because}`,
      audienceTilt: PILLARS.map(
        (p) => `${PILLAR_LABEL[p]}: ${debt[p] > 0.05 ? `em falta ${Math.round(debt[p] * 100)} pontos` : debt[p] < -0.05 ? 'já saiu de mais' : 'em dia'}`,
      ).join(' · '),
    }),
    { entityType: 'creator_content_idea', entityId: me.id, timeoutMs: 120_000 },
  );

  if (!run.ok) {
    return { generated: 0, rejected: 0, archived, reasons, failures: [run.message] };
  }

  const plano = run.output;

  // ── O mesmo vídeo duas vezes não passa ──────────────────────────────────
  const diferem = platformTreatmentsDiffer(
    { platform: 'instagram', hook: plano.instagram.hook, format: plano.instagram.format, script: plano.instagram.script },
    { platform: 'tiktok', hook: plano.tiktok.hook, format: plano.tiktok.format, script: plano.tiktok.script },
  );
  if (!diferem.differ) {
    return {
      generated: 0,
      rejected: 2,
      archived,
      reasons,
      failures: [`As duas ideias eram o mesmo vídeo: ${diferem.because}.`],
    };
  }

  let generated = 0;
  let rejected = 0;

  // Só as plataformas que ainda não têm plano hoje.
  //
  // A verificação de idempotência é «já há duas?» — e com uma só, corria e
  // salvava as duas, deixando o dia com dois TikToks e um Instagram. O plano
  // pede sempre as duas ao modelo porque é o contraste entre elas que impede o
  // mesmo vídeo republicado; o que muda aqui é qual delas se guarda.
  const porGravar = new Set<Platform>(
    (['instagram', 'tiktok'] as Platform[]).filter((p) => !jaTem.has(p) && carga.generate),
  );
  let testePorGravar = querTeste;

  const salvar = async (idea: ContentIdea, track: Track) => {
    const saved = await saveIdea({
      idea,
      appUserId: me.id,
      planDate,
      now,
      history,
      trends,
      milestones,
      bank,
      runId: run.runId,
      track,
    });
    if (saved.ok) {
      generated++;
      if (track === 'reels_test') testePorGravar = false;
      else porGravar.delete(idea.platform);
    } else {
      rejected++;
      reasons.push(`${track === 'reels_test' ? 'teste' : idea.platform}: ${saved.because}`);
    }
    return saved;
  };

  for (const idea of [plano.instagram, plano.tiktok]) {
    if (porGravar.has(idea.platform)) await salvar(idea, trackFor(idea, { isTest: false, milestoneUsed: false }));
  }
  if (testePorGravar && plano.reels_test) await salvar(plano.reels_test, 'reels_test');
  if (testePorGravar && !plano.reels_test) reasons.push('O plano não trouxe Reels Test hoje.');

  // Uma rejeição não pode deixar a plataforma sem nada. Tenta outra vez, uma
  // só, com o motivo da recusa por escrito — sem isso o modelo repete o mesmo
  // erro, que foi o que aconteceu na primeira corrida real: o portão
  // anti-guru travou a ideia de Instagram e o dia ficou com uma.
  if ((porGravar.size > 0 || testePorGravar) && rejected > 0) {
    const segunda = await runPrompt(
      planDailyContent,
      promptInputs(ctx, planDate, {
        ...base,
        energy: `Energia disponível: ${ENERGY_LABEL[orcamento.max]}. ${orcamento.because}`,
        audienceTilt: [
          'A TENTATIVA ANTERIOR FOI RECUSADA. Motivos, um por um:',
          ...reasons.map((r) => `- ${r}`),
          'Não repitas o mesmo erro. Se te disseram que estava dando aulas, conta uma história em vez de ensinar.',
        ].join('\n'),
      }),
      { entityType: 'creator_content_idea', entityId: me.id, timeoutMs: 120_000 },
    );

    if (segunda.ok) {
      for (const idea of [segunda.output.instagram, segunda.output.tiktok]) {
        if (porGravar.has(idea.platform)) await salvar(idea, trackFor(idea, { isTest: false, milestoneUsed: false }));
      }
      if (testePorGravar && segunda.output.reels_test) await salvar(segunda.output.reels_test, 'reels_test');
    } else {
      failures.push(`A segunda tentativa também falhou: ${segunda.message}`);
    }
  }

  return { generated, rejected, archived, reasons, failures };
}

/** Onde a peça vive. A faixa não é uma escolha dela: sai do que a ideia é. */
function trackFor(idea: ContentIdea, ctx: { isTest: boolean; milestoneUsed: boolean }): Track {
  if (ctx.isTest) return 'reels_test';
  if (idea.language === 'en') return 'english';
  if (idea.series && [BRAGA_REAL.name, ...BRAGA_REAL.aliases].some((n) => idea.series!.name.toLowerCase().includes(n.toLowerCase()))) return 'braga_real';
  if (ctx.milestoneUsed) return 'journey';
  if (/capcut|edi[çc][ãa]o|timeline|corte/i.test(`${idea.title} ${idea.hook}`) && educationVerdict({ hook: idea.hook, script: idea.script, title: idea.title }).verdict === 'proof_of_craft') return 'capcut';
  return 'main';
}

type SaveResult = { ok: true; id: string } | { ok: false; because: string };

export async function saveIdea(input: {
  idea: ContentIdea;
  appUserId: string;
  planDate: string;
  now: Date;
  history: readonly RecentIdea[];
  trends: readonly TrendRow[];
  milestones: readonly { id: string; label: string; summary: string }[];
  bank: readonly BrollRow[];
  runId: string | null;
  track: Track;
  parentIdeaId?: string | null;
  inheritedBrollIds?: readonly string[];
}): Promise<SaveResult> {
  const db = supabaseService();
  const { idea } = input;
  const isTest = input.track === 'reels_test';

  // ── Porta anti-genérico ─────────────────────────────────────────────────
  const problemas = ideaProblems({
    hook: idea.hook,
    script: idea.script,
    title: idea.title,
    whyNow: idea.why_now,
    format: idea.format,
    onScreenText: idea.on_screen_text,
  });
  if (problemas.length) return { ok: false, because: problemas.join('; ') };

  const pillar: Pillar = isPillar(idea.pillar) ? idea.pillar : 'TESTEI';

  const repetida = isRepeat(
    { platform: idea.platform, pillar, hook: idea.hook, title: idea.title },
    [
      ...input.history.map((h) => ({ fingerprint: h.fingerprint, hook: h.hook })),
      ...exemplarsAsPrevious(),
    ],
  );
  // Uma variante legítima nasce parecida de propósito: o portão de repetição
  // não se aplica a quem tem pai.
  if (repetida.repeat && !input.parentIdeaId) return { ok: false, because: repetida.because ?? 'repetida' };

  // ── A mentoria, aplicada ────────────────────────────────────────────────
  const texto = { title: idea.title, hook: idea.hook, script: idea.script, caption: idea.caption, cta: idea.cta, objective: idea.objective, format: idea.format, onScreenText: idea.on_screen_text };
  const contentFunction = inferFunction({ ...texto, declared: idea.content_function });
  const modes = inferModes({ ...texto, declared: idea.editorial_modes });
  const hooks = {
    visual: idea.hooks.visual.trim() || null,
    written: idea.hooks.written.trim() || null,
    writtenType: idea.hooks.written_type ?? classifyWrittenHook(idea.hooks.written),
    spoken: idea.hooks.spoken?.trim() || null,
  };
  const fala = Boolean(hooks.spoken) || /talking ?head|falad|rosto|voice ?over/i.test(idea.format);
  const ganchos = hooksCompleteness(hooks, { needsSpeech: fala && !isTest });
  const historia = storyProblems(idea.story);
  if (historia.some((p) => p.includes('concorrência'))) return { ok: false, because: `a história põe a concorrência como vilão — o vilão é o problema` };
  const craft = proofOfCraft(texto);
  const educacao = educationVerdict(texto);
  if (educacao.verdict === 'guru') return { ok: false, because: educacao.because };

  const verdict = qualityVerdict({
    carolIdentity: idea.quality.carol_identity,
    story: idea.quality.story,
    proof: idea.quality.proof,
    humanConflict: idea.quality.human_conflict,
    brandSignal: idea.quality.brand_signal,
    engagement: idea.quality.engagement,
    originality: idea.quality.originality,
    recordability: idea.quality.recordability,
    platformNative: idea.quality.platform_native,
    authorityWithoutPreaching: idea.quality.authority_without_preaching,
  });
  if (verdict.verdict === 'reject') return { ok: false, because: verdict.phrase };

  // Sem bastidor, uma ideia de conversão vale menos — o suficiente para deixar
  // de ser «gravaria hoje».
  const score = craftAdjustedScore({ score: verdict.score, contentFunction, craft });
  const finalVerdict =
    verdict.verdict === 'record_today' && score < 72
      ? { ...verdict, score, verdict: 'good_not_urgent' as const, phrase: 'Boa ideia, mas sem mostrar o que está por trás não é urgente.' }
      : { ...verdict, score };

  // ── B-roll que já existe, antes de pedir gravação nova ──────────────────
  const tags = [...new Set(idea.b_roll.flatMap((b) => suggestBrollTags({ text: b })))];
  const matches = matchBroll({ tags, text: idea.b_roll.join(' ') }, input.bank).slice(0, 3);
  const brollIds = [...new Set([...(input.inheritedBrollIds ?? []), ...matches.map((m) => m.id)])];

  // ── Reels Test: elegível, no formato, com remate para público frio ──────
  const teste = reelsTestEligibility({
    contentFunction,
    durationSeconds: idea.duration_seconds,
    hook: hooks.written ?? idea.hook,
    script: idea.script,
    caption: idea.caption,
    cta: idea.cta,
    format: idea.format,
    modes,
    usesExistingAsset: brollIds.length > 0,
  });
  if (isTest) {
    if (!teste.eligible) return { ok: false, because: `não serve para Reels Test: ${teste.because}` };
    const formato = brollTestProblems({ brollSeconds: idea.duration_seconds, writtenHook: hooks.written, caption: idea.caption, cta: idea.cta });
    if (formato.length) return { ok: false, because: formato.join('; ') };
  }

  // ── Séries: só quando a ideia a justifica ───────────────────────────────
  let seriesId: string | null = null;
  let episode: number | null = null;
  if (idea.series) {
    const viable = seriesIsViable({
      name: idea.series.name,
      premise: idea.series.premise,
      structure: idea.series.structure,
      nextTopics: idea.series.next_topics,
    });
    if (viable.viable) {
      const { data: existing } = await db
        .from('content_series')
        .select('id, episodes')
        .eq('name', idea.series.name)
        .maybeSingle();

      if (existing) {
        seriesId = existing.id;
        episode = existing.episodes + 1;
        await db
          .from('content_series')
          .update({
            episodes: episode,
            last_episode_at: input.now.toISOString(),
            next_topics: asJson(idea.series.next_topics),
          })
          .eq('id', existing.id);
      } else {
        const { data: created } = await db
          .from('content_series')
          .insert({
            name: idea.series.name,
            premise: idea.series.premise,
            structure: idea.series.structure,
            episodes: 1,
            last_episode_at: input.now.toISOString(),
            next_topics: asJson(idea.series.next_topics),
          })
          .select('id')
          .maybeSingle();
        seriesId = created?.id ?? null;
        episode = 1;
      }
    }
  }

  // ── Ligações: cada peça diz de onde veio ────────────────────────────────
  const usedTrends = matchTrends(
    { whyNow: idea.why_now, script: idea.script, hook: idea.hook },
    input.trends,
  );

  const usedMilestone = input.milestones.find(
    (m) => idea.why_now.includes(m.summary.slice(0, 25)) || idea.script.includes(m.summary.slice(0, 25)),
  );

  const trendFreshness = usedTrends.length
    ? (input.trends.find((t) => t.id === usedTrends[0])?.freshness ?? null)
    : null;

  const tempo = estimateMinutes({
    shots: idea.shot_list.length,
    durationSeconds: idea.duration_seconds,
    editingComplexity: idea.editing.complexity,
  });

  const track: Track = input.track === 'main' ? trackFor(idea, { isTest: false, milestoneUsed: Boolean(usedMilestone) }) : input.track;

  const rulesUsed = [
    craft.present ? 'lens' : '',
    ganchos.complete ? 'three_hooks' : '',
    historia.length === 0 ? 'hero_villain_guide' : '',
    isTest ? 'reels_test_cold' : '',
    isTest ? 'broll_test' : '',
    isTest ? 'simple_cta' : '',
    usedMilestone ? 'document_journey' : '',
    educacao.verdict === 'proof_of_craft' ? 'technical_content' : '',
    input.parentIdeaId ? 'no_repost' : '',
    idea.language === 'en' ? 'english' : '',
  ].filter(Boolean);

  const trace: DecisionTrace = {
    whyRecommended: idea.recommendation,
    strategyRulesUsed: rulesUsed,
    referencesUsed: [],
    performanceSignalsUsed: [teste.because, ...(ganchos.complete ? [] : [ganchos.because]), ...(craft.present ? [] : [craft.because])],
    assetsAvailable: matches.map((m) => `${m.id}: ${m.because}`),
    playbookVersion: PLAYBOOK_VERSION,
    strategyVersion: STRATEGY_VERSION,
  };

  const { data, error } = await db
    .from('creator_content_idea')
    .insert({
      app_user_id: input.appUserId,
      plan_date: input.planDate,
      platform: idea.platform,
      status: 'ready',
      pillar,
      objective: idea.objective,
      format: idea.format,
      source_reason: idea.why_now,
      title: idea.title,
      hook: idea.hook,
      alt_hooks: asJson(idea.alternative_hooks),
      script: idea.script,
      shot_list: asJson(idea.shot_list.map((s) => ({ shot: s.shot, note: s.note ?? undefined, required: s.required }))),
      b_roll: asJson(idea.b_roll),
      on_screen_text: asJson(idea.on_screen_text),
      editing_plan: asJson({
        capcut: idea.editing.capcut_steps,
        transitions: idea.editing.transitions,
        pacing: idea.editing.pacing,
        sound: idea.editing.sound,
        complexity: idea.editing.complexity,
        camera: idea.camera_position,
        location: idea.location,
        props: idea.props,
      }),
      caption: idea.caption,
      cta: idea.cta,
      cover_note: idea.cover,
      posting_notes: idea.posting_notes,
      duration_seconds: idea.duration_seconds,
      estimated_record_minutes: brollIds.length && isTest ? Math.min(tempo.record, 5) : tempo.record,
      estimated_edit_minutes: tempo.edit,
      why_it_can_work: idea.why_it_can_work,
      authority_signal: idea.authority_signal,
      engagement_mechanism: idea.engagement_mechanism,
      brand_audience_effect: idea.brand_audience_effect,
      mentorship_signal: idea.mentorship_signal,
      quality: asJson({
        ...idea.quality,
        score: finalVerdict.score,
        verdict: finalVerdict.verdict,
        phrase: finalVerdict.phrase,
        energy: idea.energy,
        recommendation: idea.recommendation,
        strategyVersion: STRATEGY_VERSION,
        craft: craft.score,
        hooks: ganchos.complete,
        energyMeasured: energyOf({
          shots: idea.shot_list.length,
          editingComplexity: idea.editing.complexity,
          recordMinutes: tempo.record,
          editMinutes: tempo.edit,
        }),
      }),
      trend_ids: usedTrends,
      series_id: seriesId,
      episode,
      milestone_id: usedMilestone?.id ?? null,
      fingerprint: ideaFingerprint({ platform: idea.platform, pillar, hook: idea.hook, title: idea.title }),
      fresh_until: freshUntilFor({ hasTrend: usedTrends.length > 0, trendFreshness }, input.now),
      generated_at: input.now.toISOString(),
      ai_run_id: input.runId,
      content_function: contentFunction,
      editorial_modes: asJson(modes),
      hooks: asJson(hooks),
      story: asJson({ hero: idea.story.hero, villain: idea.story.villain, guide: idea.story.guide, outline: idea.story.outline, proofOfCraft: idea.proof_of_craft }),
      reels_test: asJson({ eligible: teste.eligible, recommendation: teste.recommendation, score: teste.score, because: teste.because }),
      decision_trace: asJson(trace),
      language: idea.language,
      track,
      broll_asset_ids: brollIds,
      parent_idea_id: input.parentIdeaId ?? null,
      playbook_version: PLAYBOOK_VERSION,
    })
    .select('id')
    .maybeSingle();

  if (error || !data) return { ok: false, because: 'Não consegui salvar a ideia.' };

  // Um marco só se usa uma vez: a segunda seria a mesma história outra vez.
  if (usedMilestone) await markMilestoneUsed(usedMilestone.id);
  // Os ganchos entram na biblioteca quando a ideia nasce; ela nunca os regista.
  await recordHooks(data.id, hooks, { platform: idea.platform, format: idea.format, topic: idea.title });
  await markBrollUsed(matches.map((m) => m.id));

  return { ok: true, id: data.id };
}

/** Uma ideia pedida com direção: uma variante de um teste, um episódio de Braga
 *  Real, uma peça em inglês, o feedback de uma marca virado conteúdo.
 *
 *  Reutiliza o plano do dia inteiro — o modelo escreve as três e fica a que a
 *  faixa pede. É o mesmo caminho de gravação, com os mesmos portões. */
export async function directedIdea(input: {
  directive: string;
  platform: Platform;
  track: Track;
  language?: 'pt-BR' | 'en';
  parentIdeaId?: string | null;
  inheritedBrollIds?: readonly string[];
  entityId?: string | null;
}): Promise<SaveResult> {
  const db = supabaseService();
  const now = new Date();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { ok: false, because: 'Sem usuário.' };

  const ctx = await planContext();
  const ordem = pillarPriority(ctx.history.map((h) => ({ pillar: h.pillar, at: h.generatedAt })));
  const isTest = input.track === 'reels_test';
  const lingua = input.language === 'en' ? ' Escreve a peça em INGLÊS (language: en), com guião — é a experiência de inglês, não o feed.' : '';
  const directive = `${input.directive}${lingua}`;

  const run = await runPrompt(
    planDailyContent,
    promptInputs(ctx, localDay(now), {
      pillars: ordem.map((p, i) => `${i + 1}. ${p} — ${PILLAR_LABEL[p]}`).join('\n'),
      avoidPillars: '',
      seeds: '',
      energy: directive,
      audienceTilt: directive,
      testPlan: isTest
        ? `Um teste. ${directive} Devolve-o em \`reels_test\`: B-roll de 5 a 7 s, gancho escrito, legenda com a solução, remate simples.`
        : 'Zero testes hoje. Devolve `reels_test: null`.',
    }),
    { entityType: 'creator_content_idea', entityId: input.entityId ?? me.id, timeoutMs: 120_000 },
  );
  if (!run.ok) return { ok: false, because: run.message };

  const idea = isTest ? run.output.reels_test : input.platform === 'instagram' ? run.output.instagram : run.output.tiktok;
  if (!idea) return { ok: false, because: 'O modelo não devolveu a peça pedida.' };

  return saveIdea({
    idea,
    appUserId: me.id,
    planDate: localDay(now),
    now,
    history: ctx.history,
    trends: ctx.trends,
    milestones: ctx.milestones,
    bank: ctx.bank,
    runId: run.runId,
    track: input.track,
    parentIdeaId: input.parentIdeaId ?? null,
    inheritedBrollIds: input.inheritedBrollIds,
  });
}

/* ── Leituras ─────────────────────────────────────────────────────────────── */

export type RecentIdea = { fingerprint: string; hook: string; pillar: string; platform: string; generatedAt: string };

export async function recentIdeas(limit: number): Promise<RecentIdea[]> {
  const db = supabaseService();
  const { data } = await db
    .from('creator_content_idea')
    .select('fingerprint, hook, pillar, platform, generated_at')
    .in('status', SUGGESTED_STATUSES)
    .order('generated_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    fingerprint: r.fingerprint,
    hook: r.hook,
    pillar: r.pillar,
    platform: r.platform,
    generatedAt: r.generated_at,
  }));
}

async function activeSeries(): Promise<string> {
  const db = supabaseService();
  const { data } = await db
    .from('content_series')
    .select('name, premise, structure, episodes, next_topics, kind, places')
    .eq('status', 'active')
    .order('last_episode_at', { ascending: false, nullsFirst: false })
    .limit(4);

  return (data ?? [])
    .map((s) => {
      const lugares = s.kind === 'braga_real' ? ((s.places ?? []) as { name: string; published?: boolean }[]).filter((p) => !p.published).slice(0, 4).map((p) => p.name) : [];
      return (
        `- «${s.name}» (${s.episodes} episódios): ${s.premise}. Estrutura: ${s.structure}. ` +
        `Próximos temas: ${[...((s.next_topics ?? []) as string[]), ...lugares].join(', ') || '(por definir)'}`
      );
    })
    .join('\n');
}

/** Gravações de marca já marcadas. Serve o Content Multiplier: o que sai da
 *  mesma sessão sem somar horas — e o bastidor, que a mentora pediu. */
async function upcomingJobs(): Promise<string> {
  const db = supabaseService();
  const { data } = await db
    .from('collaboration')
    .select('id, status, title, deadline_at, brand:brand_id ( name )')
    .in('status', ['awaiting_product', 'awaiting_brief', 'production_ready', 'in_production'])
    .limit(4);

  const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  return (data ?? [])
    .map((c) => {
      const brand = one(c.brand as { name: string } | { name: string }[] | null);
      const prazo = c.deadline_at ? `, entrega a ${c.deadline_at}` : '';
      return `- ${brand?.name ?? 'Marca'}: ${c.title || 'gravação por descrever'} (${c.status}${prazo}) — cabe captar o bastidor: o brief, o take, a decisão`;
    })
    .join('\n');
}

function describeTrends(trends: readonly TrendRow[]): string {
  return trends
    .map(
      (t) =>
        `- [${t.platform} · ${t.kind} · ${t.freshness}] ${t.title}: ${t.description} ` +
        `Porque está subindo: ${t.whyTrending}. Encaixe: ${t.fitReason} ` +
        `Prova: ${t.evidence.map((e) => e.url).slice(0, 2).join(', ')}`,
    )
    .join('\n');
}

function describeBrief(platform: Platform): string {
  const b = PLATFORM_BRIEF[platform];
  return `objetivo: ${b.objective}\nTratamento: ${b.treatment}\nA evitar: ${b.avoid}`;
}

async function archiveStale(now: Date): Promise<number> {
  const db = supabaseService();
  const { data } = await db
    .from('creator_content_idea')
    .select('id, fresh_until, generated_at')
    .eq('status', 'ready');

  const velhas = (data ?? []).filter((r) =>
    isStale({ freshUntil: r.fresh_until, generatedAt: r.generated_at }, now),
  );
  if (velhas.length === 0) return 0;

  await db
    .from('creator_content_idea')
    .update({ status: 'archived' })
    .in('id', velhas.map((v) => v.id));

  return velhas.length;
}

export type IdeaHooks = { visual: string | null; written: string | null; writtenType: string | null; spoken: string | null };
export type IdeaStory = {
  hero: string;
  villain: string;
  guide: string;
  outline: { hook: string; problem: string; development: string; proof: string; payoff: string; cta: string } | null;
  proofOfCraft: string;
};

export type ContentIdeaRow = {
  id: string;
  platform: Platform;
  planDate: string;
  status: string;
  pillar: Pillar | string;
  pillarLabel: string;
  objective: string;
  format: string;
  whyNow: string;
  title: string;
  hook: string;
  altHooks: string[];
  script: string;
  shotList: { shot: string; note?: string; required?: boolean }[];
  bRoll: string[];
  onScreenText: string[];
  editing: {
    capcut: string[];
    transitions: string[];
    pacing: string;
    sound: string;
    complexity: string;
    camera: string;
    location: string;
    props: string[];
  };
  caption: string;
  cta: string;
  cover: string;
  postingNotes: string;
  durationSeconds: number | null;
  recordMinutes: number | null;
  editMinutes: number | null;
  whyItCanWork: string;
  authoritySignal: string;
  engagementMechanism: string;
  brandAudienceEffect: 'up' | 'neutral' | 'down';
  verdict: string;
  seriesName: string | null;
  episode: number | null;
  trendIds: string[];
  milestoneId: string | null;
  freshUntil: string | null;
  /** A mentoria, aplicada. */
  contentFunction: string | null;
  functionLabel: string;
  modes: string[];
  modeLabels: string[];
  hooks: IdeaHooks;
  story: IdeaStory;
  reelsTest: { eligible: boolean; recommendation: string; because: string } | null;
  track: Track;
  trackLabel: string;
  language: string;
  whyChosen: string;
  rulesUsed: string[];
  assetsAvailable: string[];
  brollAssetIds: string[];
  parentIdeaId: string | null;
};

const SELECT_IDEA = `
  id, platform, plan_date, status, pillar, objective, format, source_reason, title, hook, alt_hooks,
  script, shot_list, b_roll, on_screen_text, editing_plan, caption, cta, cover_note, posting_notes,
  duration_seconds, estimated_record_minutes, estimated_edit_minutes, why_it_can_work,
  authority_signal, engagement_mechanism, brand_audience_effect, quality, trend_ids, milestone_id,
  episode, fresh_until, content_function, editorial_modes, hooks, story, reels_test, decision_trace,
  language, track, broll_asset_ids, parent_idea_id, series:series_id ( name )
`;

type RawIdea = Record<string, unknown> & { series?: { name: string } | { name: string }[] | null };

function toIdeaRow(r: RawIdea): ContentIdeaRow {
  const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const editing = (r.editing_plan ?? {}) as Record<string, unknown>;
  const quality = (r.quality ?? {}) as Record<string, unknown>;
  const pillar = String(r.pillar ?? '');
  const hooks = (r.hooks ?? {}) as Partial<IdeaHooks>;
  const story = (r.story ?? {}) as Partial<IdeaStory>;
  const reels = (r.reels_test ?? {}) as { eligible?: boolean; recommendation?: string; because?: string };
  const trace = (r.decision_trace ?? {}) as Partial<DecisionTrace>;
  const track = (TRACKS as readonly string[]).includes(String(r.track)) ? (String(r.track) as Track) : 'main';
  const fn = typeof r.content_function === 'string' ? r.content_function : null;
  const modes = ((r.editorial_modes ?? []) as string[]).filter(isEditorialMode);

  return {
    id: String(r.id),
    platform: r.platform as Platform,
    planDate: String(r.plan_date),
    status: String(r.status),
    pillar,
    pillarLabel: isPillar(pillar) ? PILLAR_LABEL[pillar] : pillar,
    objective: String(r.objective ?? ''),
    format: String(r.format ?? ''),
    whyNow: String(r.source_reason ?? ''),
    title: String(r.title ?? ''),
    hook: String(r.hook ?? ''),
    altHooks: (r.alt_hooks ?? []) as string[],
    script: String(r.script ?? ''),
    shotList: (r.shot_list ?? []) as ContentIdeaRow['shotList'],
    bRoll: (r.b_roll ?? []) as string[],
    onScreenText: (r.on_screen_text ?? []) as string[],
    editing: {
      capcut: (editing.capcut ?? []) as string[],
      transitions: (editing.transitions ?? []) as string[],
      pacing: String(editing.pacing ?? ''),
      sound: String(editing.sound ?? ''),
      complexity: String(editing.complexity ?? 'simple'),
      camera: String(editing.camera ?? ''),
      location: String(editing.location ?? ''),
      props: (editing.props ?? []) as string[],
    },
    caption: String(r.caption ?? ''),
    cta: String(r.cta ?? ''),
    cover: String(r.cover_note ?? ''),
    postingNotes: String(r.posting_notes ?? ''),
    durationSeconds: (r.duration_seconds as number | null) ?? null,
    recordMinutes: (r.estimated_record_minutes as number | null) ?? null,
    editMinutes: (r.estimated_edit_minutes as number | null) ?? null,
    whyItCanWork: String(r.why_it_can_work ?? ''),
    authoritySignal: String(r.authority_signal ?? ''),
    engagementMechanism: String(r.engagement_mechanism ?? ''),
    brandAudienceEffect: (r.brand_audience_effect as ContentIdeaRow['brandAudienceEffect']) ?? 'neutral',
    verdict: String(quality.phrase ?? ''),
    seriesName: one(r.series)?.name ?? null,
    episode: (r.episode as number | null) ?? null,
    trendIds: (r.trend_ids ?? []) as string[],
    milestoneId: (r.milestone_id as string | null) ?? null,
    freshUntil: (r.fresh_until as string | null) ?? null,
    contentFunction: fn,
    functionLabel: fn && fn in FUNCTION_LABEL ? FUNCTION_LABEL[fn as keyof typeof FUNCTION_LABEL] : '',
    modes,
    modeLabels: modes.map((m) => MODE_SPEC[m].label),
    hooks: {
      visual: hooks.visual ?? null,
      written: hooks.written ?? null,
      writtenType: hooks.writtenType ?? null,
      spoken: hooks.spoken ?? null,
    },
    story: {
      hero: story.hero ?? '',
      villain: story.villain ?? '',
      guide: story.guide ?? '',
      outline: story.outline ?? null,
      proofOfCraft: story.proofOfCraft ?? '',
    },
    reelsTest: typeof reels.eligible === 'boolean' ? { eligible: reels.eligible, recommendation: reels.recommendation ?? '', because: reels.because ?? '' } : null,
    track,
    trackLabel: TRACK_LABEL[track],
    language: String(r.language ?? 'pt-BR'),
    whyChosen: String(trace.whyRecommended ?? quality.recommendation ?? ''),
    rulesUsed: (trace.strategyRulesUsed ?? []) as string[],
    assetsAvailable: (trace.assetsAvailable ?? []) as string[],
    brollAssetIds: (r.broll_asset_ids ?? []) as string[],
    parentIdeaId: (r.parent_idea_id as string | null) ?? null,
  };
}

/** As do dia: uma por plataforma no feed, mais o Reels Test — as mais
 *  recentes de cada. */
export async function todayContent(now: Date = new Date()): Promise<ContentIdeaRow[]> {
  const db = supabaseService();
  const { data } = await db
    .from('creator_content_idea')
    .select(SELECT_IDEA)
    .in('status', ['ready', 'saved'])
    .order('plan_date', { ascending: false })
    .order('generated_at', { ascending: false })
    .limit(16);

  const rows = ((data ?? []) as unknown as RawIdea[]).map(toIdeaRow);
  const viva = (r: ContentIdeaRow) => !isStale({ freshUntil: r.freshUntil, generatedAt: r.planDate }, now);
  const out: ContentIdeaRow[] = [];
  for (const p of ['instagram', 'tiktok'] as Platform[]) {
    const first = rows.find((r) => r.platform === p && r.track !== 'reels_test' && viva(r));
    if (first) out.push(first);
  }
  const teste = rows.find((r) => r.track === 'reels_test' && viva(r));
  if (teste) out.push(teste);
  return out;
}

export async function contentBank(status?: string[]): Promise<ContentIdeaRow[]> {
  const db = supabaseService();
  let q = db.from('creator_content_idea').select(SELECT_IDEA).order('generated_at', { ascending: false }).limit(60);
  if (status?.length) q = q.in('status', status);
  const { data } = await q;
  return ((data ?? []) as unknown as RawIdea[]).map(toIdeaRow);
}

export async function contentIdea(id: string): Promise<ContentIdeaRow | null> {
  const db = supabaseService();
  const { data } = await db.from('creator_content_idea').select(SELECT_IDEA).eq('id', id).maybeSingle();
  return data ? toIdeaRow(data as unknown as RawIdea) : null;
}

/** Uma decisão dela sobre uma ideia. O motivo só existe quando é recusa.
 *
 *  Guardar o motivo é o que separa «sumiu da tela» de «não volta»: é ele que
 *  o plano da manhã seguinte lê antes de escrever. Voltar atrás limpa-o — uma
 *  ideia que ela recuperou não é uma ideia recusada. */
export async function setIdeaStatus(
  id: string,
  status: string,
  reason?: RejectionReason,
): Promise<void> {
  const recusa = status === 'discarded' || status === 'archived';
  await supabaseService()
    .from('creator_content_idea')
    .update({
      status,
      decided_at: new Date().toISOString(),
      rejected_reason: recusa ? (reason ?? null) : null,
    })
    .eq('id', id);
}

/** O que ela recusou e porquê, para o gerador não repetir o caminho.
 *
 *  Só as que trazem motivo: uma recusa sem motivo não ensina nada e enchia o
 *  prompt de ruído. */
export async function rejectedIdeas(
  limit = 12,
): Promise<{ hook: string; platform: string; reason: string | null }[]> {
  const { data } = await supabaseService()
    .from('creator_content_idea')
    .select('hook, platform, rejected_reason')
    .not('rejected_reason', 'is', null)
    .order('decided_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    hook: r.hook,
    platform: r.platform,
    reason: r.rejected_reason,
  }));
}

/** Rótulos curtos para a tela: o que a função e o modo querem dizer. */
export const FUNCTION_SPEC_FOR_UI = FUNCTION_SPEC;
