import 'server-only';

import { hashContent } from '@/lib/crypto';
import { asJson } from '@/lib/supabase/json';
import { hasServiceRole, supabaseService } from '@/lib/supabase/service';
import { runPrompt, type ImageInput } from '@/modules/ai/gateway';
import { aiSetup } from '@/modules/ai/provider';
import {
  deconstructReference,
  readBragaPlaces,
  readInsightsScreenshot,
  tagBroll,
  threeHooks,
} from '@/modules/ai/prompts/registry';
import { normalizeReferenceUrl, freshnessOf } from '@/modules/references/domain';
import { describeStrategy, STRATEGY_SOURCE } from './strategy';
import {
  BRAGA_REAL,
  EXPERIMENT_KINDS,
  EXPERIMENT_SPEC,
  MENTOR_SOURCE,
  PLAYBOOK_VERSION,
  describePlaybook,
  playbookForScreen,
  type ExperimentKind,
} from './mentor-playbook';
import { functionBalance, modeBalance } from './content-engine';
import {
  carolBaseline,
  duplicateContent,
  evaluatePerformance,
  feedPromotionCandidate,
  suggestBrollTags,
  testLoad,
  type Baseline,
  type BrollAsset,
  type TimedMeasurement,
} from './reels-test';
import { KNOWN_CONFLICTS, deriveLearnings, lifecycleStage, type ContentLearning, type PerfRow } from './learning';

/** O Content OS, na parte que fala com a base.
 *
 *  Tudo o que aqui está existe para a Carol não manter nada à mão: as
 *  experiências nascem da mentoria, os ganchos entram quando a ideia é salva,
 *  o desempenho entra por print, os aprendizados derivam-se dos números, e a
 *  prova social nasce de um evento ou de um texto colado. Ela corrige; não
 *  cataloga. */

/* ── Sementes da mentoria ─────────────────────────────────────────────────── */

const MENTOR_SOURCE_TITLE = 'Mentoria de conteúdo · CCF · E1 — anotações do Gemini, 01/09/2026';

export type MentorSeedResult = { source: boolean; series: boolean; experiments: number; socialProof: boolean };

/** Idempotente: corre no arranque do plano e ao abrir o Conteúdo. */
export async function seedFromMentor(): Promise<MentorSeedResult> {
  if (!hasServiceRole()) return { source: false, series: false, experiments: 0, socialProof: false };
  const db = supabaseService();

  const { error: sourceError } = await db.from('knowledge_source').upsert(
    {
      source_type: 'mentor_session',
      title: MENTOR_SOURCE_TITLE,
      version: 'v1',
      authority: 75,
      effective_date: MENTOR_SOURCE.effectiveAt,
      status: 'active',
    },
    { onConflict: 'source_type,title,version', ignoreDuplicates: true },
  );

  const { data: existingSeries } = await db.from('content_series').select('id, kind').eq('name', BRAGA_REAL.name).maybeSingle();
  let series = false;
  if (!existingSeries) {
    const { error } = await db.from('content_series').insert({
      name: BRAGA_REAL.name,
      premise: BRAGA_REAL.premise,
      structure: BRAGA_REAL.structure,
      kind: 'braga_real',
      pillar: BRAGA_REAL.pillar,
      status: 'active',
      next_topics: asJson([]),
    });
    series = !error;
  } else if (existingSeries.kind !== 'braga_real') {
    await db.from('content_series').update({ kind: 'braga_real', pillar: BRAGA_REAL.pillar }).eq('id', existingSeries.id);
  }

  let experiments = 0;
  for (const kind of EXPERIMENT_KINDS) {
    const spec = EXPERIMENT_SPEC[kind];
    const { data, error } = await db
      .from('content_experiment')
      .upsert(
        { kind, label: spec.label, hypothesis: spec.hypothesis, what_we_test: spec.whatWeTest, status: 'planned', source: 'mentor_session' },
        { onConflict: 'kind', ignoreDuplicates: true },
      )
      .select('id');
    if (!error && (data ?? []).length) experiments++;
  }

  // O feedback da Charabanc que a mentora pediu para guardar. Entra sem
  // permissão: só ela a pode registar.
  const { data: charabanc } = await db.from('brand').select('id, name').ilike('name', 'charabanc%').limit(1).maybeSingle();
  const { data: proof, error: proofError } = await db
    .from('social_proof')
    .upsert(
      {
        brand_id: charabanc?.id ?? null,
        brand_name: charabanc?.name ?? 'Charabanc',
        feedback: 'A marca elogiou a precisão com que a Carol descreveu a essência do produto.',
        source: 'mentor_session',
        context: 'Relatado na sessão de mentoria de 01/09/2026. Falta o print do feedback original.',
        occurred_at: '2026-08-12T12:00:00Z',
        permission: 'unknown',
        dedupe_key: 'mentor:charabanc:essence',
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .select('id');

  return { source: !sourceError, series, experiments, socialProof: !proofError && (proof ?? []).length > 0 };
}

/* ── Definições ───────────────────────────────────────────────────────────── */

export type ContentSettings = { intensiveTestMode: boolean };

export async function contentSettings(): Promise<ContentSettings> {
  if (!hasServiceRole()) return { intensiveTestMode: false };
  const { data } = await supabaseService().from('app_setting').select('value').eq('key', 'content_os').maybeSingle();
  const v = (data?.value ?? {}) as { intensiveTestMode?: unknown };
  return { intensiveTestMode: v.intensiveTestMode === true };
}

export async function setIntensiveTestMode(on: boolean): Promise<ContentSettings> {
  const db = supabaseService();
  const current = await contentSettings();
  const next = { ...current, intensiveTestMode: on };
  await db.from('app_setting').upsert({ key: 'content_os', value: asJson(next), description: 'Content OS: modo de teste intensivo' });
  return next;
}

/* ── B-roll ───────────────────────────────────────────────────────────────── */

export type BrollRow = BrollAsset & { storagePath: string | null; notes: string; source: string; usedCount: number; createdAt: string };

export async function brollBank(limit = 40): Promise<BrollRow[]> {
  if (!hasServiceRole()) return [];
  const { data } = await supabaseService()
    .from('broll_asset')
    .select('id, storage_path, title, tags, duration_seconds, source, notes, used_count, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    storagePath: r.storage_path,
    title: r.title,
    tags: (r.tags ?? []) as string[],
    durationSeconds: r.duration_seconds,
    source: r.source,
    notes: r.notes,
    usedCount: r.used_count,
    createdAt: r.created_at,
  }));
}

