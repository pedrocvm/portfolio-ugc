/** A Auditoria: montar, gravar, ler e agir.
 *
 *  O trabalho (`content-audit`) corre uma vez por dia, depois do aprendizado:
 *  lê o que já está medido, avalia os testes, chama o motor determinístico e
 *  grava uma `content_audit_run` com as conclusões e as recomendações.
 *
 *  A tela nunca calcula nada disto. Abre a última corrida gravada. Foi essa a
 *  razão de existir da tabela: uma auditoria que se recalculasse a cada refresh
 *  seria dezenas de queries por abertura e dois números diferentes em dois
 *  separadores.
 *
 *  Três separações que este arquivo mantém:
 *
 *  - **coleta, cálculo e narrativa são coisas diferentes.** A coleta é o sync,
 *    e já correu. O cálculo é puro. A narrativa é a frase — e se falhar, as
 *    conclusões continuam entrando.
 *  - **falha parcial não derruba a corrida.** Cada bloco tem o seu try; o que
 *    falhou aparece em `failures` e a corrida fica `partial`.
 *  - **nada aqui fala com a Meta.** Se a integração estiver em baixo, a
 *    auditoria continua rodando sobre o histórico próprio.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import {
  AUDIT_ENGINE_VERSION,
  accountSeries,
  auditDelta,
  buildAudit,
  compareAccountWindows,
  emptyEvidence,
  periodRange,
  staleRecommendations,
  type AccountDay,
  type AccountPoint,
  type AuditConclusion,
  type AuditPeriod,
  type Evidence,
  type ExperimentInput,
  type PeriodRange,
  type RecommendationDraft,
  type RecommendationStatus,
} from './audit';
import { feedAudit, learningLadder, storyAudit, type FeedAuditView, type StoryAuditView } from './performance-service';
import { evaluateExperiments, listExperiments, createExperiment, type ExperimentRow } from './experiment-service';
import { isLadderState, type LadderState } from './learning';

type Client = ReturnType<typeof supabaseService>;
const client = async (c?: Client): Promise<Client> => c ?? ((await supabaseServer()) as unknown as Client);

/* ── Histórico diário da conta ────────────────────────────────────────────── */

const ACCOUNT_SNAP_SELECT =
  'observed_on, followers_count, follows_count, media_count, reach, views, accounts_engaged, total_interactions, profile_link_taps, likes, comments, shares, saves, replies';

type RawAccountSnap = {
  observed_on: string;
  followers_count: number | null;
  reach: number | null; views: number | null;
  accounts_engaged: number | null; total_interactions: number | null; profile_link_taps: number | null;
};

const toDay = (r: RawAccountSnap): AccountDay => ({
  observedOn: r.observed_on,
  followersCount: r.followers_count,
  reach: r.reach,
  views: r.views,
  accountsEngaged: r.accounts_engaged,
  totalInteractions: r.total_interactions,
  profileLinkTaps: r.profile_link_taps,
});

/** A série diária, com o delta de seguidores derivado do histórico próprio.
 *
 *  Lê um dia antes do início da janela de propósito: sem o dia anterior, o
 *  primeiro delta da janela era sempre `null` e o crescimento do primeiro dia
 *  desaparecia. */
export async function accountEvolution(
  range: PeriodRange,
  opts: { db?: Client } = {},
): Promise<{ current: AccountPoint[]; previous: AccountPoint[] }> {
  const db = await client(opts.db);
  const desde = range.previous?.from ?? range.from;

  let q = db.from('instagram_account_snapshot').select(ACCOUNT_SNAP_SELECT).eq('period', 'day').order('observed_on', { ascending: true }).limit(400);
  if (desde) q = q.gte('observed_on', new Date(new Date(desde).getTime() - 86_400_000).toISOString().slice(0, 10));
  const { data } = await q;

  const serie = accountSeries(((data ?? []) as unknown as RawAccountSnap[]).map(toDay));
  // O retrato da conta é diário; a janela também tem de ser. Comparar o dia
  // (meia-noite) com o instante da corrida (14:36) deixava o primeiro dia de
  // fora sempre que a auditoria não corria à meia-noite em ponto — e a janela
  // de «30 dias» media 29.
  const soDia = (iso: string) => iso.slice(0, 10);
  const dentro = (p: AccountPoint, from: string | null, to: string) =>
    (from === null || p.observedOn >= soDia(from)) && p.observedOn <= soDia(to);

  return {
    current: serie.filter((p) => dentro(p, range.from, range.to)),
    previous: range.previous ? serie.filter((p) => dentro(p, range.previous!.from, range.previous!.to)) : [],
  };
}

