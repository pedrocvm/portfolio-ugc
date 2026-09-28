/** A Semana: correr o Motor de Prioridades, gravar as propostas, e as três
 *  ações dela — aprovar, ajustar, trocar.
 *
 *  O motor é puro e vive em `priority.ts`. Este ficheiro só faz três coisas:
 *  junta as entradas reais, grava o resultado, e recusa gravar o que viola um
 *  guardrail. A decisão de qual proposta entra nunca acontece aqui.
 *
 *  A semana não se recalcula a cada abertura da tela. Nasce uma vez — pelo
 *  trabalho de segunda de manhã, ou pelo primeiro pedido da semana — e fica.
 *  Recalcular por trás dela trocaria propostas que ela já estava a ler.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { strategyClient, type ContentProposalRow, type StrategyClient } from '@/lib/supabase/strategy';
import {
  FORMAT_LABEL,
  LENS_LABEL,
  MODALITY_LABEL,
  OBJECTIVE_LABEL,
  PILLAR_SHORT,
  STRUCTURE_LABEL,
  isFormat,
  isLens,
  isModality,
  isObjective,
  isPillar,
  isStructure,
  isTopicState,
  type Format,
  type Lens,
  type Modality,
  type Objective,
  type Pillar,
  type Structure,
} from './editorial';
import { dnaFromMedia } from './format-dna';
import { influencesPlanning, isLadderState } from './learning';
import {
  LIVE_STATUSES,
  STATUS_LABEL,
  STATUS_MEANS,
  canTransition,
  isProposalStatus,
  type ProposalStatus,
} from './pipeline';
import {
  buildWeek,
  guardrailBreaches,
  type ActiveLearning,
  type Evidence,
  type FormatGap,
  type PriorityInput,
  type ProposalDraft,
  type PublishedPiece,
  type RealEvent,
  type ReferenceHypothesis,
  type TopicInput,
} from './priority';
import { currentFocus, seedEditorialMap, strategySettings } from './editorial-service';
import { weekStart } from './plan-service';

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

const client = async (c?: StrategyClient): Promise<StrategyClient> =>
  c ?? strategyClient(await supabaseServer());

async function me(c: StrategyClient): Promise<string | null> {
  const { data } = await c.from('app_user').select('id').limit(1).maybeSingle();
  return data?.id ?? null;
}

/* ── Entradas do motor ────────────────────────────────────────────────────── */

/** Tudo o que o motor precisa, lido de uma vez. Nenhuma chamada à Meta e
 *  nenhuma chamada a modelo: só a base. */
export async function priorityInput(
  c: StrategyClient,
  now: Date,
): Promise<PriorityInput | null> {
  const userId = await me(c);
  if (!userId) return null;

  const settings = await strategySettings(c);

  const [{ data: topicRows }, foco, publicadas, eventos, learnings, formatos, referencias, testes] =
    await Promise.all([
      c.from('content_topic')
        .select('id, slug, pillar_slug, label, how_to_treat, state, last_used_at, use_count')
        .eq('app_user_id', userId),
      currentFocus(c),
      publishedWindow(c, settings.balanceWindow * 2),
      realEvents(c),
      activeLearnings(c),
      formatGaps(c, userId),
      referenceHypotheses(c),
      c.from('content_experiment').select('id', { count: 'exact', head: true }).eq('status', 'running'),
    ]);

  const topics: TopicInput[] = (topicRows ?? [])
    .filter((t) => isPillar(t.pillar_slug) && isTopicState(t.state))
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      pillar: t.pillar_slug as Pillar,
      label: t.label,
      howToTreat: t.how_to_treat,
      state: t.state as TopicInput['state'],
      lastUsedAt: t.last_used_at,
      useCount: t.use_count,
    }));

  return {
    weekStart: weekStart(now),
    now: now.toISOString(),
    focus: foco?.items ?? [],
    topics,
    published: publicadas,
    events: eventos,
    learnings,
    formatGaps: formatos,
    references: referencias,
    runningExperiments: testes.count ?? 0,
    settings,
  };
}

/** As publicações da janela. Stories ficam de fora: expiram em 24 h e não
 *  disputam o equilíbrio de um perfil. */
