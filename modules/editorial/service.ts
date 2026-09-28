import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { localDay } from '@/lib/time';
import { supabaseServer } from '@/lib/supabase/server';
import { runPrompt } from '@/modules/ai/gateway';
import {
  forbiddenTopicProblems,
  selectWeekSeeds,
  teacherToneProblems,
  type ContentLens,
  type EditorialObjective,
  type EditorialPillarKey,
  type PlatformFormat,
  type RecentPiece,
  type TopicCandidate,
  type TopicState,
} from './domain';
import {
  promptSeed,
  replaceProposalPrompt,
  reviseProposalPrompt,
  weekProposalPrompt,
  type SingleProposalOutput,
  type WeekProposalOutput,
} from './prompts';

type LooseDb = SupabaseClient<any>;

const PILLARS = [
  { key: 'ugc_income', name: 'Transformando UGC em fonte de renda', sort: 1 },
  { key: 'experiences', name: 'Experiências', sort: 2 },
  { key: 'home', name: 'Casa', sort: 3 },
] as const;

const TOPICS = [
  ['ugc_income', 'my_experience', 'Minha experiência até aqui', 'now', 2],
  ['ugc_income', 'what_i_did', 'O que fiz e como fiz', 'now', 2],
  ['ugc_income', 'wins_mistakes', 'O que deu certo e o que deu errado', 'now', 2],
  ['ugc_income', 'current_phase', 'O que estou passando agora', 'now', 3],
  ['ugc_income', 'brand_experiences', 'Experiências com marcas', 'now', 2],
  ['ugc_income', 'tech_ugc', 'Tech UGC', 'now', 4],
  ['ugc_income', 'canvas_ugc', 'Canvas UGC', 'now', 4],
  ['experiences', 'braga_a_fundo', 'Braga a Fundo', 'now', 1],
  ['experiences', 'restaurants', 'Restaurantes', 'now', 1],
  ['experiences', 'hospitality', 'Hospedagens e hospitalidade', 'next', 1],
  ['experiences', 'service', 'Atendimento e experiência', 'now', 1],
  ['experiences', 'price_value', 'Preço e percepção de valor', 'next', 1],
  ['home', 'seven_pets', 'Rotina com sete bichos', 'now', 1],
  ['home', 'home_tech', 'Tecnologia que ajuda em casa', 'now', 2],
  ['home', 'routine', 'Rotina real de casa', 'now', 1],
  ['home', 'relationship', 'Relacionamento', 'next', 1],
  ['home', 'memes', 'Memes da vida real', 'now', 1],
] as const;

const FOCUS_TITLE = 'Construir audiência e marca pessoal enquanto Tech UGC e Canvas UGC ganham tração';
const FOCUS_SUMMARY =
  'Fase atual: consolidar carreira em Tech UGC + Canvas UGC para SaaS e apps que atendem negócios locais, descobrir formatos, criar comunidade e manter a Carol pessoa visível no perfil.';
const COMMERCIAL_FOCUS = 'SaaS e apps que atendem negócios locais';

export type EditorialTopic = {
  id: string;
  key: string;
  name: string;
  state: TopicState;
  pillarKey: EditorialPillarKey;
  pillarName: string;
  focusWeight: number;
};

export type EditorialPiece = {
  id: string;
  slotOrder: number;
  topicId: string | null;
  topicName: string;
  pillar: EditorialPillarKey;
  pillarName: string;
  angle: string;
  lens: ContentLens;
  objective: EditorialObjective;
  format: PlatformFormat;
  structure: string;
  modality: 'tech_ugc' | 'canvas_ugc' | 'non_commercial';
  whyNow: string;
  status: string;
  adjustmentNotes: string;
};

export type EditorialWeek = {
  id: string;
  weekStart: string;
  summary: string;
  status: string;
  pieces: EditorialPiece[];
};

export type EditorialScreen = {
  focus: { title: string; summary: string; commercialFocus: string };
  week: EditorialWeek | null;
  topics: EditorialTopic[];
  readyCount: number;
  needsValidationCount: number;
};