/* ── Saúde da ligação ─────────────────────────────────────────────────────── */

export const HEALTH_STATES = ['healthy', 'delayed', 'auth_required', 'rate_limited', 'provider_error', 'disconnected'] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export type ConnectionHealth = {
  state: HealthState;
  /** O que a Carol lê. Nunca token, versão da API, scope nem nome de trabalho. */
  line: string;
  username: string | null;
  lastSuccessAt: string | null;
  followersCount: number | null;
  mediaCount: number | null;
};

/** Quanto tempo sem sincronizar antes de a tela dizer que está atrasada.
 *  O sync corre de 30 em 30 minutos; três falhas seguidas já é atraso real. */
const DELAYED_AFTER_MS = 100 * 60_000;

const humanAgo = (iso: string | null, now: Date): string => {
  if (!iso) return 'ainda não sincronizou';
  const min = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return 'atualizado agora';
  if (min < 2) return 'atualizado agora';
  if (min < 60) return `atualizado há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `atualizado há ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.round(h / 24);
  return `atualizado há ${d} ${d === 1 ? 'dia' : 'dias'}`;
};

/** O estado técnico traduzido. Detalhe operacional vive em Definições. */
export async function connectionHealth(opts: { db?: Client; now?: Date } = {}): Promise<ConnectionHealth> {
  const db = await client(opts.db);
  const agora = opts.now ?? new Date();
  const { data } = await db
    .from('instagram_account')
    .select('username, status, last_success_at, last_error_code, followers_count, media_count')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { state: 'disconnected', line: 'O Instagram ainda não está ligado.', username: null, lastSuccessAt: null, followersCount: null, mediaCount: null };
  }

  const base = {
    username: data.username,
    lastSuccessAt: data.last_success_at,
    followersCount: data.followers_count,
    mediaCount: data.media_count,
  };

  if (data.status === 'revoked' || data.status === 'expired' || data.last_error_code === 'auth_revoked') {
    return { ...base, state: 'auth_required', line: 'É preciso reconectar o Instagram.' };
  }
  if (data.last_error_code === 'rate_limited') {
    return { ...base, state: 'rate_limited', line: 'O Instagram está limitando as leituras. Vou tentando; os dados voltam sozinhos.' };
  }
  const atrasado = !data.last_success_at || agora.getTime() - Date.parse(data.last_success_at) > DELAYED_AFTER_MS;
  if (data.status === 'error' || data.last_error_code) {
    return { ...base, state: 'provider_error', line: 'A última leitura do Instagram falhou. Vou tentar de novo automaticamente.' };
  }
  if (atrasado) {
    return { ...base, state: 'delayed', line: `A sincronização está atrasada — ${humanAgo(data.last_success_at, agora)}.` };
  }
  return { ...base, state: 'healthy', line: humanAgo(data.last_success_at, agora) };
}

/* ── Correr a auditoria ───────────────────────────────────────────────────── */

const LADDER_ACTIVE: readonly LadderState[] = ['signal', 'hypothesis', 'testing', 'validated'];

const toExperimentInput = (e: ExperimentRow): ExperimentInput => ({
  id: e.id,
  label: e.label,
  outcome: e.outcome,
  because: e.because,
  sampleSize: e.sampleSize,
  primaryMetric: e.primaryMetric,
  mediaIds: [...e.controlMediaIds, ...e.variantMediaIds],
});

export type AuditRunReport = {
  status: 'ok' | 'partial' | 'failed';
  period: AuditPeriod;
  conclusions: number;
  recommendationsWritten: number;
  recommendationsClosed: number;
  experimentsEvaluated: number;
  fresh: number;
  worthInterrupting: boolean;
  failures: string[];
  durationMs: number;
};

