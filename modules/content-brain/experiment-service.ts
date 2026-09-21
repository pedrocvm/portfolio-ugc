/** Testes de conteúdo: criar, associar mídia, avaliar.
 *
 *  A verdade sobre um teste é do CarolOS, nunca da Meta. A API testada não
 *  distingue um Trial Reel (`is_trial` não existe, e `is_shared_to_feed=false`
 *  aparece em Reels normais), por isso a relação entre uma peça e um braço de
 *  teste vive aqui: nasce de uma associação explícita, ou de uma reconciliação
 *  de alta confiança entre o que foi planeado e o que apareceu.
 *
 *  O que este serviço protege:
 *
 *  - nenhum teste muda de estado sozinho para `learned`: isso é decisão dela;
 *  - a avaliação é o domínio puro (`experiments.ts`) — aqui só se lê e grava;
 *  - uma mídia pertence a um braço, ou a nenhum. Nunca aos dois.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import {
  EXPERIMENT_POLICY_V1,
  OUTCOME_LABEL,
  experimentReady,
  experimentVerdict,
  statusAfter,
  type Arm,
  type ExperimentOutcome,
  type ExperimentStatus,
  type ExperimentVerdict,
} from './experiments';
import type { SnapshotKind } from './metrics';

type Client = ReturnType<typeof supabaseService>;
const client = async (c?: Client): Promise<Client> => c ?? ((await supabaseServer()) as unknown as Client);

/** As métricas que um snapshot de mídia grava em coluna. `raw_metrics` tem
 *  mais, mas só estas são indexáveis e comparáveis sem abrir o jsonb. */
export const EXPERIMENT_METRICS = [
  'views', 'reach', 'likes', 'comments', 'saves', 'shares', 'follows',
  'total_interactions', 'replies', 'navigation', 'profile_activity', 'avg_watch_time_seconds',
] as const;

export const DEFAULT_PRIMARY_METRIC = 'shares';

const SNAP_SELECT =
  'media_id, snapshot_kind, views, reach, likes, comments, saves, shares, follows, total_interactions, replies, navigation, profile_activity, avg_watch_time_seconds';

type SnapRow = Record<string, string | number | null> & { media_id: string; snapshot_kind: string };

const num = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined ? null : typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : null;

/* ── Leitura ──────────────────────────────────────────────────────────────── */

export type ExperimentRow = {
  id: string;
  kind: string;
  label: string;
  hypothesis: string;
  whatWeTest: string;
  variable: string | null;
  controlLabel: string;
  variantLabel: string;
  primaryMetric: string;
  secondaryMetrics: string[];
  higherIsBetter: boolean;
  status: ExperimentStatus;
  origin: string;
  controlMediaIds: string[];
  variantMediaIds: string[];
  sampleSize: number;
  outcome: ExperimentOutcome;
  outcomeLabel: string;
  because: string;
  result: string | null;
  learning: string | null;
  startedAt: string | null;
  endedAt: string | null;
  evaluatedAt: string | null;
  recommendationId: string | null;
};

const EXPERIMENT_SELECT =
  'id, kind, label, hypothesis, what_we_test, variable, control_label, variant_label, primary_metric, secondary_metrics, higher_is_better, status, origin, control_media_ids, variant_media_ids, sample_size, result, learning, started_at, ended_at, evaluated_at, recommendation_id, verdict';

type RawExperiment = {
  id: string; kind: string; label: string; hypothesis: string; what_we_test: string;
  variable: string | null; control_label: string | null; variant_label: string | null;
  primary_metric: string | null; secondary_metrics: string[] | null; higher_is_better: boolean | null;
  status: string; origin: string | null; control_media_ids: string[] | null; variant_media_ids: string[] | null;
  sample_size: number; result: string | null; learning: string | null;
  started_at: string | null; ended_at: string | null; evaluated_at: string | null;
  recommendation_id: string | null; verdict: unknown;
};

const toRow = (e: RawExperiment): ExperimentRow => {
  const v = (e.verdict ?? {}) as Partial<ExperimentVerdict>;
  const outcome = (v.outcome ?? 'pending') as ExperimentOutcome;
  return {
    id: e.id,
    kind: e.kind,
    label: e.label,
    hypothesis: e.hypothesis,
    whatWeTest: e.what_we_test,
    variable: e.variable,
    controlLabel: e.control_label || 'controlo',
    variantLabel: e.variant_label || 'variante',
    primaryMetric: e.primary_metric || DEFAULT_PRIMARY_METRIC,
    secondaryMetrics: e.secondary_metrics ?? [],
    higherIsBetter: e.higher_is_better ?? true,
    status: e.status as ExperimentStatus,
    origin: e.origin ?? 'mentor_session',
    controlMediaIds: e.control_media_ids ?? [],
    variantMediaIds: e.variant_media_ids ?? [],
    sampleSize: e.sample_size,
    outcome,
    outcomeLabel: OUTCOME_LABEL[outcome],
    because: v.because ?? '',
    result: e.result,
    learning: e.learning,
    startedAt: e.started_at,
    endedAt: e.ended_at,
    evaluatedAt: e.evaluated_at,
    recommendationId: e.recommendation_id,
  };
};