async function publishedWindow(c: StrategyClient, limit: number): Promise<PublishedPiece[]> {
  const { data } = await c
    .from('instagram_media')
    .select('id, published_at, media_type, media_product_type, content_idea_id')
    .neq('media_product_type', 'STORY')
    .order('published_at', { ascending: false })
    .limit(limit);

  const media = data ?? [];
  const ideaIds = media.map((m) => m.content_idea_id).filter((x): x is string => Boolean(x));

  // Duas leituras em vez de um join encaixado: as tabelas de estratégia ainda
  // não estão no schema gerado e o PostgREST não conhece a relação. Sai numa
  // regeneração de tipos; até lá, juntar em memória é honesto e é barato.
  const [{ data: ideas }, { data: topics }] = await Promise.all([
    ideaIds.length
      ? c.from('creator_content_idea')
          .select('id, pillar_slug, editorial_objective, content_lens, commercial_modality, topic_id')
          .in('id', ideaIds)
      : Promise.resolve({ data: [] as never[] }),
    c.from('content_topic').select('id, slug'),
  ]);

  const byIdea = new Map((ideas ?? []).map((i) => [i.id, i]));
  const slugById = new Map((topics ?? []).map((t) => [t.id, t.slug]));

  return media.map((m) => {
    const idea = m.content_idea_id ? byIdea.get(m.content_idea_id) : undefined;
    const dna = dnaFromMedia({
      mediaType: m.media_type,
      mediaProductType: m.media_product_type,
      caption: '',
    });
    return {
      id: m.id,
      publishedAt: m.published_at,
      pillar: idea && isPillar(idea.pillar_slug) ? idea.pillar_slug : null,
      objective: idea && isObjective(idea.editorial_objective) ? idea.editorial_objective : null,
      lens: idea && isLens(idea.content_lens) ? idea.content_lens : null,
      topicSlug: idea?.topic_id ? slugById.get(idea.topic_id) ?? null : null,
      format: dna.format,
      modality: idea && isModality(idea.commercial_modality) ? idea.commercial_modality : 'none',
    };
  });
}

/** Matéria-prima real: histórias confirmadas ainda sem peça, e os candidatos
 *  abertos que nasceram de emails, entregas e marcos. O motor não inventa
 *  acontecimento; quando existe um, prefere-o. */
async function realEvents(c: StrategyClient): Promise<RealEvent[]> {
  const [{ data: stories }, { data: candidates }, { data: topics }] = await Promise.all([
    c.from('creator_story')
      .select('id, title, summary, occurred_at, captured_at, fact_status, topic_id, pillar_slug, status')
      .eq('fact_status', 'confirmed')
      .in('status', ['confirmed', 'mapped', 'structured', 'ready_to_record'])
      .order('captured_at', { ascending: false })
      .limit(20),
    c.from('content_story_candidate')
      .select('id, fact, occurred_at, source, brand_name')
      .eq('status', 'open')
      .order('occurred_at', { ascending: false })
      .limit(20),
    c.from('content_topic').select('id, slug, pillar_slug'),
  ]);

  const byId = new Map((topics ?? []).map((t) => [t.id, t]));

  const deStories: RealEvent[] = (stories ?? []).map((s) => ({
    id: s.id,
    kind: 'story',
    fact: s.summary?.trim() || s.title,
    occurredAt: s.occurred_at ?? s.captured_at,
    topicSlug: s.topic_id ? byId.get(s.topic_id)?.slug ?? null : null,
    pillar: isPillar(s.pillar_slug) ? s.pillar_slug : null,
    confirmed: true,
  }));

  // Um candidato é um facto observado pelo sistema — uma marca respondeu, uma
  // entrega fechou. Ainda não foi confirmado por ela, e o motor sabe disso.
  const deCandidatos: RealEvent[] = (candidates ?? []).map((k) => ({
    id: k.id,
    kind: 'candidate',
    fact: k.fact,
    occurredAt: k.occurred_at,
    topicSlug: k.source === 'brand_reply' || k.source === 'opportunity_stage' ? 'brand_experiences' : null,
    pillar: 'ugc_income',
    confirmed: false,
  }));

  return [...deStories, ...deCandidatos];
}

/** Só o que está ativo e pesa. Um aprendizado rejeitado ou despromovido não
 *  volta a empurrar decisão nenhuma — é isso que impede memória eterna. */