export function describeBrollBank(bank: readonly BrollRow[]): string {
  return bank
    .slice(0, 20)
    .map((b) => `- [${b.id.slice(0, 8)}] ${b.title || '(sem título)'} · ${b.tags.join(', ') || 'sem etiquetas'}${b.durationSeconds ? ` · ${b.durationSeconds}s` : ''}`)
    .join('\n');
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function loadImage(storagePath: string): Promise<ImageInput | null> {
  const { data } = await supabaseService().storage.from('capture').download(storagePath);
  if (!data || data.size > MAX_IMAGE_BYTES || !data.type.startsWith('image/')) return null;
  return { mediaType: data.type, base64: Buffer.from(await data.arrayBuffer()).toString('base64') };
}

/** Registar um take. As etiquetas saem do nome, da nota e — quando é imagem —
 *  do que o modelo vê. Ela só corrige. */
export async function registerBroll(input: {
  storagePath?: string | null;
  fileName?: string | null;
  note?: string | null;
  durationSeconds?: number | null;
  collaborationId?: string | null;
}): Promise<{ ok: true; id: string; tags: string[] } | { ok: false; error: string }> {
  const db = supabaseService();
  let tags = suggestBrollTags({ fileName: input.fileName, note: input.note });
  let title = (input.note ?? '').trim().slice(0, 80) || (input.fileName ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();

  if (input.storagePath && aiSetup().provider) {
    const image = await loadImage(input.storagePath);
    if (image) {
      const seen = await runPrompt(tagBroll, { fileName: input.fileName ?? '', note: input.note ?? '' }, { images: [image], cache: true, entityType: 'broll_asset' });
      if (seen.ok) {
        tags = [...new Set([...tags, ...seen.output.tags.map((t) => t.toLowerCase().trim()).filter(Boolean)])].slice(0, 8);
        if (!title) title = seen.output.note.slice(0, 80);
      }
    }
  }

  const { data, error } = await db
    .from('broll_asset')
    .insert({
      storage_path: input.storagePath ?? null,
      title: title || 'take',
      tags: asJson(tags),
      duration_seconds: input.durationSeconds ?? null,
      source: input.collaborationId ? 'collaboration' : input.storagePath ? 'upload' : 'note',
      collaboration_id: input.collaborationId ?? null,
      notes: input.note ?? '',
    })
    .select('id')
    .maybeSingle();
  if (error || !data) return { ok: false, error: 'Não consegui registar o take.' };
  return { ok: true, id: data.id, tags };
}

export async function updateBrollTags(id: string, tags: string[]): Promise<void> {
  await supabaseService().from('broll_asset').update({ tags: asJson(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)) }).eq('id', id);
}

export async function markBrollUsed(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = supabaseService();
  const { data } = await db.from('broll_asset').select('id, used_count').in('id', ids as string[]);
  for (const r of data ?? []) {
    await db.from('broll_asset').update({ used_count: r.used_count + 1, last_used_at: new Date().toISOString() }).eq('id', r.id);
  }
}

/* ── Ganchos ──────────────────────────────────────────────────────────────── */

export type HookInput = { visual: string | null; written: string | null; writtenType: string | null; spoken: string | null };

export async function recordHooks(ideaId: string, hooks: HookInput, meta: { platform: string; format: string; topic: string }): Promise<void> {
  const db = supabaseService();
  const rows = (['visual', 'written', 'spoken'] as const)
    .map((channel) => ({ channel, hook: (hooks[channel] ?? '').trim() }))
    .filter((r) => r.hook.length > 0)
    .map((r) => ({
      idea_id: ideaId,
      channel: r.channel,
      hook: r.hook,
      written_type: r.channel === 'written' ? hooks.writtenType : null,
      platform: meta.platform,
      format: meta.format,
      topic: meta.topic.slice(0, 120),
    }));
  if (rows.length === 0) return;
  await db.from('hook_library').upsert(rows, { onConflict: 'idea_id,channel' });
}

export type HookRow = {
  id: string;
  ideaId: string | null;
  channel: string;
  hook: string;
  writtenType: string | null;
  platform: string;
  format: string;
  topic: string;
  performance: { views?: number; comments?: number; saves?: number } | null;
};

export async function hookLibrary(limit = 40): Promise<HookRow[]> {
  if (!hasServiceRole()) return [];
  const { data } = await supabaseService()
    .from('hook_library')
    .select('id, idea_id, channel, hook, written_type, platform, format, topic, performance')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    ideaId: r.idea_id,
    channel: r.channel,
    hook: r.hook,
    writtenType: r.written_type,
    platform: r.platform,
    format: r.format,
    topic: r.topic,
    performance: Object.keys((r.performance ?? {}) as object).length ? (r.performance as HookRow['performance']) : null,
  }));
}

