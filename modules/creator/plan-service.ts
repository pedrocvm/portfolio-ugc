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
  PILLAR_LABEL,
  PLATFORM_BRIEF,
  audienceBalance,
  estimateMinutes,
  freshUntilFor,
  genericProblems,
  ideaFingerprint,
  isPillar,
  isRepeat,
  isStale,
  pillarPriority,
  platformTreatmentsDiffer,
  qualityVerdict,
  recentlyUsedPillars,
  seriesIsViable,
  shouldGenerate,
  type Pillar,
  type Platform,
} from './domain';
import { describeProfile, profileFresh } from './profile-service';

export * from './domain';

/** O plano de conteúdo do dia.
 *
 *  Uma ideia para Instagram e uma para TikTok, tratadas de forma nativa. Não é
 *  o mesmo vídeo duas vezes: `platformTreatmentsDiffer` verifica-o depois de o
 *  modelo responder, e uma ideia que não passa é rejeitada com o motivo em vez
 *  de ser guardada na mesma.
 *
 *  Duas travagens antes de gerar seja o que for: se já há muitas ideias por
 *  gravar, refresca-se em vez de somar; e se o retrato dela não foi observado,
 *  o prompt diz isso em vez de fingir que conhece o estilo dela. */

export type ContentPlanResult = {
  generated: number;
  rejected: number;
  archived: number;
  reasons: string[];
  failures: string[];
};