async function activeLearnings(c: StrategyClient): Promise<ActiveLearning[]> {
  const { data } = await c
    .from('content_learning')
    .select('id, statement, ladder_state, cohort, active, demoted_at')
    .eq('active', true)
    .is('demoted_at', null)
    .order('derived_at', { ascending: false })
    .limit(10);

  return (data ?? [])
    .filter((l) => isLadderState(l.ladder_state) && influencesPlanning(l.ladder_state) !== 'none')
    .map((l) => {
      const cohort = (l.cohort ?? {}) as Record<string, unknown>;
      return {
        id: l.id,
        statement: l.statement,
        influence: influencesPlanning(l.ladder_state as never) === 'weight' ? 'weight' : 'suggest',
        format: isFormat(cohort.format) ? cohort.format : null,
        objective: isObjective(cohort.objective) ? cohort.objective : null,
        lens: isLens(cohort.lens) ? cohort.lens : null,
      };
    });
}

async function formatGaps(c: StrategyClient, userId: string): Promise<FormatGap[]> {
  const { data } = await c
    .from('content_format_state')
    .select('value, state')
    .eq('app_user_id', userId)
    .eq('dimension', 'format');
  return (data ?? [])
    .filter((r) => isFormat(r.value))
    .map((r) => ({ format: r.value as Format, state: r.state as FormatGap['state'] }));
}

/** Referências já analisadas que ainda não geraram teste. Geram hipótese,
 *  nunca regra: o formato é da outra creator, a pergunta é da Carol. */
async function referenceHypotheses(c: StrategyClient): Promise<ReferenceHypothesis[]> {
  const { data } = await c
    .from('creative_reference')
    .select('id, structure, format, why_it_works, hypothesis_id, analysis_status')
    .eq('purpose', 'creator')
    .eq('analysis_status', 'done')
    .is('hypothesis_id', null)
    .order('captured_at', { ascending: false })
    .limit(5);

  return (data ?? []).map((r) => ({
    id: r.id,
    structure: r.structure,
    format: isFormat(r.format) ? r.format : null,
    question: r.why_it_works?.trim() || `Essa estrutura funciona quando é a Carol a fazer?`,
  }));
}

/* ── Correr e gravar ──────────────────────────────────────────────────────── */

export type WeekRunReport = {
  weekStart: string;
  created: number;
  kept: number;
  summary: string;
  notes: string[];
  breaches: string[];
};

/** Monta a semana e grava. Idempotente por semana: se já existirem propostas
 *  vivas, não se cria outra — recalcular por trás dela trocaria uma proposta
 *  que ela está a ler. */
export async function runWeek(
  opts: { db?: StrategyClient; now?: Date; force?: boolean } = {},
): Promise<WeekRunReport> {
  const c = opts.db ?? strategyClient(supabaseService());
  const now = opts.now ?? new Date();
  const semana = weekStart(now);

  await seedEditorialMap(c);

  const userId = await me(c);
  if (!userId) return { weekStart: semana, created: 0, kept: 0, summary: '', notes: ['Não encontrei o usuário.'], breaches: [] };

  const { data: vivas } = await c
    .from('content_proposal')
    .select('id')
    .eq('app_user_id', userId)
    .eq('week_start', semana)
    .in('status', [...LIVE_STATUSES]);

  if ((vivas?.length ?? 0) > 0 && !opts.force) {
    return { weekStart: semana, created: 0, kept: vivas?.length ?? 0, summary: '', notes: ['A semana já existe.'], breaches: [] };
  }

  const input = await priorityInput(c, now);
  if (!input) return { weekStart: semana, created: 0, kept: 0, summary: '', notes: ['Sem entradas.'], breaches: [] };

  const semanaMontada = buildWeek(input);

  // O guardrail corre antes da escrita, não depois. Uma proposta que viole a
  // estratégia não entra na base para ser limpa mais tarde.
  const quebras = guardrailBreaches(semanaMontada.proposals);
  const bloqueadas = new Set(quebras.filter((b) => b.position >= 0).map((b) => b.position));
  const propostas = semanaMontada.proposals.filter((_, i) => !bloqueadas.has(i));

  const planId = await upsertPlan(c, userId, {
    weekStart: semana,
    capacity: semanaMontada.capacity,
    summary: semanaMontada.summary,
    objectives: propostas.map((p) => p.objective),
  });

  const created = await insertProposals(c, userId, planId, semana, propostas);

  return {
    weekStart: semana,
    created,
    kept: 0,
    summary: semanaMontada.summary,
    notes: semanaMontada.notes,
    breaches: quebras.map((b) => `${b.rule}: ${b.because}`),
  };
}