/** «Me dá três ganchos.» */
export async function hooksFor(input: { topic: string; context?: string; ideaId?: string }) {
  let context = input.context ?? '';
  if (input.ideaId) {
    const { data } = await supabaseService().from('creator_content_idea').select('title, hook, script, pillar').eq('id', input.ideaId).maybeSingle();
    if (data) context = `${data.title} · ${data.hook}\n${data.script.slice(0, 1200)}\n${context}`;
  }
  const run = await runPrompt(threeHooks, { topic: input.topic, context, playbook: describePlaybook() }, { entityType: 'creator_content_idea', entityId: input.ideaId ?? null });
  return run.ok ? { ok: true as const, hooks: run.output } : { ok: false as const, error: run.message };
}

/* ── Desempenho ───────────────────────────────────────────────────────────── */

export type PerformanceInput = {
  ideaId: string | null;
  platform: string;
  postUrl?: string | null;
  measuredAt?: string | null;
  views?: number | null;
  reach?: number | null;
  nonFollowerReach?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  watchTimeSeconds?: number | null;
  avgWatchPct?: number | null;
  profileVisits?: number | null;
  follows?: number | null;
  source: 'manual' | 'screenshot';
  screenshotPath?: string | null;
  notes?: string;
};

export async function baseline(): Promise<Baseline> {
  if (!hasServiceRole()) return carolBaseline([]);
  // A última medição de cada peça, nas últimas 30. Duas medições do mesmo
  // Reel não são duas peças.
  const { data } = await supabaseService()
    .from('content_performance')
    .select('idea_id, views, measured_at')
    .not('views', 'is', null)
    .order('measured_at', { ascending: false })
    .limit(200);
  const porIdeia = new Map<string, number>();
  for (const r of data ?? []) {
    const key = r.idea_id ?? `orfa:${r.measured_at}`;
    if (!porIdeia.has(key)) porIdeia.set(key, r.views ?? 0);
  }
  return carolBaseline([...porIdeia.values()].slice(0, 30).map((views) => ({ views })));
}

export async function recordPerformance(input: PerformanceInput) {
  const db = supabaseService();
  const { data, error } = await db
    .from('content_performance')
    .insert({
      idea_id: input.ideaId,
      platform: input.platform,
      post_url: input.postUrl ?? null,
      measured_at: input.measuredAt ?? new Date().toISOString(),
      views: input.views ?? null,
      reach: input.reach ?? null,
      non_follower_reach: input.nonFollowerReach ?? null,
      likes: input.likes ?? null,
      comments: input.comments ?? null,
      saves: input.saves ?? null,
      shares: input.shares ?? null,
      watch_time_seconds: input.watchTimeSeconds ?? null,
      avg_watch_pct: input.avgWatchPct ?? null,
      profile_visits: input.profileVisits ?? null,
      follows: input.follows ?? null,
      source: input.source,
      screenshot_path: input.screenshotPath ?? null,
      notes: input.notes ?? '',
    })
    .select('id')
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: 'Não consegui registar os números.' };

  // Os ganchos desta peça passam a saber como correu.
  if (input.ideaId) {
    await db
      .from('hook_library')
      .update({ performance: asJson({ views: input.views ?? null, comments: input.comments ?? null, saves: input.saves ?? null, shares: input.shares ?? null }) })
      .eq('idea_id', input.ideaId);
  }

  const verdict = evaluatePerformance(
    { views: input.views ?? null, reach: input.reach, nonFollowerReach: input.nonFollowerReach, likes: input.likes, comments: input.comments, saves: input.saves, shares: input.shares },
    await baseline(),
  );
  return { ok: true as const, id: data.id, verdict };
}

/** Um print dos Insights, lido. Se souber de que peça é, regista. */
export async function readInsights(input: { storagePath: string; ideaId?: string | null; hint?: string }) {
  const image = await loadImage(input.storagePath);
  if (!image) return { ok: false as const, error: 'Não consegui ler a imagem (tem de ser um print até 4 MB).' };

  const run = await runPrompt(readInsightsScreenshot, { hint: input.hint ?? '' }, { images: [image], entityType: 'content_performance', entityId: input.ideaId ?? null });
  if (!run.ok) return { ok: false as const, error: run.message };
  const x = run.output;

  const nonFollowerReach =
    x.non_follower_reach ?? (x.reach && x.non_follower_pct !== null ? Math.round((x.reach * x.non_follower_pct) / 100) : null);

  let recorded: { id: string; verdict: ReturnType<typeof evaluatePerformance> } | null = null;
  if (input.ideaId && x.views !== null) {
    const r = await recordPerformance({
      ideaId: input.ideaId,
      platform: x.platform === 'unknown' ? 'instagram' : x.platform,
      measuredAt: x.measured_at ? `${x.measured_at}T12:00:00Z` : null,
      views: x.views,
      reach: x.reach,
      nonFollowerReach,
      likes: x.likes,
      comments: x.comments,
      saves: x.saves,
      shares: x.shares,
      watchTimeSeconds: x.watch_time_seconds,
      avgWatchPct: x.avg_watch_pct,
      profileVisits: x.profile_visits,
      follows: x.follows,
      source: 'screenshot',
      screenshotPath: input.storagePath,
    });
    if (r.ok) recorded = { id: r.id, verdict: r.verdict };
  }

  return { ok: true as const, extraction: x, nonFollowerReach, recorded, ambiguities: x.ambiguities };
}