/** Monta e grava uma auditoria consolidada.
 *
 *  Idempotente pela chave natural `período + dia`: correr duas vezes no mesmo
 *  dia atualiza a mesma linha, e as recomendações são upsert por `dedupe_key`.
 *  Nada duplica. */
export async function runContentAudit(
  opts: { period?: AuditPeriod; now?: Date; db?: Client } = {},
): Promise<AuditRunReport> {
  const iniciou = Date.now();
  const db = await client(opts.db ?? supabaseService());
  const agora = opts.now ?? new Date();
  const period = opts.period ?? '30d';
  const range = periodRange(period, { now: agora });
  const falhas: string[] = [];

  const seguro = async <T>(nome: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      falhas.push(`${nome}: ${e instanceof Error ? e.message.slice(0, 160) : 'falha desconhecida'}`);
      return fallback;
    }
  };

  // Avaliar os testes primeiro: o resultado deles entra na auditoria.
  const testes = await seguro('testes', () => evaluateExperiments({ db }), { evaluated: 0, ready: 0, failures: [] as string[], rows: [] });
  falhas.push(...testes.failures);

  const [feed, historias, aprendizados, conta] = await Promise.all([
    seguro('feed', () => feedAudit(200, { db, since: range.from }), null as FeedAuditView | null),
    seguro('stories', () => storyAudit({ syncScheduled: true, db }), null as StoryAuditView | null),
    seguro('aprendizados', () => learningLadder(30, { db }), [] as Awaited<ReturnType<typeof learningLadder>>),
    seguro('conta', () => accountEvolution(range, { db }), { current: [], previous: [] }),
  ]);

  const todosTestes = testes.rows.length ? testes.rows : await seguro('testes/leitura', () => listExperiments({ db }), [] as ExperimentRow[]);

  const resultado = buildAudit({
    range,
    account: conta,
    feed: {
      points: feed?.summary ?? [],
      comparable: feed?.sample.comparable ?? 0,
      total: feed?.sample.total ?? 0,
    },
    stories: {
      points: historias?.guidance.lines ?? [],
      measuredSequences: historias?.sequences.filter((s) => s.metrics.measured > 0).length ?? 0,
    },
    learnings: aprendizados.map((l) => ({
      id: l.id,
      statement: l.statement,
      ladderState: isLadderState(l.ladderState) ? l.ladderState : 'observation',
      sampleSize: l.sampleSize,
      confidence: (l.confidence === 'high' || l.confidence === 'medium' ? l.confidence : 'low') as 'low' | 'medium' | 'high',
      evidenceIds: l.evidenceIds,
      derivedAt: l.derivedAt,
      contradictedAt: l.ladderState === 'rejected' ? l.derivedAt : null,
    })),
    experiments: todosTestes.map(toExperimentInput),
    now: agora,
  });

  // O que a corrida anterior tinha concluído. É daqui que sai «isto é novo».
  const { data: anterior } = await db
    .from('content_audit_run')
    .select('conclusion_keys')
    .eq('period', period)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const delta = auditDelta(anterior?.conclusion_keys ?? [], resultado);

  const dedupeKey = `${period}:${agora.toISOString().slice(0, 10)}`;
  const abertas = await openRecommendations({ db });

  const { data: corrida, error: erroCorrida } = await db
    .from('content_audit_run')
    .upsert(
      {
        dedupe_key: dedupeKey,
        period,
        window_from: range.from,
        window_to: range.to,
        previous_from: range.previous?.from ?? null,
        previous_to: range.previous?.to ?? null,
        conclusions: asJson(resultado.conclusions),
        conclusion_keys: resultado.conclusions.map((c) => c.key),
        coverage: resultado.coverage,
        media_considered: feed?.sample.total ?? 0,
        comparable_media: feed?.sample.comparable ?? 0,
        learnings_active: aprendizados.filter((l) => isLadderState(l.ladderState) && LADDER_ACTIVE.includes(l.ladderState)).length,
        recommendations_open: resultado.recommendations.length,
        engine_version: AUDIT_ENGINE_VERSION,
        status: falhas.length ? 'partial' : 'ok',
        failures: falhas.slice(0, 20),
        duration_ms: Date.now() - iniciou,
      },
      { onConflict: 'dedupe_key' },
    )
    .select('id')
    .single();

  if (erroCorrida) falhas.push(`auditoria: ${erroCorrida.message.slice(0, 160)}`);

  const escritas = await seguro(
    'recomendações',
    () => persistRecommendations(resultado.recommendations, corrida?.id ?? null, { db }),
    0,
  );
  const encerradas = await seguro(
    'recomendações obsoletas',
    () => closeStale(abertas, resultado.recommendations, aprendizados, todosTestes, { db }),
    0,
  );

  return {
    status: erroCorrida ? 'failed' : falhas.length ? 'partial' : 'ok',
    period,
    conclusions: resultado.conclusions.length,
    recommendationsWritten: escritas,
    recommendationsClosed: encerradas,
    experimentsEvaluated: testes.evaluated,
    fresh: delta.fresh.length,
    worthInterrupting: delta.worthInterrupting,
    failures: falhas,
    durationMs: Date.now() - iniciou,
  };
}