async function db(): Promise<LooseDb> {
  return (await supabaseServer()) as unknown as LooseDb;
}

export function weekStart(now = new Date()): string {
  const d = new Date(now);
  const dow = d.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return localDay(d);
}

export async function ensureEditorialSeed(appUserId: string) {
  const client = await db();
  for (const p of PILLARS) {
    await client.from('editorial_pillar').upsert(
      { app_user_id: appUserId, key: p.key, name: p.name, sort_order: p.sort, active: true },
      { onConflict: 'app_user_id,key', ignoreDuplicates: true },
    );
  }

  const { data: pillarRows } = await client
    .from('editorial_pillar')
    .select('id,key')
    .eq('app_user_id', appUserId);
  const byKey = new Map((pillarRows ?? []).map((p: any) => [p.key, p.id]));

  for (const [pillarKey, key, name, state, focusWeight] of TOPICS) {
    const pillarId = byKey.get(pillarKey);
    if (!pillarId) continue;
    await client.from('editorial_topic').upsert(
      {
        app_user_id: appUserId,
        pillar_id: pillarId,
        key,
        name,
        state,
        focus_weight: focusWeight,
        active: true,
      },
      { onConflict: 'app_user_id,key', ignoreDuplicates: true },
    );
  }

  const { data: current } = await client
    .from('editorial_current_focus')
    .select('id')
    .eq('app_user_id', appUserId)
    .eq('active', true)
    .maybeSingle();
  if (!current) {
    await client.from('editorial_current_focus').insert({
      app_user_id: appUserId,
      title: FOCUS_TITLE,
      summary: FOCUS_SUMMARY,
      commercial_focus: COMMERCIAL_FOCUS,
      active: true,
      starts_on: localDay(new Date()),
    });
  }
}

export async function editorialScreen(appUserId: string, now = new Date()): Promise<EditorialScreen> {
  await ensureEditorialSeed(appUserId);
  const client = await db();
  const [topics, focus, week] = await Promise.all([
    readTopics(client, appUserId),
    readFocus(client, appUserId),
    readWeek(client, appUserId, weekStart(now)),
  ]);

  const pieces = week?.pieces ?? [];
  return {
    focus,
    week,
    topics,
    readyCount: pieces.filter((p) => p.status === 'ready_to_produce').length,
    needsValidationCount: pieces.filter((p) => p.status === 'to_validate').length,
  };
}

async function readFocus(client: LooseDb, appUserId: string) {
  const { data } = await client
    .from('editorial_current_focus')
    .select('title,summary,commercial_focus')
    .eq('app_user_id', appUserId)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    title: data?.title ?? FOCUS_TITLE,
    summary: data?.summary ?? FOCUS_SUMMARY,
    commercialFocus: data?.commercial_focus ?? COMMERCIAL_FOCUS,
  };
}

async function readTopics(client: LooseDb, appUserId: string): Promise<EditorialTopic[]> {
  const { data } = await client
    .from('editorial_topic')
    .select('id,key,name,state,focus_weight,pillar:editorial_pillar(key,name,sort_order)')
    .eq('app_user_id', appUserId)
    .eq('active', true)
    .order('created_at', { ascending: true });

  return (data ?? [])
    .map((row: any) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      state: row.state as TopicState,
      focusWeight: Number(row.focus_weight ?? 0),
      pillarKey: row.pillar?.key as EditorialPillarKey,
      pillarName: row.pillar?.name ?? '',
      sort: Number(row.pillar?.sort_order ?? 99),
    }))
    .sort((a: any, b: any) => a.sort - b.sort || a.name.localeCompare(b.name, 'pt-BR'))
    .map(({ sort: _sort, ...row }: any) => row);
}