export async function markPromotedToFeed(ideaId: string): Promise<void> {
  await supabaseService().from('content_performance').update({ promoted_to_feed: true }).eq('idea_id', ideaId);
}

/* ── O Reels Test Lab ─────────────────────────────────────────────────────── */

export type TestRow = {
  ideaId: string;
  title: string;
  hook: string;
  status: string;
  stage: ReturnType<typeof lifecycleStage>;
  measurements: TimedMeasurement[];
  latest: ReturnType<typeof evaluatePerformance> | null;
  promotion: ReturnType<typeof feedPromotionCandidate> | null;
  hasBroll: boolean;
  parentIdeaId: string | null;
};

export type ReelsTestLab = {
  running: TestRow[];
  ready: { ideaId: string; title: string; hook: string; because: string; hasBroll: boolean }[];
  promotionCandidates: TestRow[];
  load: ReturnType<typeof testLoad>;
  baseline: Baseline;
  settings: ContentSettings;
};

export async function reelsTestLab(): Promise<ReelsTestLab> {
  const settings = await contentSettings();
  if (!hasServiceRole()) {
    return { running: [], ready: [], promotionCandidates: [], load: testLoad({ intensiveMode: false, commercialShootsToday: 0, minutesCommitted: 0, brollAvailable: 0, readyTests: 0 }), baseline: carolBaseline([]), settings };
  }
  const db = supabaseService();
  const base = await baseline();

  const [{ data: tests }, bank, { count: shoots }] = await Promise.all([
    db
      .from('creator_content_idea')
      .select('id, title, hook, status, reels_test, broll_asset_ids, parent_idea_id, generated_at')
      .eq('track', 'reels_test')
      .in('status', ['ready', 'saved', 'recorded', 'published'])
      .order('generated_at', { ascending: false })
      .limit(20),
    brollBank(60),
    db.from('collaboration').select('id', { count: 'exact', head: true }).in('status', ['production_ready', 'in_production']),
  ]);

  const ids = (tests ?? []).map((t) => t.id);
  const { data: perfs } = ids.length
    ? await db
        .from('content_performance')
        .select('idea_id, views, reach, non_follower_reach, likes, comments, saves, shares, profile_visits, measured_at, promoted_to_feed')
        .in('idea_id', ids)
        .order('measured_at', { ascending: true })
    : { data: [] as never[] };

  const porIdeia = new Map<string, { ms: TimedMeasurement[]; promoted: boolean }>();
  for (const p of perfs ?? []) {
    if (!p.idea_id) continue;
    const entry = porIdeia.get(p.idea_id) ?? { ms: [], promoted: false };
    entry.ms.push({
      views: p.views,
      reach: p.reach,
      nonFollowerReach: p.non_follower_reach,
      likes: p.likes,
      comments: p.comments,
      saves: p.saves,
      shares: p.shares,
      profileVisits: p.profile_visits,
      measuredAt: p.measured_at,
    });
    entry.promoted = entry.promoted || p.promoted_to_feed;
    porIdeia.set(p.idea_id, entry);
  }

  const running: TestRow[] = [];
  const ready: ReelsTestLab['ready'] = [];
  for (const t of tests ?? []) {
    const hasBroll = ((t.broll_asset_ids ?? []) as string[]).length > 0;
    if (t.status === 'ready' || t.status === 'saved') {
      const rt = (t.reels_test ?? {}) as { because?: string };
      ready.push({ ideaId: t.id, title: t.title, hook: t.hook, because: rt.because ?? '', hasBroll });
      continue;
    }
    const entry = porIdeia.get(t.id) ?? { ms: [], promoted: false };
    const last = entry.ms[entry.ms.length - 1] ?? null;
    const promotion = entry.ms.length ? feedPromotionCandidate({ measurements: entry.ms, baseline: base, promoted: entry.promoted }) : null;
    running.push({
      ideaId: t.id,
      title: t.title,
      hook: t.hook,
      status: t.status,
      stage: lifecycleStage({
        status: t.status,
        track: 'reels_test',
        measurements: entry.ms.length,
        hasLearning: false,
        promotionCandidate: Boolean(promotion?.candidate),
        variantOf: Boolean(t.parent_idea_id),
      }),
      measurements: entry.ms,
      latest: last ? evaluatePerformance(last, base) : null,
      promotion,
      hasBroll,
      parentIdeaId: t.parent_idea_id,
    });
  }

  return {
    running: running.slice(0, 6),
    ready,
    promotionCandidates: running.filter((r) => r.promotion?.candidate),
    load: testLoad({
      intensiveMode: settings.intensiveTestMode,
      commercialShootsToday: shoots ?? 0,
      minutesCommitted: (shoots ?? 0) > 0 ? 120 : 0,
      brollAvailable: bank.length,
      readyTests: ready.length,
    }),
    baseline: base,
    settings,
  };
}