export async function listExperiments(opts: { limit?: number; db?: Client } = {}): Promise<ExperimentRow[]> {
  const db = await client(opts.db);
  const { data } = await db
    .from('content_experiment')
    .select(EXPERIMENT_SELECT)
    .order('updated_at', { ascending: false })
    .limit(opts.limit ?? 40);
  return ((data ?? []) as unknown as RawExperiment[]).map(toRow);
}

export async function getExperiment(id: string, opts: { db?: Client } = {}): Promise<ExperimentRow | null> {
  const db = await client(opts.db);
  const { data } = await db.from('content_experiment').select(EXPERIMENT_SELECT).eq('id', id).maybeSingle();
  return data ? toRow(data as unknown as RawExperiment) : null;
}

/* ── Criar ────────────────────────────────────────────────────────────────── */

/** Um `kind` único e legível.
 *
 *  A tabela tem `unique (kind)` desde a mentoria e dois upserts em produção
 *  dependem dela. Um teste novo nasce com chave própria em vez de forçar uma
 *  migração de constraint — que partiria esses upserts. */
function experimentKind(label: string, at: Date): string {
  const slug = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'teste';
  return `exp:${slug}:${at.toISOString().slice(0, 10)}:${at.getTime().toString(36).slice(-5)}`;
}

export type NewExperiment = {
  label: string;
  hypothesis: string;
  variable: string;
  controlLabel: string;
  variantLabel: string;
  primaryMetric?: string;
  secondaryMetrics?: string[];
  higherIsBetter?: boolean;
  origin?: 'recommendation' | 'carol';
  recommendationId?: string | null;
};

export async function createExperiment(
  input: NewExperiment,
  opts: { db?: Client; now?: Date } = {},
): Promise<{ ok: true; id: string } | { error: string }> {
  const db = await client(opts.db);
  const agora = opts.now ?? new Date();

  const { data, error } = await db
    .from('content_experiment')
    .insert({
      kind: experimentKind(input.label, agora),
      label: input.label,
      hypothesis: input.hypothesis,
      what_we_test: input.variable,
      variable: input.variable,
      control_label: input.controlLabel,
      variant_label: input.variantLabel,
      primary_metric: input.primaryMetric ?? DEFAULT_PRIMARY_METRIC,
      secondary_metrics: input.secondaryMetrics ?? [],
      higher_is_better: input.higherIsBetter ?? true,
      status: 'planned',
      origin: input.origin ?? 'carol',
      recommendation_id: input.recommendationId ?? null,
      source: 'carolos',
      policy_version: EXPERIMENT_POLICY_V1.version,
    })
    .select('id')
    .single();

  if (error || !data) return { error: error?.message.slice(0, 200) ?? 'Não consegui criar o teste.' };
  return { ok: true, id: data.id };
}

/* ── Associar mídia a um braço ────────────────────────────────────────────── */

/** Liga uma peça a um braço. Idempotente: repetir não duplica, e mudar de
 *  braço remove-a do outro — uma peça nunca conta dos dois lados. */
export async function attachMedia(
  input: { experimentId: string; mediaId: string; arm: 'control' | 'variant' },
  opts: { db?: Client } = {},
): Promise<{ ok: true } | { error: string }> {
  const db = await client(opts.db);
  const exp = await getExperiment(input.experimentId, { db });
  if (!exp) return { error: 'Esse teste não existe.' };

  const control = new Set(exp.controlMediaIds);
  const variant = new Set(exp.variantMediaIds);
  control.delete(input.mediaId);
  variant.delete(input.mediaId);
  (input.arm === 'control' ? control : variant).add(input.mediaId);

  const { error } = await db
    .from('content_experiment')
    .update({
      control_media_ids: [...control],
      variant_media_ids: [...variant],
      sample_size: control.size + variant.size,
      status: exp.status === 'planned' ? 'running' : exp.status,
      started_at: exp.startedAt ?? new Date().toISOString(),
    })
    .eq('id', input.experimentId);
  if (error) return { error: error.message.slice(0, 200) };

  // A mídia também sabe. Serve a ficha da peça e a reconciliação do sync.
  await db
    .from('instagram_media')
    .update({ experiment_id: input.experimentId, experiment_arm: input.arm })
    .eq('id', input.mediaId);

  return { ok: true };
}