async function readWeek(client: LooseDb, appUserId: string, start: string): Promise<EditorialWeek | null> {
  const { data: plan } = await client
    .from('editorial_week_plan')
    .select('id,week_start,summary,status')
    .eq('app_user_id', appUserId)
    .eq('week_start', start)
    .maybeSingle();
  if (!plan) return null;

  const { data: pieces } = await client
    .from('editorial_piece')
    .select('id,slot_order,topic_id,topic_name,pillar_key,angle,lens,objective,platform_format,structure,commercial_modality,why_now,status,adjustment_notes,pillar:editorial_pillar(name)')
    .eq('week_plan_id', plan.id)
    .order('slot_order', { ascending: true });

  return {
    id: plan.id,
    weekStart: plan.week_start,
    summary: plan.summary,
    status: plan.status,
    pieces: (pieces ?? []).map((row: any) => ({
      id: row.id,
      slotOrder: row.slot_order,
      topicId: row.topic_id,
      topicName: row.topic_name,
      pillar: row.pillar_key as EditorialPillarKey,
      pillarName: row.pillar?.name ?? row.pillar_key,
      angle: row.angle,
      lens: row.lens as ContentLens,
      objective: row.objective as EditorialObjective,
      format: row.platform_format as PlatformFormat,
      structure: row.structure,
      modality: row.commercial_modality,
      whyNow: row.why_now,
      status: row.status,
      adjustmentNotes: row.adjustment_notes ?? '',
    })),
  };
}

export async function generateWeek(appUserId: string, now = new Date()) {
  await ensureEditorialSeed(appUserId);
  const client = await db();
  const start = weekStart(now);
  const existing = await readWeek(client, appUserId, start);
  if (existing?.pieces.length) return { ok: true as const, week: existing };

  const [topics, focus, recentRows] = await Promise.all([
    readTopics(client, appUserId),
    readFocus(client, appUserId),
    client
      .from('editorial_piece')
      .select('topic_id,pillar_key,objective,lens,created_at')
      .eq('app_user_id', appUserId)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const candidates: TopicCandidate[] = topics.map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    pillar: t.pillarKey,
    state: t.state,
    focusWeight: t.focusWeight,
  }));
  const recent: RecentPiece[] = (recentRows.data ?? []).map((r: any) => ({
    topicId: r.topic_id,
    pillar: r.pillar_key,
    objective: r.objective,
    lens: r.lens,
  }));
  const seeds = selectWeekSeeds(candidates, recent);
  if (seeds.length !== 3) {
    return { ok: false as const, error: 'Ainda não há três assuntos em AGORA para montar uma semana equilibrada.' };
  }

  const promptInput = {
    focus: `${focus.title}\n${focus.summary}\nFoco comercial: ${focus.commercialFocus}`,
    seeds: seeds.map(promptSeed),
  };
  const ai = await runPrompt(weekProposalPrompt, promptInput, {
    entityType: 'editorial_week',
    evidenceRefs: seeds.map((s) => ({ topicId: s.topic.id, reason: s.deterministicReason })),
  });
  if (!ai.ok) return { ok: false as const, error: `Não consegui montar a semana agora. ${ai.message}` };

  const checked = validateWeekOutput(ai.output, seeds.map((s) => s.topic.id));
  if (!checked.ok) return checked;

  const { data: plan, error: planError } = await client
    .from('editorial_week_plan')
    .upsert(
      {
        app_user_id: appUserId,
        week_start: start,
        status: 'active',
        summary: ai.output.summary,
        source_version: 'CAROL_CONTENT_SOT_V1',
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'app_user_id,week_start' },
    )
    .select('id')
    .maybeSingle();
  if (planError || !plan) return { ok: false as const, error: planError?.message ?? 'Não consegui salvar a semana.' };

  await client.from('editorial_piece').delete().eq('week_plan_id', plan.id).eq('status', 'proposed');

  const byId = new Map(seeds.map((s) => [s.topic.id, s]));
  const { data: pillarRows } = await client
    .from('editorial_pillar')
    .select('id,key')
    .eq('app_user_id', appUserId);
  const pillarByKey = new Map<string, string>();
  for (const p of pillarRows ?? []) pillarByKey.set((p as any).key, (p as any).id);

  const rows = ai.output.proposals.map((proposal, index) => {
    const seed = byId.get(proposal.topicId)!;
    return {
      app_user_id: appUserId,
      week_plan_id: plan.id,
      slot_order: index,
      pillar_id: pillarByKey.get(seed.topic.pillar) ?? null,
      topic_id: seed.topic.id,
      topic_name: seed.topic.name,
      pillar_key: seed.topic.pillar,
      angle: proposal.angle,
      lens: proposal.lens,
      objective: seed.objective,
      platform_format: proposal.format,
      structure: proposal.structure,
      commercial_modality: proposal.modality,
      why_now: proposal.whyNow,
      status: 'proposed',
      decision_trace: {
        deterministicReason: seed.deterministicReason,
        promptVersion: weekProposalPrompt.version,
        aiRunId: ai.runId,
      },
    };
  });

  const { error: pieceError } = await client.from('editorial_piece').insert(rows);
  if (pieceError) return { ok: false as const, error: pieceError.message };

  const week = await readWeek(client, appUserId, start);
  return week ? { ok: true as const, week } : { ok: false as const, error: 'A semana foi criada, mas não consegui relê-la.' };
}