/** «Quero repostar o mesmo vídeo.» Compara com o que já saiu. */
export async function checkDuplicate(ideaId: string) {
  const db = supabaseService();
  const { data: idea } = await db.from('creator_content_idea').select('id, hook, caption, format, broll_asset_ids, track').eq('id', ideaId).maybeSingle();
  if (!idea) return { ok: false as const, error: 'Ideia não encontrada.' };
  const { data: others } = await db
    .from('creator_content_idea')
    .select('id, title, hook, caption, format, broll_asset_ids, status')
    .neq('id', ideaId)
    .in('status', ['recorded', 'published'])
    .order('generated_at', { ascending: false })
    .limit(40);

  const me = { assetIds: (idea.broll_asset_ids ?? []) as string[], hook: idea.hook, caption: idea.caption, structure: idea.format };
  const hits = (others ?? [])
    .map((o) => ({ other: o, verdict: duplicateContent(me, { assetIds: (o.broll_asset_ids ?? []) as string[], hook: o.hook, caption: o.caption, structure: o.format }) }))
    .filter((h) => h.verdict.duplicate || h.verdict.same.length > 0)
    .sort((a, b) => Number(b.verdict.duplicate) - Number(a.verdict.duplicate));

  const worst = hits[0];
  return {
    ok: true as const,
    duplicate: Boolean(worst?.verdict.duplicate),
    against: worst ? { id: worst.other.id, title: worst.other.title, status: worst.other.status } : null,
    because: worst?.verdict.because ?? 'Não tem nada em comum com o que já saiu.',
    variantOk: worst?.verdict.variantOk ?? true,
  };
}

/* ── Experiências e aprendizados ──────────────────────────────────────────── */

export type ExperimentRow = {
  id: string;
  kind: string;
  label: string;
  hypothesis: string;
  whatWeTest: string;
  status: string;
  sampleSize: number;
  result: string | null;
  learning: string | null;
  repeat: string | null;
};

export async function experiments(): Promise<ExperimentRow[]> {
  if (!hasServiceRole()) return [];
  const { data } = await supabaseService()
    .from('content_experiment')
    .select('id, kind, label, hypothesis, what_we_test, status, sample_size, result, learning, repeat')
    .order('created_at', { ascending: true });
  return (data ?? []).map((e) => ({
    id: e.id,
    kind: e.kind,
    label: e.label,
    hypothesis: e.hypothesis,
    whatWeTest: e.what_we_test,
    status: e.status,
    sampleSize: e.sample_size,
    result: e.result,
    learning: e.learning,
    repeat: e.repeat,
  }));
}

export async function setExperimentStatus(kind: ExperimentKind | string, status: 'planned' | 'running' | 'paused'): Promise<void> {
  await supabaseService()
    .from('content_experiment')
    .update({ status, started_at: status === 'running' ? new Date().toISOString() : undefined, updated_at: new Date().toISOString() })
    .eq('kind', kind);
}

export type LearningRow = ContentLearning & { id: string; derivedAt: string };

export async function contentLearnings(limit = 3): Promise<LearningRow[]> {
  if (!hasServiceRole()) return [];
  const { data } = await supabaseService()
    .from('content_learning')
    .select('id, statement, evidence, sample_size, confidence, kind, derived_at')
    .eq('active', true)
    .order('sample_size', { ascending: false })
    .limit(limit);
  return (data ?? []).map((l) => ({
    id: l.id,
    statement: l.statement,
    evidence: l.evidence as ContentLearning['evidence'],
    sampleSize: l.sample_size,
    confidence: l.confidence as ContentLearning['confidence'],
    kind: l.kind as ContentLearning['kind'],
    derivedAt: l.derived_at,
  }));
}

/** Os aprendizados derivam-se dos números; as experiências contam as peças
 *  que já lhes pertencem. Corre antes do plano do dia e não gasta modelo. */