export async function runDailyContentPlan(
  opts: { now?: Date; force?: boolean } = {},
): Promise<ContentPlanResult> {
  const db = supabaseService();
  const now = opts.now ?? new Date();
  const planDate = localDay(now);
  const reasons: string[] = [];
  const failures: string[] = [];

  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { generated: 0, rejected: 0, archived: 0, reasons: [], failures: ['Sem utilizador.'] };

  // ── Idempotência pelo dia ───────────────────────────────────────────────
  const { data: hoje } = await db
    .from('creator_content_idea')
    .select('id, platform')
    .eq('plan_date', planDate)
    .in('status', ['ready', 'saved', 'recorded', 'published']);

  if (!opts.force && (hoje ?? []).length >= 2) {
    return { generated: 0, rejected: 0, archived: 0, reasons: ['O plano de hoje já existe.'], failures: [] };
  }

  // ── Envelhecimento: o que morreu sai antes de entrar coisa nova ─────────
  const archived = await archiveStale(now);

  // ── Carga: não somar catorze quando já há sete por gravar ───────────────
  const { count: prontas } = await db
    .from('creator_content_idea')
    .select('id', { count: 'exact', head: true })
    .in('status', ['ready', 'saved']);

  const carga = shouldGenerate(prontas ?? 0);
  if (!carga.generate) {
    return { generated: 0, rejected: 0, archived, reasons: [carga.because], failures: [] };
  }
  if (carga.refreshOnly) reasons.push(carga.because);

  // ── Contexto ────────────────────────────────────────────────────────────
  const [profile, trends, milestones, history, series, jobs] = await Promise.all([
    profileFresh(),
    usableTrends(6),
    contentWorthyMilestones(4),
    recentIdeas(30),
    activeSeries(),
    upcomingJobs(),
  ]);

  const balance = audienceBalance(history.map((h) => ({ pillar: h.pillar })));
  const ordem = pillarPriority(
    history.map((h) => ({ pillar: h.pillar, at: h.generatedAt })),
    { audienceTilt: balance.tilt },
  );
  const evitar = recentlyUsedPillars(
    history.map((h) => ({ pillar: h.pillar, at: h.generatedAt })),
    { window: 3 },
  );

  if (trends.length === 0) {
    reasons.push('Nenhuma tendência actual encaixava nela hoje, por isso o plano não usa nenhuma.');
  }

  const run = await runPrompt(
    planDailyContent,
    {
      today: planDate,
      profile: describeProfile(profile),
      pillars: ordem.map((p, i) => `${i + 1}. ${p} — ${PILLAR_LABEL[p]}`).join('\n'),
      avoidPillars: evitar.map((p) => PILLAR_LABEL[p]).join(', '),
      audienceTilt:
        balance.tilt === 'brand'
          ? 'Ultimamente tem falado sobretudo para creators. Puxa para o que uma marca aprecia.'
          : balance.tilt === 'creator'
            ? 'Ultimamente tem falado sobretudo para marcas. Cabe uma peça que fale a creators.'
            : 'Está equilibrado. Mantém.',
      trends: describeTrends(trends),
      milestones: describeMilestones(milestones),
      jobs,
      recentIdeas: history
        .slice(0, 12)
        .map((h) => `- [${h.platform}] ${h.hook}`)
        .join('\n'),
      series,
      instagramBrief: describeBrief('instagram'),
      tiktokBrief: describeBrief('tiktok'),
    },
    { entityType: 'creator_content_idea', entityId: me.id, timeoutMs: 90_000 },
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

  for (const idea of [plano.instagram, plano.tiktok]) {
    const saved = await saveIdea({
      idea,
      appUserId: me.id,
      planDate,
      now,
      history,
      trends,
      milestones,
      runId: run.runId,
    });
    if (saved.ok) generated++;
    else {
      rejected++;
      reasons.push(`${idea.platform}: ${saved.because}`);
    }
  }

  return { generated, rejected, archived, reasons, failures };
}

type SaveResult = { ok: true; id: string } | { ok: false; because: string };

async function saveIdea(input: {
  idea: ContentIdea;
  appUserId: string;
  planDate: string;
  now: Date;
  history: readonly RecentIdea[];
  trends: readonly TrendRow[];
  milestones: readonly { id: string; label: string; summary: string }[];
  runId: string | null;
}): Promise<SaveResult> {
  const db = supabaseService();
  const { idea } = input;

  // ── Porta anti-genérico ─────────────────────────────────────────────────
  const problemas = genericProblems({ hook: idea.hook, script: idea.script, title: idea.title });
  if (problemas.length) return { ok: false, because: problemas.join('; ') };

  const pillar: Pillar = isPillar(idea.pillar) ? idea.pillar : 'UGC_AUTHORITY';

  const repetida = isRepeat(
    { platform: idea.platform, pillar, hook: idea.hook, title: idea.title },
    input.history.map((h) => ({ fingerprint: h.fingerprint, hook: h.hook })),
  );
  if (repetida.repeat) return { ok: false, because: repetida.because ?? 'repetida' };

  const verdict = qualityVerdict({
    originality: idea.quality.originality,
    specificity: idea.quality.specificity,
    carolFit: idea.quality.carol_fit,
    authority: idea.quality.authority,
    engagement: idea.quality.engagement,
    recordability: idea.quality.recordability,
    platformNative: idea.quality.platform_native,
    freshness: idea.quality.freshness,
  });
  if (verdict.verdict === 'reject') return { ok: false, because: verdict.phrase };

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
  const usedTrends = input.trends
    .filter((t) => idea.why_now.includes(t.title) || idea.script.includes(t.title))
    .map((t) => t.id);

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
      estimated_record_minutes: tempo.record,
      estimated_edit_minutes: tempo.edit,
      why_it_can_work: idea.why_it_can_work,
      authority_signal: idea.authority_signal,
      engagement_mechanism: idea.engagement_mechanism,
      brand_audience_effect: idea.brand_audience_effect,
      mentorship_signal: idea.mentorship_signal,
      quality: asJson({ ...idea.quality, score: verdict.score, verdict: verdict.verdict, phrase: verdict.phrase }),
      trend_ids: usedTrends,
      series_id: seriesId,
      episode,
      milestone_id: usedMilestone?.id ?? null,
      fingerprint: ideaFingerprint({ platform: idea.platform, pillar, hook: idea.hook, title: idea.title }),
      fresh_until: freshUntilFor({ hasTrend: usedTrends.length > 0, trendFreshness }, input.now),
      generated_at: input.now.toISOString(),
      ai_run_id: input.runId,
    })
    .select('id')
    .maybeSingle();

  if (error || !data) return { ok: false, because: 'Não consegui guardar a ideia.' };

  // Um marco só se usa uma vez: a segunda seria a mesma história outra vez.
  if (usedMilestone) await markMilestoneUsed(usedMilestone.id);

  return { ok: true, id: data.id };
}