function validateWeekOutput(output: WeekProposalOutput, topicIds: string[]) {
  const got = output.proposals.map((p) => p.topicId);
  if (new Set(got).size !== 3 || topicIds.some((id) => !got.includes(id))) {
    return { ok: false as const, error: 'A IA tentou trocar os assuntos escolhidos pelo motor. A semana não foi salva.' };
  }
  for (const p of output.proposals) {
    const problems = [...teacherToneProblems(p.angle), ...forbiddenTopicProblems(`${p.angle} ${p.whyNow}`)];
    if (problems.length) return { ok: false as const, error: problems[0] };
  }
  return { ok: true as const };
}

export async function approvePiece(appUserId: string, pieceId: string) {
  const client = await db();
  const { data, error } = await client
    .from('editorial_piece')
    .update({ status: 'approved_for_development', approved_at: new Date().toISOString() })
    .eq('id', pieceId)
    .eq('app_user_id', appUserId)
    .eq('status', 'proposed')
    .select('id')
    .maybeSingle();
  return error || !data ? { ok: false as const, error: error?.message ?? 'Não encontrei essa proposta.' } : { ok: true as const };
}

export async function adjustPiece(appUserId: string, pieceId: string, feedback: string) {
  if (feedback.trim().length < 3) return { ok: false as const, error: 'Diga em uma frase o que você quer mudar.' };
  const client = await db();
  const ctx = await proposalContext(client, appUserId, pieceId);
  if (!ctx) return { ok: false as const, error: 'Não encontrei essa proposta.' };

  const ai = await runPrompt(reviseProposalPrompt, {
    focus: `${ctx.focus.title}\n${ctx.focus.summary}`,
    seeds: [promptSeed(ctx.seed)],
    current: ctx.current,
    feedback,
  });
  if (!ai.ok) return { ok: false as const, error: ai.message };
  return writeSingleProposal(client, appUserId, pieceId, ai.output, ctx.seed, feedback);
}