export async function refreshContentLearning(): Promise<{ learnings: number; experiments: number }> {
  if (!hasServiceRole()) return { learnings: 0, experiments: 0 };
  const db = supabaseService();

  const { data: perfs } = await db
    .from('content_performance')
    .select('idea_id, views, reach, non_follower_reach, comments, saves, shares, profile_visits, measured_at')
    .not('idea_id', 'is', null)
    .order('measured_at', { ascending: false })
    .limit(300);

  const ultima = new Map<string, NonNullable<typeof perfs>[number]>();
  for (const p of perfs ?? []) if (p.idea_id && !ultima.has(p.idea_id)) ultima.set(p.idea_id, p);

  const ids = [...ultima.keys()];
  const { data: ideas } = ids.length
    ? await db.from('creator_content_idea').select('id, format, track, language, content_function').in('id', ids)
    : { data: [] as never[] };

  const rows: PerfRow[] = (ideas ?? []).map((i) => {
    const p = ultima.get(i.id)!;
    return {
      ideaId: i.id,
      format: i.format,
      track: i.track,
      language: i.language,
      contentFunction: i.content_function,
      views: p.views,
      reach: p.reach,
      nonFollowerReach: p.non_follower_reach,
      comments: p.comments,
      saves: p.saves,
      shares: p.shares,
      profileVisits: p.profile_visits,
    };
  });

  const derived = deriveLearnings(rows);
  const keys = new Set<string>();
  let learnings = 0;
  for (const l of derived) {
    const dedupe = `${l.evidence.dimension}:${l.evidence.metric}:${l.evidence.a.label}>${l.evidence.b.label}`;
    keys.add(dedupe);
    const { error } = await db.from('content_learning').upsert(
      {
        statement: l.statement,
        evidence: asJson(l.evidence),
        sample_size: l.sampleSize,
        confidence: l.confidence,
        kind: l.kind,
        dedupe_key: dedupe,
        active: true,
        derived_at: new Date().toISOString(),
      },
      { onConflict: 'dedupe_key' },
    );
    if (!error) learnings++;
  }
  // O que deixou de ser verdade fecha-se sozinho.
  if (keys.size) await db.from('content_learning').update({ active: false }).not('dedupe_key', 'in', `(${[...keys].map((k) => `"${k}"`).join(',')})`);
  else await db.from('content_learning').update({ active: false }).eq('active', true);

  // As experiências contam as peças que lhes pertencem, pela faixa.
  const { data: byTrack } = await db
    .from('creator_content_idea')
    .select('id, track, language, series_id, status, series:series_id ( kind )')
    .in('status', ['recorded', 'published']);
  const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const counts: Record<ExperimentKind, string[]> = {
    reels_test_short: [],
    english_content: [],
    braga_real: [],
    capcut_breakdown: [],
    talking_head_vs_broll: [],
    aesthetic_territory: [],
  };
  for (const i of byTrack ?? []) {
    if (i.track === 'reels_test') counts.reels_test_short.push(i.id);
    if (i.language === 'en') counts.english_content.push(i.id);
    if (one(i.series as { kind: string } | { kind: string }[] | null)?.kind === 'braga_real') counts.braga_real.push(i.id);
    if (i.track === 'capcut') counts.capcut_breakdown.push(i.id);
  }
  let experimentsTouched = 0;
  for (const kind of EXPERIMENT_KINDS) {
    const ideaIds = counts[kind];
    const learning = derived.find((l) =>
      (kind === 'reels_test_short' && l.evidence.dimension === 'track') ||
      (kind === 'english_content' && l.evidence.dimension === 'language') ||
      (kind === 'talking_head_vs_broll' && l.evidence.dimension === 'format'),
    );
    const { error } = await db
      .from('content_experiment')
      .update({
        idea_ids: ideaIds,
        sample_size: ideaIds.length,
        status: learning ? 'learned' : ideaIds.length > 0 ? 'running' : undefined,
        learning: learning?.statement ?? null,
        result: ideaIds.length ? `${ideaIds.length} ${ideaIds.length === 1 ? 'peça publicada' : 'peças publicadas'}` : null,
        updated_at: new Date().toISOString(),
      })
      .eq('kind', kind);
    if (!error) experimentsTouched++;
  }

  return { learnings, experiments: experimentsTouched };
}

/* ── Equilíbrio ───────────────────────────────────────────────────────────── */

export async function contentBalanceNow() {
  if (!hasServiceRole()) return { fn: functionBalance([]), mode: modeBalance([]) };
  const { data } = await supabaseService()
    .from('creator_content_idea')
    .select('content_function, editorial_modes')
    .in('status', ['ready', 'saved', 'recorded', 'published'])
    .eq('track', 'main')
    .order('generated_at', { ascending: false })
    .limit(12);
  const rows = data ?? [];
  return {
    fn: functionBalance(rows.map((r) => ({ contentFunction: r.content_function }))),
    mode: modeBalance(rows.map((r) => ({ modes: (r.editorial_modes ?? []) as string[] }))),
  };
}

export function describeBalance(b: Awaited<ReturnType<typeof contentBalanceNow>>): string {
  return [b.fn.because, b.mode.because].join('\n');
}

/* ── Prova social ─────────────────────────────────────────────────────────── */

export type SocialProofRow = {
  id: string;
  brandId: string | null;
  brandName: string;
  feedback: string;
  source: string;
  screenshotPath: string | null;
  permission: 'unknown' | 'requested' | 'granted' | 'denied';
  context: string;
  occurredAt: string | null;
  usableForPortfolio: boolean;
  usableForSocial: boolean;
  contentIdeaId: string | null;
};

export async function socialProofVault(): Promise<SocialProofRow[]> {
  if (!hasServiceRole()) return [];
  const { data } = await supabaseService()
    .from('social_proof')
    .select('id, brand_id, brand_name, feedback, source, screenshot_path, permission, context, occurred_at, usable_for_portfolio, usable_for_social, content_idea_id')
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .limit(30);
  return (data ?? []).map((p) => ({
    id: p.id,
    brandId: p.brand_id,
    brandName: p.brand_name,
    feedback: p.feedback,
    source: p.source,
    screenshotPath: p.screenshot_path,
    permission: p.permission as SocialProofRow['permission'],
    context: p.context,
    occurredAt: p.occurred_at,
    usableForPortfolio: p.usable_for_portfolio,
    usableForSocial: p.usable_for_social,
    contentIdeaId: p.content_idea_id,
  }));
}