/* ── Recomendações ────────────────────────────────────────────────────────── */

export type RecommendationRow = {
  id: string;
  dedupeKey: string;
  kind: string;
  statement: string;
  because: string;
  status: RecommendationStatus;
  closedBecause: string | null;
  sampleSize: number;
  confidence: 'low' | 'medium' | 'high';
  evidence: Evidence;
  testDraft: RecommendationDraft['testDraft'];
  experimentId: string | null;
  feedback: 'useful' | 'not_useful' | null;
  createdAt: string;
};

const REC_SELECT =
  'id, dedupe_key, kind, statement, because, status, closed_because, sample_size, confidence, evidence, test_draft, experiment_id, feedback, created_at';

type RawRec = {
  id: string; dedupe_key: string; kind: string; statement: string; because: string; status: string;
  closed_because: string | null; sample_size: number; confidence: string; evidence: unknown;
  test_draft: unknown; experiment_id: string | null; feedback: string | null; created_at: string;
};

const toEvidence = (v: unknown): Evidence => {
  const e = (v ?? {}) as Partial<Record<keyof Evidence, unknown>>;
  const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : []);
  return {
    mediaIds: arr(e.mediaIds),
    learningIds: arr(e.learningIds),
    experimentIds: arr(e.experimentIds),
    sequenceIds: arr(e.sequenceIds),
  };
};

const toRec = (r: RawRec): RecommendationRow => ({
  id: r.id,
  dedupeKey: r.dedupe_key,
  kind: r.kind,
  statement: r.statement,
  because: r.because,
  status: r.status as RecommendationStatus,
  closedBecause: r.closed_because,
  sampleSize: r.sample_size,
  confidence: (r.confidence === 'high' || r.confidence === 'medium' ? r.confidence : 'low'),
  evidence: toEvidence(r.evidence),
  testDraft: (r.test_draft ?? null) as RecommendationDraft['testDraft'],
  experimentId: r.experiment_id,
  feedback: (r.feedback === 'useful' || r.feedback === 'not_useful' ? r.feedback : null),
  createdAt: r.created_at,
});

export async function openRecommendations(opts: { db?: Client; limit?: number } = {}): Promise<RecommendationRow[]> {
  const db = await client(opts.db);
  const { data } = await db
    .from('content_recommendation')
    .select(REC_SELECT)
    .eq('status', 'open')
    .order('confidence', { ascending: false })
    .order('sample_size', { ascending: false })
    .limit(opts.limit ?? 12);
  return ((data ?? []) as unknown as RawRec[]).map(toRec);
}

/** Grava as recomendações da corrida. Upsert por `dedupe_key`: a mesma
 *  recomendação sobre a mesma evidência é a mesma linha.
 *
 *  Uma que ela já executou ou guardou não volta a abrir — seria o sistema a
 *  insistir depois de ela ter decidido. */