export async function replacePiece(appUserId: string, pieceId: string) {
  const client = await db();
  const current = await proposalContext(client, appUserId, pieceId);
  if (!current) return { ok: false as const, error: 'Não encontrei essa proposta.' };

  const topics = await readTopics(client, appUserId);
  const { data: siblingRows } = await client
    .from('editorial_piece')
    .select('topic_id')
    .eq('week_plan_id', current.planId)
    .neq('id', pieceId);
  const used = new Set((siblingRows ?? []).map((r: any) => r.topic_id));
  used.add(current.seed.topic.id);

  const alternative = topics
    .filter((t) => t.state === 'now' && !used.has(t.id))
    .sort((a, b) => {
      const differentA = a.pillarKey === current.seed.topic.pillar ? 0 : 1;
      const differentB = b.pillarKey === current.seed.topic.pillar ? 0 : 1;
      return differentB - differentA || b.focusWeight - a.focusWeight;
    })[0];
  if (!alternative) return { ok: false as const, error: 'Não há outro assunto em AGORA para trocar sem repetir a semana.' };

  const seed = {
    topic: {
      id: alternative.id,
      key: alternative.key,
      name: alternative.name,
      pillar: alternative.pillarKey,
      state: alternative.state,
      focusWeight: alternative.focusWeight,
    },
    objective: current.seed.objective,
    deterministicReason: 'A proposta anterior foi trocada pela Carol. Use outro assunto em AGORA sem repetir as outras peças da semana.',
  };

  const ai = await runPrompt(replaceProposalPrompt, {
    focus: `${current.focus.title}\n${current.focus.summary}`,
    seeds: [promptSeed(seed)],
    avoidTopicIds: [...used],
  });
  if (!ai.ok) return { ok: false as const, error: ai.message };

  const result = await writeSingleProposal(client, appUserId, pieceId, ai.output, seed, 'Trocada pela Carol.');
  if (!result.ok) return result;
  const { data: pillar } = await client
    .from('editorial_pillar')
    .select('id')
    .eq('app_user_id', appUserId)
    .eq('key', alternative.pillarKey)
    .maybeSingle();
  await client.from('editorial_piece').update({ pillar_id: pillar?.id ?? null }).eq('id', pieceId).eq('app_user_id', appUserId);
  return { ok: true as const };
}

async function proposalContext(client: LooseDb, appUserId: string, pieceId: string) {
  const [{ data: piece }, focus, topics] = await Promise.all([
    client
      .from('editorial_piece')
      .select('id,week_plan_id,topic_id,topic_name,pillar_key,angle,lens,objective,platform_format,structure,why_now,status')
      .eq('id', pieceId)
      .eq('app_user_id', appUserId)
      .maybeSingle(),
    readFocus(client, appUserId),
    readTopics(client, appUserId),
  ]);
  if (!piece || piece.status !== 'proposed') return null;
  const topic = topics.find((t) => t.id === piece.topic_id);
  if (!topic) return null;
  return {
    planId: piece.week_plan_id as string,
    focus,
    current: {
      angle: piece.angle,
      format: piece.platform_format,
      structure: piece.structure,
      lens: piece.lens,
      whyNow: piece.why_now,
    },
    seed: {
      topic: {
        id: topic.id,
        key: topic.key,
        name: topic.name,
        pillar: topic.pillarKey,
        state: topic.state,
        focusWeight: topic.focusWeight,
      },
      objective: piece.objective as EditorialObjective,
      deterministicReason: piece.why_now,
    },
  };
}

async function writeSingleProposal(
  client: LooseDb,
  appUserId: string,
  pieceId: string,
  output: SingleProposalOutput,
  seed: { topic: TopicCandidate; objective: EditorialObjective; deterministicReason: string },
  feedback: string,
) {
  const p = output.proposal;
  if (p.topicId !== seed.topic.id) return { ok: false as const, error: 'A revisão tentou trocar o assunto sem autorização.' };
  const problems = [...teacherToneProblems(p.angle), ...forbiddenTopicProblems(`${p.angle} ${p.whyNow}`)];
  if (problems.length) return { ok: false as const, error: problems[0] };
  const { error } = await client
    .from('editorial_piece')
    .update({
      topic_id: seed.topic.id,
      topic_name: seed.topic.name,
      pillar_key: seed.topic.pillar,
      angle: p.angle,
      lens: p.lens,
      objective: seed.objective,
      platform_format: p.format,
      structure: p.structure,
      commercial_modality: p.modality,
      why_now: p.whyNow,
      adjustment_notes: feedback,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pieceId)
    .eq('app_user_id', appUserId);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function setTopicState(appUserId: string, topicId: string, state: TopicState) {
  const client = await db();
  const { error } = await client
    .from('editorial_topic')
    .update({ state, updated_at: new Date().toISOString() })
    .eq('id', topicId)
    .eq('app_user_id', appUserId);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}