export async function saveSocialProof(input: {
  brandName: string;
  feedback: string;
  context?: string;
  screenshotPath?: string | null;
  source?: 'manual' | 'email' | 'screenshot';
  occurredAt?: string | null;
}) {
  const db = supabaseService();
  const { data: brand } = await db.from('brand').select('id, name').ilike('name', `${input.brandName.trim()}%`).limit(1).maybeSingle();
  const dedupe = `manual:${await hashContent(`${input.brandName}:${input.feedback}`.toLowerCase())}`;
  const { data, error } = await db
    .from('social_proof')
    .upsert(
      {
        brand_id: brand?.id ?? null,
        brand_name: brand?.name ?? input.brandName.trim(),
        feedback: input.feedback.trim(),
        context: input.context ?? '',
        screenshot_path: input.screenshotPath ?? null,
        source: input.source ?? 'manual',
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        permission: 'unknown',
        dedupe_key: dedupe,
      },
      { onConflict: 'dedupe_key' },
    )
    .select('id')
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: 'Não consegui salvar o feedback.' };
  return { ok: true as const, id: data.id };
}

/** Só ela regista permissão. Sem `granted`, nada é usável em lado nenhum. */
export async function setSocialProofPermission(id: string, permission: SocialProofRow['permission']): Promise<void> {
  await supabaseService()
    .from('social_proof')
    .update({ permission, usable_for_portfolio: permission === 'granted', usable_for_social: permission === 'granted' })
    .eq('id', id);
}

/** Aprovações de marca já gravadas viram candidatas a prova social, sem o
 *  texto — ela cola o print quando quiser. */