async function upsertPlan(
  c: StrategyClient,
  userId: string,
  input: { weekStart: string; capacity: number; summary: string; objectives: readonly Objective[] },
): Promise<string | null> {
  const mix: Record<string, number> = {};
  for (const o of input.objectives) mix[o] = (mix[o] ?? 0) + 1;

  const foco = await currentFocus(c);
  const { data } = await c
    .from('content_week_plan')
    .upsert(
      {
        app_user_id: userId,
        week_start: input.weekStart,
        capacity: input.capacity,
        strategy_summary: input.summary,
        objective_mix: asJson(mix),
        engine_version: 'CAROL_PRIORITY_V1',
        focus_id: foco?.id ?? null,
        status: 'active',
        rationale: input.summary,
      },
      { onConflict: 'app_user_id,week_start' },
    )
    .select('id')
    .maybeSingle();
  return data?.id ?? null;
}

async function insertProposals(
  c: StrategyClient,
  userId: string,
  planId: string | null,
  semana: string,
  propostas: readonly ProposalDraft[],
): Promise<number> {
  if (propostas.length === 0) return 0;
  const { data, error } = await c
    .from('content_proposal')
    .insert(propostas.map((p) => rowFor(userId, planId, semana, p)))
    .select('id');
  if (error) return 0;
  return data?.length ?? 0;
}

function rowFor(userId: string, planId: string | null, semana: string, p: ProposalDraft) {
  return {
    app_user_id: userId,
    plan_id: planId,
    week_start: semana,
    position: p.position,
    topic_id: p.topicId,
    topic_label: p.topicLabel,
    pillar_slug: p.pillar,
    angle: p.angle,
    lens: p.lens,
    objective: p.objective,
    format: p.format,
    structure: p.structure,
    commercial_modality: p.modality,
    why_now: p.whyNow,
    evidence: asJson(p.evidence),
    status: 'proposed',
    story_id: p.storyId,
    engine_version: 'CAROL_PRIORITY_V1',
  };
}

/* ── Leitura para a tela ──────────────────────────────────────────────────── */

export type ProposalView = {
  id: string;
  position: number;
  topicId: string | null;
  topicLabel: string;
  pillar: Pillar;
  pillarLabel: string;
  angle: string;
  lens: Lens;
  lensLabel: string;
  objective: Objective;
  objectiveLabel: string;
  format: Format;
  formatLabel: string;
  structure: Structure | null;
  structureLabel: string | null;
  modality: Modality;
  modalityLabel: string | null;
  whyNow: string;
  evidence: Evidence[];
  status: ProposalStatus;
  statusLabel: string;
  statusMeans: string;
  approvedAt: string | null;
  validatedAt: string | null;
  storyId: string | null;
  packId: string | null;
  packGaps: string[];
  reelTest: boolean;
  experimentId: string | null;
};

export type WeekView = {
  weekStart: string;
  capacity: number;
  summary: string;
  proposals: ProposalView[];
  /** Só o que espera mesmo por ela. */
  needsYou: ProposalView[];
  readyToProduce: ProposalView[];
  exists: boolean;
};

export async function currentWeek(opts: { db?: StrategyClient; now?: Date } = {}): Promise<WeekView> {
  const c = await client(opts.db);
  const semana = weekStart(opts.now ?? new Date());

  const [{ data: plano }, { data: rows }] = await Promise.all([
    c.from('content_week_plan').select('capacity, strategy_summary').eq('week_start', semana).maybeSingle(),
    c.from('content_proposal').select('*').eq('week_start', semana).order('position'),
  ]);

  const ids = (rows ?? []).map((r) => r.id);
  const { data: packs } = ids.length
    ? await c
        .from('content_production_pack')
        .select('id, proposal_id, gaps, status, version')
        .in('proposal_id', ids)
    : { data: [] as never[] };

  const packByProposal = new Map<string, { id: string; gaps: string[]; status: string; version: number }>();
  for (const pk of packs ?? []) {
    const atual = packByProposal.get(pk.proposal_id);
    if (!atual || pk.version > atual.version) {
      packByProposal.set(pk.proposal_id, { id: pk.id, gaps: pk.gaps ?? [], status: pk.status, version: pk.version });
    }
  }

  const proposals = (rows ?? [])
    .map((r) => toView(r as Record<string, unknown>, packByProposal.get(r.id) ?? null))
    .filter((p): p is ProposalView => p !== null);

  return {
    weekStart: semana,
    capacity: plano?.capacity ?? 3,
    summary: plano?.strategy_summary ?? '',
    proposals: proposals.filter((p) => p.status !== 'swapped' && p.status !== 'dropped'),
    needsYou: proposals.filter((p) => p.status === 'proposed' || p.status === 'to_validate'),
    readyToProduce: proposals.filter((p) => p.status === 'ready_to_produce'),
    exists: proposals.length > 0,
  };
}