async function persistRecommendations(
  drafts: readonly RecommendationDraft[],
  auditRunId: string | null,
  opts: { db?: Client } = {},
): Promise<number> {
  if (!drafts.length) return 0;
  const db = await client(opts.db);

  const { data: existentes } = await db
    .from('content_recommendation')
    .select('dedupe_key, status')
    .in('dedupe_key', drafts.map((d) => d.dedupeKey));
  const decidida = new Set(
    (existentes ?? []).filter((r) => r.status === 'executed' || r.status === 'dismissed').map((r) => r.dedupe_key),
  );

  const linhas = drafts
    .filter((d) => !decidida.has(d.dedupeKey))
    // A tabela recusa uma recomendação sem evidência; filtrar aqui evita que
    // uma delas rebente o lote inteiro.
    .filter((d) => d.evidence.mediaIds.length || d.evidence.learningIds.length || d.evidence.experimentIds.length || d.evidence.sequenceIds.length)
    .map((d) => ({
      dedupe_key: d.dedupeKey,
      kind: d.kind,
      statement: d.statement,
      because: d.because,
      status: 'open' as const,
      closed_because: null,
      closed_at: null,
      sample_size: d.sampleSize,
      confidence: d.confidence,
      evidence: asJson(d.evidence),
      test_draft: d.testDraft ? asJson(d.testDraft) : null,
      audit_run_id: auditRunId,
      engine_version: d.engineVersion,
    }));

  if (!linhas.length) return 0;
  const { error } = await db.from('content_recommendation').upsert(linhas, { onConflict: 'dedupe_key' });
  if (error) throw new Error(error.message);
  return linhas.length;
}

/** Encerra o que os dados novos deixaram de pedir. */
async function closeStale(
  abertas: readonly RecommendationRow[],
  fresh: readonly RecommendationDraft[],
  learnings: readonly { id: string; ladderState: string }[],
  experiments: readonly ExperimentRow[],
  opts: { db?: Client } = {},
): Promise<number> {
  if (!abertas.length) return 0;
  const db = await client(opts.db);

  const vivos = {
    learningIds: new Set(learnings.filter((l) => l.ladderState !== 'rejected').map((l) => l.id)),
    experimentIds: new Set(experiments.map((e) => e.id)),
  };
  const mortas = staleRecommendations(abertas.map((r) => ({ dedupeKey: r.dedupeKey, evidence: r.evidence })), fresh, vivos);
  if (!mortas.length) return 0;

  const agora = new Date().toISOString();
  for (const m of mortas) {
    await db
      .from('content_recommendation')
      .update({ status: m.status, closed_because: m.because, closed_at: agora })
      .eq('dedupe_key', m.dedupeKey)
      .eq('status', 'open');
  }
  return mortas.length;
}

/* ── Ações ────────────────────────────────────────────────────────────────── */

/** «Criar teste»: a hipótese já vem preenchida.
 *
 *  A Carol não devia começar numa tela vazia. O rascunho vem do motor
 *  determinístico, com a variável, o controlo, a variante e a métrica que a
 *  evidência sugere. Ela aprova ou ajusta. */
export async function createTestFromRecommendation(
  recommendationId: string,
  opts: { db?: Client; overrides?: Partial<NonNullable<RecommendationDraft['testDraft']>> & { label?: string } } = {},
): Promise<{ ok: true; experimentId: string } | { error: string }> {
  const db = await client(opts.db);
  const { data } = await db.from('content_recommendation').select(REC_SELECT).eq('id', recommendationId).maybeSingle();
  if (!data) return { error: 'Essa recomendação já não existe.' };
  const rec = toRec(data as unknown as RawRec);
  if (rec.experimentId) return { ok: true, experimentId: rec.experimentId };

  const draft = { ...(rec.testDraft ?? null), ...opts.overrides } as Partial<NonNullable<RecommendationDraft['testDraft']>> & { label?: string };
  if (!draft.hypothesis || !draft.variable) {
    return { error: 'Essa recomendação não traz hipótese suficiente para virar teste. Dá para criar um teste à mão.' };
  }

  const criado = await createExperiment(
    {
      label: draft.label ?? draft.hypothesis.slice(0, 70),
      hypothesis: draft.hypothesis,
      variable: draft.variable,
      controlLabel: draft.control ?? 'como costuma fazer',
      variantLabel: draft.variant ?? 'a mudança a testar',
      primaryMetric: draft.primaryMetric,
      secondaryMetrics: draft.secondaryMetrics,
      origin: 'recommendation',
      recommendationId: rec.id,
    },
    { db },
  );
  if ('error' in criado) return criado;

  await db
    .from('content_recommendation')
    .update({ status: 'executed', experiment_id: criado.id, closed_because: 'Virou teste.', closed_at: new Date().toISOString() })
    .eq('id', rec.id);

  return { ok: true, experimentId: criado.id };
}