export async function deriveSocialProofCandidates(): Promise<number> {
  if (!hasServiceRole()) return 0;
  const db = supabaseService();
  const { data: events } = await db
    .from('activity_event')
    .select('id, brand_id, occurred_at, summary, brand:brand_id ( name )')
    .eq('event_type', 'content.approved')
    .order('occurred_at', { ascending: false })
    .limit(20);
  const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  let created = 0;
  const seen = new Set<string>();
  for (const e of events ?? []) {
    if (!e.brand_id || seen.has(e.brand_id)) continue;
    seen.add(e.brand_id);
    const { data, error } = await db
      .from('social_proof')
      .upsert(
        {
          brand_id: e.brand_id,
          brand_name: one(e.brand as { name: string } | { name: string }[] | null)?.name ?? 'Marca',
          feedback: '',
          source: 'event',
          context: `A marca aprovou conteúdo a ${e.occurred_at.slice(0, 10)}. Falta o texto do feedback — cola o print quando quiser usar.`,
          occurred_at: e.occurred_at,
          permission: 'unknown',
          dedupe_key: `event:brand:${e.brand_id}`,
        },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      .select('id');
    if (!error && (data ?? []).length) created++;
  }
  return created;
}

/* ── Referências: destrinchar ─────────────────────────────────────────────── */

export async function deconstruct(input: { reference: string; url?: string | null }) {
  const run = await runPrompt(
    deconstructReference,
    { reference: input.reference, strategy: describeStrategy(), playbook: describePlaybook() },
    { entityType: 'creative_reference', cache: true },
  );
  if (!run.ok) return { ok: false as const, error: run.message };

  let referenceId: string | null = null;
  if (input.url && /^https?:\/\//.test(input.url)) {
    const url = normalizeReferenceUrl(input.url);
    const { data } = await supabaseService()
      .from('creative_reference')
      .upsert(
        {
          source_platform: /instagram\.com/.test(url) ? 'instagram' : /tiktok\.com/.test(url) ? 'tiktok' : /youtu/.test(url) ? 'youtube' : 'web',
          source_url: input.url,
          url_hash: await hashContent(url),
          title: run.output.hook.slice(0, 120),
          hook: run.output.hook,
          structure: run.output.structure,
          editing_style: `${run.output.pacing} · ${run.output.transitions}`,
          why_it_works: run.output.why_it_works,
          signals: asJson([run.output.emotional_driver]),
          freshness: freshnessOf(null),
          source_confidence: 'reported',
          purpose: 'creator',
          ai_run_id: run.runId,
        },
        { onConflict: 'url_hash' },
      )
      .select('id')
      .maybeSingle();
    referenceId = data?.id ?? null;
  }
  return { ok: true as const, deconstruction: run.output, referenceId };
}

/* ── Braga Real ───────────────────────────────────────────────────────────── */

export type BragaPlace = {
  name: string;
  kind: string;
  why: string;
  angle: string;
  sourceUrl: string | null;
  visited: boolean;
  recorded: boolean;
  published: boolean;
  ideaId: string | null;
  addedAt: string;
};

export type BragaSeries = { id: string; name: string; premise: string; episodes: number; places: BragaPlace[]; nextPlaces: BragaPlace[] };

export async function bragaSeries(): Promise<BragaSeries | null> {
  if (!hasServiceRole()) return null;
  const { data } = await supabaseService().from('content_series').select('id, name, premise, episodes, places').eq('kind', 'braga_real').maybeSingle();
  if (!data) return null;
  const places = ((data.places ?? []) as BragaPlace[]).map((p) => ({ ...p, visited: Boolean(p.visited), recorded: Boolean(p.recorded), published: Boolean(p.published) }));
  return { id: data.id, name: data.name, premise: data.premise, episodes: data.episodes, places, nextPlaces: places.filter((p) => !p.published).slice(0, 5) };
}

export async function updateBragaPlace(name: string, patch: Partial<Pick<BragaPlace, 'visited' | 'recorded' | 'published' | 'ideaId'>>): Promise<void> {
  const s = await bragaSeries();
  if (!s) return;
  const places = s.places.map((p) => (p.name === name ? { ...p, ...patch } : p));
  await supabaseService().from('content_series').update({ places: asJson(places) }).eq('id', s.id);
}

/** Procurar lugares para a série. Corre quando ela pede — nunca vira tarefa
 *  diária. O que encontra fica no banco, à espera. */
export async function discoverBragaPlaces(): Promise<{ ok: true; added: number; places: BragaPlace[] } | { ok: false; error: string }> {
  const setup = aiSetup();
  if (!setup.provider) return { ok: false, error: 'A IA não está configurada.' };
  const s = await bragaSeries();
  if (!s) return { ok: false, error: 'A série Braga Real ainda não existe.' };

  let prose = '';
  try {
    prose = await setup.provider.search({
      model: setup.models.chat,
      system:
        'Procuras restaurantes, cafés, tascas e experiências REAIS em Braga, Portugal, com nome e, se possível, endereço. ' +
        'Interessa o que é de bairro, de serviço, de gente — não o instagramável nem o de luxo. Nunca inventes um lugar.',
      user: `Lugares em Braga para uma série de vídeos sobre a cidade vista por quem passou dez anos numa sala de restaurante. Já na lista: ${s.places.map((p) => p.name).join(', ') || 'nenhum'}.`,
      maxTokens: 2500,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'A pesquisa falhou.' };
  }
  if (!prose.trim()) return { ok: true, added: 0, places: s.places };

  const run = await runPrompt(readBragaPlaces, { prose, known: s.places.map((p) => p.name).join(', ') }, { entityType: 'content_series', entityId: s.id });
  if (!run.ok) return { ok: false, error: run.message };

  const known = new Set(s.places.map((p) => p.name.toLowerCase()));
  const novos: BragaPlace[] = run.output.places
    .filter((p) => p.name.trim() && !known.has(p.name.trim().toLowerCase()))
    .map((p) => ({ name: p.name.trim(), kind: p.kind, why: p.why, angle: p.angle, sourceUrl: p.source_url, visited: false, recorded: false, published: false, ideaId: null, addedAt: new Date().toISOString() }));
  const places = [...s.places, ...novos];
  await supabaseService().from('content_series').update({ places: asJson(places) }).eq('id', s.id);
  return { ok: true, added: novos.length, places };
}

/* ── A tela de estratégia ─────────────────────────────────────────────────── */

export async function strategyScreen() {
  const [screen, exps, learnings] = await Promise.all([playbookForScreen(), experiments(), contentLearnings(3)]);
  return {
    playbookVersion: PLAYBOOK_VERSION,
    mentorSource: MENTOR_SOURCE,
    auditSource: STRATEGY_SOURCE,
    following: screen.following,
    testing: screen.testing.map((t) => ({ ...t, status: exps.find((e) => e.kind === t.kind)?.status ?? 'planned', sampleSize: exps.find((e) => e.kind === t.kind)?.sampleSize ?? 0 })),
    heuristics: screen.heuristics,
    learned: learnings,
    conflicts: KNOWN_CONFLICTS,
  };
}

/* ── Leituras para a tela ─────────────────────────────────────────────────── */

export type LatestPerformance = {
  ideaId: string;
  measuredAt: string;
  views: number | null;
  reach: number | null;
  nonFollowerReach: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  promoted: boolean;
  measurements: number;
  verdict: ReturnType<typeof evaluatePerformance>;
};

/** A última medição de cada peça, já avaliada face à linha de base dela. */
export async function latestPerformanceByIdea(): Promise<Map<string, LatestPerformance>> {
  const out = new Map<string, LatestPerformance>();
  if (!hasServiceRole()) return out;
  const base = await baseline();
  const { data } = await supabaseService()
    .from('content_performance')
    .select('idea_id, measured_at, views, reach, non_follower_reach, likes, comments, saves, shares, promoted_to_feed')
    .not('idea_id', 'is', null)
    .order('measured_at', { ascending: false })
    .limit(300);
  const counts = new Map<string, number>();
  for (const p of data ?? []) {
    if (!p.idea_id) continue;
    counts.set(p.idea_id, (counts.get(p.idea_id) ?? 0) + 1);
    const existing = out.get(p.idea_id);
    if (existing) {
      existing.measurements = counts.get(p.idea_id) ?? 1;
      existing.promoted = existing.promoted || p.promoted_to_feed;
      continue;
    }
    out.set(p.idea_id, {
      ideaId: p.idea_id,
      measuredAt: p.measured_at,
      views: p.views,
      reach: p.reach,
      nonFollowerReach: p.non_follower_reach,
      comments: p.comments,
      saves: p.saves,
      shares: p.shares,
      promoted: p.promoted_to_feed,
      measurements: 1,
      verdict: evaluatePerformance({ views: p.views, reach: p.reach, nonFollowerReach: p.non_follower_reach, likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares }, base),
    });
  }
  return out;
}