type PackSummary = { id: string; gaps: string[]; status: string; version: number };

function toView(row: Record<string, unknown>, pack: PackSummary | null): ProposalView | null {
  const pillar = row.pillar_slug;
  const lens = row.lens;
  const objective = row.objective;
  const format = row.format;
  const status = row.status;
  if (!isPillar(pillar) || !isLens(lens) || !isObjective(objective) || !isFormat(format) || !isProposalStatus(status)) {
    return null;
  }

  const structure = isStructure(row.structure) ? row.structure : null;
  const modality = isModality(row.commercial_modality) ? row.commercial_modality : 'none';
  const evidence = Array.isArray(row.evidence) ? (row.evidence as Evidence[]) : [];

  return {
    id: String(row.id),
    position: Number(row.position ?? 0),
    topicId: (row.topic_id as string | null) ?? null,
    topicLabel: String(row.topic_label ?? ''),
    pillar,
    pillarLabel: PILLAR_SHORT[pillar],
    angle: String(row.angle ?? ''),
    lens,
    lensLabel: LENS_LABEL[lens],
    objective,
    objectiveLabel: OBJECTIVE_LABEL[objective],
    format,
    formatLabel: FORMAT_LABEL[format],
    structure,
    structureLabel: structure ? STRUCTURE_LABEL[structure] : null,
    modality,
    modalityLabel: modality === 'none' ? null : MODALITY_LABEL[modality],
    whyNow: String(row.why_now ?? ''),
    evidence,
    status,
    statusLabel: STATUS_LABEL[status],
    statusMeans: STATUS_MEANS[status],
    approvedAt: (row.approved_at as string | null) ?? null,
    validatedAt: (row.validated_at as string | null) ?? null,
    storyId: (row.story_id as string | null) ?? null,
    packId: pack?.id ?? null,
    packGaps: pack?.gaps ?? [],
    reelTest: Boolean(row.experiment_id) && format === 'reel',
    experimentId: (row.experiment_id as string | null) ?? null,
  };
}

/* ── Ações da Carol ───────────────────────────────────────────────────────── */

async function move(
  c: StrategyClient,
  id: string,
  to: ProposalStatus,
  note = '',
  stamp: Partial<{ approved_at: string; validated_at: string }> = {},
): Promise<Result<{ status: ProposalStatus }>> {
  const { data: row } = await c
    .from('content_proposal')
    .select('id, status, approved_at, validated_at')
    .eq('id', id)
    .maybeSingle();
  if (!row) return fail('Não encontrei essa proposta.');
  if (!isProposalStatus(row.status)) return fail('Estado desconhecido.');

  const check = canTransition(row.status, to, {
    approved: Boolean(row.approved_at ?? stamp.approved_at),
    validated: Boolean(row.validated_at ?? stamp.validated_at),
  });
  if (!check.ok) return fail(check.because);

  const { error } = await c.from('content_proposal').update({ status: to, ...stamp }).eq('id', id);
  if (error) return fail(error.message);

  await c.from('content_proposal_event').insert({
    proposal_id: id,
    from_status: row.status,
    to_status: to,
    actor: 'carol',
    note,
  });

  return { ok: true, data: { status: to } };
}

/** Aprovar. É a decisão estratégica: assunto, ângulo e formato aceites. Só
 *  depois disto é que existe Production Pack. */
export async function approveProposal(id: string): Promise<Result<{ status: ProposalStatus }>> {
  const c = await client();
  return move(c, id, 'approved_to_develop', 'Aprovada.', { approved_at: new Date().toISOString() });
}

export const ADJUSTABLE = ['angle', 'objective', 'format', 'lens', 'structure', 'modality'] as const;
export type AdjustableField = (typeof ADJUSTABLE)[number];

/** «Quero ajustar» muda uma decisão, não reabre o formulário inteiro. O
 *  histórico do que mudou fica em `adjustments`, append-only: é o que permite
 *  o motor aprender que ela troca sempre o formato que ele sugere. */