/** «Salvar para depois» e «Não foi útil».
 *
 *  O feedback só afeta prioridade e texto. Uma rejeição humana nunca apaga
 *  histórico: os dados que a sustentavam continuam lá, e a recomendação fica
 *  registrada como recusada. */
export async function respondToRecommendation(
  input: { id: string; response: 'dismiss' | 'not_useful' | 'useful' },
  opts: { db?: Client } = {},
): Promise<{ ok: true } | { error: string }> {
  const db = await client(opts.db);
  const agora = new Date().toISOString();

  const patch =
    input.response === 'useful'
      ? { feedback: 'useful' as const, feedback_at: agora }
      : input.response === 'not_useful'
        ? { feedback: 'not_useful' as const, feedback_at: agora, status: 'dismissed' as const, closed_because: 'Ela disse que não era útil.', closed_at: agora }
        : { status: 'dismissed' as const, closed_because: 'Salva para depois.', closed_at: agora };

  const { error } = await db.from('content_recommendation').update(patch).eq('id', input.id);
  return error ? { error: error.message.slice(0, 200) } : { ok: true };
}

/* ── Evidências ───────────────────────────────────────────────────────────── */

export type EvidenceItem = {
  mediaId: string;
  title: string;
  publishedAt: string;
  permalink: string | null;
  mediaProductType: string;
};

export type EvidencePack = {
  statement: string;
  because: string;
  sample: string;
  pieces: EvidenceItem[];
  learnings: { id: string; statement: string; ladderState: string; sampleSize: number }[];
  experiments: { id: string; label: string; outcomeLabel: string; because: string }[];
  sequences: { id: string; label: string; startedAt: string; storyCount: number }[];
};

/** O que sustenta uma conclusão ou recomendação. É o que abre em «Ver
 *  evidências», e existe para nenhuma frase ser um ato de fé. */
export async function evidenceFor(
  input: { statement: string; because?: string; sample?: string; evidence: Evidence },
  opts: { db?: Client } = {},
): Promise<EvidencePack> {
  const db = await client(opts.db);
  const e = input.evidence;

  const [pecas, aprendizados, testes, sequencias] = await Promise.all([
    e.mediaIds.length
      ? db.from('instagram_media').select('id, caption, published_at, permalink, media_product_type, creator_story(title)').in('id', e.mediaIds.slice(0, 40))
      : Promise.resolve({ data: [] }),
    e.learningIds.length
      ? db.from('content_learning').select('id, statement, ladder_state, sample_size').in('id', e.learningIds.slice(0, 20))
      : Promise.resolve({ data: [] }),
    e.experimentIds.length
      ? db.from('content_experiment').select('id, label, verdict, result').in('id', e.experimentIds.slice(0, 20))
      : Promise.resolve({ data: [] }),
    e.sequenceIds.length
      ? db.from('instagram_story_sequence').select('id, label, started_at, story_count').in('id', e.sequenceIds.slice(0, 20))
      : Promise.resolve({ data: [] }),
  ]);

  type RawPiece = { id: string; caption: string; published_at: string; permalink: string | null; media_product_type: string; creator_story: { title?: string } | null };

  return {
    statement: input.statement,
    because: input.because ?? '',
    sample: input.sample ?? '',
    pieces: ((pecas.data ?? []) as unknown as RawPiece[])
      .map((m) => ({
        mediaId: m.id,
        title: m.creator_story?.title || m.caption.split('\n')[0].slice(0, 70) || 'Sem legenda',
        publishedAt: m.published_at,
        permalink: m.permalink,
        mediaProductType: m.media_product_type,
      }))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    learnings: ((aprendizados.data ?? []) as { id: string; statement: string; ladder_state: string; sample_size: number }[]).map((l) => ({
      id: l.id, statement: l.statement, ladderState: l.ladder_state, sampleSize: l.sample_size,
    })),
    experiments: ((testes.data ?? []) as { id: string; label: string; verdict: unknown; result: string | null }[]).map((x) => {
      const v = (x.verdict ?? {}) as { outcome?: string; because?: string };
      return {
        id: x.id,
        label: x.label,
        outcomeLabel: v.outcome ?? 'pendente',
        because: v.because ?? x.result ?? '',
      };
    }),
    sequences: ((sequencias.data ?? []) as { id: string; label: string; started_at: string; story_count: number }[])
      .map((q) => ({ id: q.id, label: q.label || 'Sequência', startedAt: q.started_at, storyCount: q.story_count }))
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)),
  };
}