export async function detachMedia(mediaId: string, opts: { db?: Client } = {}): Promise<void> {
  const db = await client(opts.db);
  const { data } = await db.from('instagram_media').select('experiment_id').eq('id', mediaId).maybeSingle();
  const expId = data?.experiment_id;
  await db.from('instagram_media').update({ experiment_id: null, experiment_arm: null }).eq('id', mediaId);
  if (!expId) return;

  const exp = await getExperiment(expId, { db });
  if (!exp) return;
  const control = exp.controlMediaIds.filter((x) => x !== mediaId);
  const variant = exp.variantMediaIds.filter((x) => x !== mediaId);
  await db
    .from('content_experiment')
    .update({ control_media_ids: control, variant_media_ids: variant, sample_size: control.length + variant.length })
    .eq('id', expId);
}

/* ── Avaliar ──────────────────────────────────────────────────────────────── */

async function armsFor(
  exp: ExperimentRow,
  db: Client,
): Promise<{ control: Arm; variant: Arm }> {
  const ids = [...exp.controlMediaIds, ...exp.variantMediaIds];
  if (!ids.length) {
    return { control: { label: exp.controlLabel, readings: [] }, variant: { label: exp.variantLabel, readings: [] } };
  }

  const { data } = await db.from('instagram_media_snapshot').select(SNAP_SELECT).in('media_id', ids);
  const linhas = (data ?? []) as unknown as SnapRow[];

  const leituras = (mediaIds: readonly string[]) => {
    const meus = new Set(mediaIds);
    return linhas
      .filter((r) => meus.has(r.media_id))
      .map((r) => ({
        mediaId: r.media_id,
        snapshotKind: r.snapshot_kind as SnapshotKind,
        metrics: Object.fromEntries(EXPERIMENT_METRICS.map((m) => [m, num(r[m])])) as Record<string, number | null>,
      }));
  };

  return {
    control: { label: exp.controlLabel, readings: leituras(exp.controlMediaIds) },
    variant: { label: exp.variantLabel, readings: leituras(exp.variantMediaIds) },
  };
}

export async function evaluateExperiment(
  exp: ExperimentRow,
  opts: { db?: Client } = {},
): Promise<ExperimentVerdict> {
  const db = await client(opts.db);
  const { control, variant } = await armsFor(exp, db);
  return experimentVerdict({
    control,
    variant,
    primaryMetric: exp.primaryMetric,
    secondaryMetrics: exp.secondaryMetrics,
    higherIsBetter: exp.higherIsBetter,
  });
}

/** Avalia todos os testes com braços. Corre no trabalho da auditoria.
 *
 *  Falha parcial: um teste que rebenta não impede os outros de serem
 *  avaliados, e o que rebentou aparece em `failures`. */
export async function evaluateExperiments(opts: { db?: Client } = {}): Promise<{
  evaluated: number;
  ready: number;
  failures: string[];
  rows: (ExperimentRow & { verdict: ExperimentVerdict })[];
}> {
  const db = await client(opts.db ?? supabaseService());
  const todos = await listExperiments({ limit: 60, db });
  const falhas: string[] = [];
  const rows: (ExperimentRow & { verdict: ExperimentVerdict })[] = [];
  let prontos = 0;

  for (const exp of todos) {
    if (!exp.controlMediaIds.length && !exp.variantMediaIds.length) continue;
    try {
      const verdict = await evaluateExperiment(exp, { db });
      const status = statusAfter(exp.status, verdict);
      if (experimentReady(verdict)) prontos += 1;

      const { error } = await db
        .from('content_experiment')
        .update({
          verdict: asJson(verdict),
          status,
          sample_size: verdict.sampleSize,
          evaluated_at: new Date().toISOString(),
          policy_version: verdict.policyVersion,
          result: verdict.outcome === 'pending' ? null : verdict.because,
        })
        .eq('id', exp.id);
      if (error) falhas.push(`teste ${exp.label}: ${error.message.slice(0, 140)}`);
      else rows.push({ ...exp, status, outcome: verdict.outcome, outcomeLabel: OUTCOME_LABEL[verdict.outcome], because: verdict.because, sampleSize: verdict.sampleSize, verdict });
    } catch (e) {
      falhas.push(`teste ${exp.label}: ${e instanceof Error ? e.message.slice(0, 140) : 'falha desconhecida'}`);
    }
  }

  return { evaluated: rows.length, ready: prontos, failures: falhas, rows };
}

/** Fechar é decisão dela, como fechar e perder uma oportunidade. */
export async function concludeExperiment(
  input: { id: string; learning: string; status?: Extract<ExperimentStatus, 'learned' | 'paused'> },
  opts: { db?: Client } = {},
): Promise<{ ok: true } | { error: string }> {
  const db = await client(opts.db);
  const { error } = await db
    .from('content_experiment')
    .update({
      status: input.status ?? 'learned',
      learning: input.learning,
      ended_at: new Date().toISOString(),
    })
    .eq('id', input.id);
  return error ? { error: error.message.slice(0, 200) } : { ok: true };
}