export async function adjustProposal(
  id: string,
  field: AdjustableField,
  value: string,
): Promise<Result<{ field: AdjustableField }>> {
  if (!(ADJUSTABLE as readonly string[]).includes(field)) return fail('Esse campo não se ajusta aqui.');

  const coluna: Record<AdjustableField, string> = {
    angle: 'angle', objective: 'objective', format: 'format',
    lens: 'lens', structure: 'structure', modality: 'commercial_modality',
  };

  const valido =
    field === 'angle' ? value.trim().length > 2
    : field === 'objective' ? isObjective(value)
    : field === 'format' ? isFormat(value)
    : field === 'lens' ? isLens(value)
    : field === 'structure' ? value === '' || isStructure(value)
    : isModality(value);
  if (!valido) return fail('Esse valor não é válido para esse campo.');

  const c = await client();
  const { data: row } = await c
    .from('content_proposal')
    .select('id, angle, objective, format, lens, structure, commercial_modality, adjustments')
    .eq('id', id)
    .maybeSingle();
  if (!row) return fail('Não encontrei essa proposta.');

  const antes = (row as Record<string, unknown>)[coluna[field]];
  const historico = Array.isArray(row.adjustments) ? row.adjustments : [];

  const novo = field === 'structure' && value === '' ? null : value;
  const patch: Partial<ContentProposalRow> = {
    adjustments: asJson([...historico, { field, from: (antes as string | null) ?? null, to: value, at: new Date().toISOString() }]),
    ...(field === 'angle' ? { angle: value }
      : field === 'objective' ? { objective: value }
      : field === 'format' ? { format: value }
      : field === 'lens' ? { lens: value }
      : field === 'structure' ? { structure: novo }
      : { commercial_modality: value }),
  };

  const { error } = await c.from('content_proposal').update(patch).eq('id', id);
  if (error) return fail(error.message);

  return { ok: true, data: { field } };
}

/** «Trocar» não apaga: marca a proposta como trocada e põe a melhor
 *  alternativa no lugar. Sem alternativa, diz que não há em vez de inventar
 *  uma. */
export async function swapProposal(id: string): Promise<Result<{ replaced: boolean }>> {
  const c = await client();
  const now = new Date();

  const { data: row } = await c
    .from('content_proposal')
    .select('id, app_user_id, plan_id, week_start, position, topic_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!row) return fail('Não encontrei essa proposta.');
  if (!isProposalStatus(row.status)) return fail('Estado desconhecido.');
  if (row.status !== 'proposed') return fail('Só dá para trocar uma proposta que ainda não foi aprovada.');

  const input = await priorityInput(c, now);
  if (!input) return fail('Não consegui reler o contexto.');

  const { data: outras } = await c
    .from('content_proposal')
    .select('topic_id')
    .eq('week_start', row.week_start)
    .in('status', [...LIVE_STATUSES]);
  const ocupados = new Set((outras ?? []).map((o) => o.topic_id).filter(Boolean) as string[]);

  // Recalcula com os assuntos já usados fora da mesa. É o mesmo motor: a
  // alternativa tem de ser tão explicável quanto a original.
  const alternativa = buildWeek({
    ...input,
    topics: input.topics.filter((t) => !ocupados.has(t.id)),
    settings: { ...input.settings!, weeklyCapacity: 1 },
  }).proposals[0];

  const troca = await move(c, id, 'swapped', 'Você pediu outra.');
  if (!troca.ok) return troca;

  if (!alternativa) {
    return { ok: true, data: { replaced: false } };
  }

  const { data: nova } = await c
    .from('content_proposal')
    .insert({
      ...rowFor(row.app_user_id, row.plan_id, row.week_start, { ...alternativa, position: row.position }),
      replaces_id: id,
    })
    .select('id')
    .maybeSingle();

  return { ok: true, data: { replaced: Boolean(nova) } };
}

export async function dropProposal(id: string): Promise<Result<{ status: ProposalStatus }>> {
  const c = await client();
  return move(c, id, 'dropped', 'Fora da semana.');
}

/** Avança o estado depois da produção. A publicação é que marca o assunto
 *  como usado — é daí que sai a rotação do Mapa. */
export async function advanceProposal(id: string, to: ProposalStatus, note = ''): Promise<Result<{ status: ProposalStatus }>> {
  const c = await client();
  const r = await move(c, id, to, note);
  if (!r.ok) return r;

  if (to === 'published') {
    const { data } = await c.from('content_proposal').select('topic_id').eq('id', id).maybeSingle();
    if (data?.topic_id) {
      const { data: t } = await c.from('content_topic').select('use_count').eq('id', data.topic_id).maybeSingle();
      await c
        .from('content_topic')
        .update({ last_used_at: new Date().toISOString(), use_count: (t?.use_count ?? 0) + 1 })
        .eq('id', data.topic_id);
    }
  }

  return r;
}