/* ── A tela ───────────────────────────────────────────────────────────────── */

export type AuditScreen = {
  health: ConnectionHealth;
  period: AuditPeriod;
  range: PeriodRange;
  /** `null` quando nenhuma auditoria correu ainda. A tela diz isso; não
   *  inventa uma auditoria na hora, que seria um número diferente por refresh. */
  run: {
    id: string;
    conclusions: AuditConclusion[];
    coverage: string;
    generatedAt: string;
    mediaConsidered: number;
    comparableMedia: number;
    engineVersion: string;
  } | null;
  nextTest: RecommendationRow | null;
  recommendations: RecommendationRow[];
  experiments: ExperimentRow[];
  evolution: { current: AccountPoint[]; previous: AccountPoint[] };
  movements: ReturnType<typeof compareAccountWindows>;
};

/** Tudo o que a Auditoria mostra, numa passagem, a partir do que está gravado.
 *
 *  Nenhuma chamada à Meta. A tela abre mesmo com a integração em baixo — e é
 *  isso que a torna utilizável no dia em que a API falha. */
export async function auditScreen(
  opts: { period?: AuditPeriod; now?: Date; from?: string | null; to?: string | null; db?: Client } = {},
): Promise<AuditScreen> {
  const db = await client(opts.db);
  const period = opts.period ?? '30d';
  const range = periodRange(period, { now: opts.now, from: opts.from, to: opts.to });

  const [health, corrida, recomendacoes, testes, evolucao] = await Promise.all([
    connectionHealth({ db, now: opts.now }),
    db
      .from('content_audit_run')
      .select('id, conclusions, coverage, created_at, media_considered, comparable_media, engine_version')
      .eq('period', period)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    openRecommendations({ db }),
    listExperiments({ db, limit: 20 }),
    accountEvolution(range, { db }),
  ]);

  const run = corrida.data
    ? {
        id: corrida.data.id,
        conclusions: (corrida.data.conclusions ?? []) as unknown as AuditConclusion[],
        coverage: corrida.data.coverage,
        generatedAt: corrida.data.created_at,
        mediaConsidered: corrida.data.media_considered,
        comparableMedia: corrida.data.comparable_media,
        engineVersion: corrida.data.engine_version,
      }
    : null;

  return {
    health,
    period,
    range,
    run,
    nextTest: recomendacoes[0] ?? null,
    recommendations: recomendacoes,
    experiments: testes,
    evolution: evolucao,
    movements: compareAccountWindows(evolucao.current, evolucao.previous),
  };
}

/* ── O que o Content Brain consulta ───────────────────────────────────────── */

export type BrainContext = {
  /** O bloco de texto que entra no prompt. Vazio quando não há nada validado
   *  — e nesse caso o prompt não recebe secção nenhuma, em vez de receber
   *  «ainda não sabemos», que o modelo leria como instrução. */
  text: string;
  learningIds: string[];
  recommendationIds: string[];
  experimentIds: string[];
};