/* ── Leituras ─────────────────────────────────────────────────────────────── */

type RecentIdea = { fingerprint: string; hook: string; pillar: string; platform: string; generatedAt: string };

async function recentIdeas(limit: number): Promise<RecentIdea[]> {
  const db = supabaseService();
  const { data } = await db
    .from('creator_content_idea')
    .select('fingerprint, hook, pillar, platform, generated_at')
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
    .select('name, premise, structure, episodes, next_topics')
    .eq('status', 'active')
    .order('last_episode_at', { ascending: false, nullsFirst: false })
    .limit(3);

  return (data ?? [])
    .map(
      (s) =>
        `- «${s.name}» (${s.episodes} episódios): ${s.premise}. Estrutura: ${s.structure}. ` +
        `Próximos temas: ${((s.next_topics ?? []) as string[]).join(', ') || '(por definir)'}`,
    )
    .join('\n');
}

/** Gravações de marca já marcadas. Serve o Content Multiplier: o que sai da
 *  mesma sessão sem somar horas. */
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
      return `- ${brand?.name ?? 'Marca'}: ${c.title || 'gravação por descrever'} (${c.status}${prazo})`;
    })
    .join('\n');
}

function describeTrends(trends: readonly TrendRow[]): string {
  return trends
    .map(
      (t) =>
        `- [${t.platform} · ${t.kind} · ${t.freshness}] ${t.title}: ${t.description} ` +
        `Porque está a subir: ${t.whyTrending}. Encaixe: ${t.fitReason} ` +
        `Prova: ${t.evidence.map((e) => e.url).slice(0, 2).join(', ')}`,
    )
    .join('\n');
}

function describeBrief(platform: Platform): string {
  const b = PLATFORM_BRIEF[platform];
  return `Objectivo: ${b.objective}\nTratamento: ${b.treatment}\nA evitar: ${b.avoid}`;
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
};

const SELECT_IDEA = `
  id, platform, plan_date, status, pillar, objective, format, source_reason, title, hook, alt_hooks,
  script, shot_list, b_roll, on_screen_text, editing_plan, caption, cta, cover_note, posting_notes,
  duration_seconds, estimated_record_minutes, estimated_edit_minutes, why_it_can_work,
  authority_signal, engagement_mechanism, brand_audience_effect, quality, trend_ids, milestone_id,
  episode, fresh_until, series:series_id ( name )
`;

type RawIdea = Record<string, unknown> & { series?: { name: string } | { name: string }[] | null };

function toIdeaRow(r: RawIdea): ContentIdeaRow {
  const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const editing = (r.editing_plan ?? {}) as Record<string, unknown>;
  const quality = (r.quality ?? {}) as Record<string, unknown>;
  const pillar = String(r.pillar ?? '');

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
  };
}

/** As duas do dia: uma por plataforma, a mais recente de cada. */
export async function todayContent(now: Date = new Date()): Promise<ContentIdeaRow[]> {
  const db = supabaseService();
  const { data } = await db
    .from('creator_content_idea')
    .select(SELECT_IDEA)
    .in('status', ['ready', 'saved'])
    .order('plan_date', { ascending: false })
    .order('generated_at', { ascending: false })
    .limit(12);

  const rows = ((data ?? []) as unknown as RawIdea[]).map(toIdeaRow);
  const out: ContentIdeaRow[] = [];
  for (const p of ['instagram', 'tiktok'] as Platform[]) {
    const first = rows.find((r) => r.platform === p && !isStale({ freshUntil: r.freshUntil, generatedAt: r.planDate }, now));
    if (first) out.push(first);
  }
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

export async function setIdeaStatus(id: string, status: string): Promise<void> {
  await supabaseService()
    .from('creator_content_idea')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', id);
}