/** O que os dados dela já ensinaram, para o Content Brain consultar antes de
 *  estruturar conteúdo novo.
 *
 *  Duas regras que isto respeita, e que são a diferença entre memória e
 *  prisão criativa:
 *
 *  - **só o validado pesa.** Uma hipótese entra como «vale testar», nunca como
 *    «faz assim». É a mesma escada da tela.
 *  - **o que já se repetiu demais entra como saturação**, não como receita. Um
 *    perfil que repete eternamente o formato vencedor é o fracasso desta
 *    feature, não o sucesso. */
export async function brainContext(opts: { db?: Client; limit?: number } = {}): Promise<BrainContext> {
  const db = await client(opts.db);
  const limite = opts.limit ?? 4;

  const [aprendizados, recomendacoes, testes] = await Promise.all([
    db
      .from('content_learning')
      .select('id, statement, ladder_state, sample_size')
      .eq('active', true)
      .in('ladder_state', ['validated', 'hypothesis'])
      .order('sample_size', { ascending: false })
      .limit(limite * 2),
    openRecommendations({ db, limit: limite }),
    db
      .from('content_experiment')
      .select('id, label, hypothesis')
      .in('status', ['running', 'measured'])
      .order('updated_at', { ascending: false })
      .limit(limite),
  ]);

  const linhas = aprendizados.data ?? [];
  const validados = linhas.filter((l) => l.ladder_state === 'validated').slice(0, limite);
  const hipoteses = linhas.filter((l) => l.ladder_state === 'hypothesis').slice(0, limite);
  const emTeste = testes.data ?? [];

  const partes: string[] = [];
  if (validados.length) {
    partes.push(
      ['O que os números dela já sustentam (pesa na decisão, nunca substitui o que ela viveu):',
        ...validados.map((l) => `- ${l.statement} (${l.sample_size} ${l.sample_size === 1 ? 'conteúdo' : 'conteúdos'})`),
      ].join('\n'),
    );
  }
  if (hipoteses.length) {
    partes.push(
      ['Hipóteses abertas (valem um teste, NÃO valem uma regra):',
        ...hipoteses.map((l) => `- ${l.statement} (${l.sample_size} ${l.sample_size === 1 ? 'conteúdo' : 'conteúdos'})`),
      ].join('\n'),
    );
  }
  if (emTeste.length) {
    partes.push(
      ['Testes correndo agora (evite repetir a mesma variável enquanto não fecham):',
        ...emTeste.map((e) => `- ${e.label}${e.hypothesis ? `: ${e.hypothesis}` : ''}`),
      ].join('\n'),
    );
  }

  return {
    text: partes.join('\n\n'),
    learningIds: [...validados, ...hipoteses].map((l) => l.id),
    recommendationIds: recomendacoes.map((r) => r.id),
    experimentIds: emTeste.map((e) => e.id),
  };
}

/** O que a Auditoria encontrou de novo e que muda uma decisão.
 *
 *  Serve o Hoje e a Carol AI. Uma flutuação de conta não passa por aqui: só
 *  aprendizado novo, teste com resultado ou padrão contradito. */
export async function auditHighlight(opts: { db?: Client; period?: AuditPeriod } = {}): Promise<{
  conclusion: AuditConclusion;
  runId: string;
} | null> {
  const db = await client(opts.db);
  // O período tem de ser o mesmo nas duas corridas. Sem este filtro, a de 30
  // dias comparava-se com a de 90 e TUDO parecia novo — o Hoje passaria a
  // interromper todos os dias, que é exatamente o que não pode acontecer.
  const { data } = await db
    .from('content_audit_run')
    .select('id, conclusions, conclusion_keys, created_at')
    .eq('period', opts.period ?? '30d')
    .order('created_at', { ascending: false })
    .limit(2);

  const linhas = data ?? [];
  if (!linhas.length) return null;
  const atual = linhas[0];
  const antes = new Set<string>(linhas[1]?.conclusion_keys ?? []);
  const conclusoes = (atual.conclusions ?? []) as unknown as AuditConclusion[];

  const nova = conclusoes.find(
    (c) => !antes.has(c.key) && (c.bucket === 'learned' || c.bucket === 'attention') && c.sampleSize >= 3 && c.confidence !== 'low',
  );
  return nova ? { conclusion: nova, runId: atual.id } : null;
}

export { emptyEvidence };
