/** Planeamento semanal, séries e candidatos proativos.
 *
 *  O planner recebe inventário real e devolve uma composição. Quando não há
 *  material, devolve uma ação de mapear — nunca um slot com texto de história
 *  inventada. `validateSlots` corre antes da escrita e recusa o que não
 *  apontar para um id existente.
 *
 *  Server-only. */

import 'server-only';

import { localDay } from '@/lib/time';
import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { runPrompt } from '@/modules/ai/gateway';
import {
  FUNCTIONAL_PILLARS,
  MAX_CANDIDATES_PER_DAY,
  SERIES_POLICY_V1,
  acceptEpisodes,
  candidateFor,
  consolidate,
  contentDecision,
  pillarCoverage,
  planWeek,
  seriesEligibility,
  validateSlots,
  type CandidateSource,
  type ContentDecision,
  type EventInput,
  type FunctionalPillar,
  type PlannerStory,
  type StoryCandidate,
  type WeekPlan,
} from './domain';
import { detectSeries as detectSeriesPrompt } from './prompts';
import { suggestableStories, type Db } from './service';

/** O cliente a usar.
 *
 *  Uma tela corre com a sessão dela e portanto sob RLS. Um trabalho de fundo
 *  corre a partir do pg_cron, sem sessão nenhuma — e `supabaseServer()` ali
 *  devolve um cliente anónimo que o RLS bloqueia. O plano da semana falhava com
 *  «não encontrei o usuário» e a decisão do Hoje devolvia nada, em silêncio,
 *  que é pior.
 *
 *  Por isso quem chama diz qual usa. É a mesma convenção de
 *  `modules/actions/service.ts`. */
const client = async (db?: Db): Promise<Db> => db ?? ((await supabaseServer()) as Db);

/* ── Semana ───────────────────────────────────────────────────────────────── */

/** A segunda-feira da semana de uma data. O plano é semanal e tem de ter uma
 *  chave estável para o `unique (app_user_id, week_start)`. */
export function weekStart(now = new Date()): string {
  const d = new Date(now);
  const dia = d.getUTCDay();
  const recuo = dia === 0 ? 6 : dia - 1;
  d.setUTCDate(d.getUTCDate() - recuo);
  return localDay(d);
}

export type WeekPlanRow = WeekPlan & { id: string | null; status: string };

export async function currentWeekPlan(now = new Date(), client_?: Db): Promise<WeekPlanRow | null> {
  const db = await client(client_);
  const semana = weekStart(now);

  const { data: plano } = await db
    .from('content_week_plan')
    .select('id, week_start, primary_pillar, rationale, status, gaps')
    .eq('week_start', semana)
    .maybeSingle();
  if (!plano) return null;

  const { data: slots } = await db
    .from('content_week_slot')
    .select('slot_order, kind, pillar, purpose, story_id, content_idea_id, reason, status, creator_story(title, status), creator_content_idea(title)')
    .eq('plan_id', plano.id)
    .order('slot_order', { ascending: true });

  return {
    id: plano.id,
    weekStart: plano.week_start,
    primaryPillar: plano.primary_pillar as FunctionalPillar,
    rationale: plano.rationale,
    status: plano.status,
    gaps: (plano.gaps ?? []) as { pillar: FunctionalPillar; available: number }[],
    mappingOnly: !(slots ?? []).some((s) => s.kind === 'story'),
    slots: (slots ?? []).map((s) => {
      const story = s.creator_story as { title?: string; status?: string } | null;
      const idea = s.creator_content_idea as { title?: string } | null;
      if (s.kind === 'story') {
        return {
          kind: 'story' as const,
          order: s.slot_order,
          pillar: s.pillar as FunctionalPillar,
          purpose: s.purpose as 'primary' | 'complement' | 'breather' | 'commercial',
          storyId: s.story_id!,
          title: story?.title ?? 'História',
          ready: story?.status === 'ready_to_record',
        };
      }
      if (s.kind === 'content') {
        return {
          kind: 'content' as const,
          order: s.slot_order,
          pillar: (s.pillar as FunctionalPillar | null) ?? null,
          purpose: s.purpose as 'primary' | 'complement' | 'breather' | 'commercial',
          contentId: s.content_idea_id!,
          title: idea?.title ?? 'Peça',
          dueAt: '',
        };
      }
      return {
        kind: 'map_pillar' as const,
        order: s.slot_order,
        pillar: s.pillar as FunctionalPillar,
        purpose: s.purpose as 'primary' | 'complement' | 'breather' | 'commercial',
        reason: s.reason,
      };
    }),
  };
}

/** Que pilar deve ser o foco.
 *
 *  Sem plano anterior é Atração — é a fase declarada do perfil. Com plano
 *  anterior, roda para não ficar meses no mesmo. */
async function pickFocus(coverage: ReturnType<typeof pillarCoverage>, client_?: Db): Promise<FunctionalPillar> {
  const db = await client(client_);
  const { data: anterior } = await db
    .from('content_week_plan')
    .select('primary_pillar')
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  const abastecidos = coverage.filter((c) => !c.needsMapping).map((c) => c.pillar);
  if (abastecidos.length === 0) return 'attraction_journey';

  const ultimo = anterior?.primary_pillar as FunctionalPillar | undefined;
  if (!ultimo) return abastecidos.includes('attraction_journey') ? 'attraction_journey' : abastecidos[0];

  const i = FUNCTIONAL_PILLARS.indexOf(ultimo);
  for (let n = 1; n <= FUNCTIONAL_PILLARS.length; n++) {
    const candidato = FUNCTIONAL_PILLARS[(i + n) % FUNCTIONAL_PILLARS.length];
    if (abastecidos.includes(candidato)) return candidato;
  }
  return abastecidos[0];
}

export async function buildWeekPlan(
  opts: { now?: Date; capacity?: number; db?: Db } = {},
): Promise<{ ok: true; plan: WeekPlan } | { ok: false; error: string }> {
  const now = opts.now ?? new Date();
  const db = await client(opts.db);
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { ok: false, error: 'Não encontrei o usuário.' };

  const disponiveis = await suggestableStories(undefined, db);
  const cobertura = pillarCoverage(disponiveis.map((s) => ({ pillar: s.pillar, status: s.status })));
  const foco = await pickFocus(cobertura, db);

  const stories: PlannerStory[] = disponiveis.map((s) => ({
    id: s.id,
    title: s.title,
    pillar: s.pillar,
    ready: s.status === 'ready_to_record',
    eligible: true,
    seriesId: s.seriesId,
  }));

  // Prazos comerciais reais: uma entrega combinada ganha ao plano orgânico.
  const { data: prazos } = await db
    .from('creator_content_idea')
    .select('id, title, plan_date')
    .not('collaboration_id', 'is', null)
    .in('status', ['saved', 'planned'])
    .gte('plan_date', localDay(now))
    .lte('plan_date', localDay(new Date(now.getTime() + 7 * 86400_000)))
    .limit(4);

  const plan = planWeek({
    weekStart: weekStart(now),
    primaryPillar: foco,
    coverage: cobertura,
    stories,
    commercialDeadlines: (prazos ?? []).map((p) => ({ contentId: p.id, title: p.title, dueAt: p.plan_date })),
    capacity: opts.capacity,
  });

  // O portão que impede um slot inventado de chegar à base.
  const valido = validateSlots(plan.slots, {
    storyIds: stories.map((s) => s.id),
    contentIds: (prazos ?? []).map((p) => p.id),
  });
  if (!valido.ok) return { ok: false, error: 'O plano apontava para conteúdo que não existe. Não gravei nada.' };

  const { data: gravado, error } = await db
    .from('content_week_plan')
    .upsert(
      {
        app_user_id: me.id,
        week_start: plan.weekStart,
        primary_pillar: plan.primaryPillar,
        rationale: plan.rationale,
        status: 'active',
        gaps: asJson(plan.gaps),
        source_version: 'CAROL_CONTENT_BRAIN_V1',
      },
      { onConflict: 'app_user_id,week_start' },
    )
    .select('id')
    .maybeSingle();

  if (error || !gravado) return { ok: false, error: error?.message ?? 'Não consegui gravar o plano.' };

  await db.from('content_week_slot').delete().eq('plan_id', gravado.id).eq('status', 'open');
  if (plan.slots.length) {
    await db.from('content_week_slot').insert(
      plan.slots.map((s) => ({
        plan_id: gravado.id,
        slot_order: s.order,
        kind: s.kind,
        pillar: s.pillar,
        purpose: s.purpose,
        story_id: s.kind === 'story' ? s.storyId : null,
        content_idea_id: s.kind === 'content' ? s.contentId : null,
        reason: s.kind === 'map_pillar' ? s.reason : '',
      })),
    );
  }

  return { ok: true, plan };
}

/* ── Decisão do dia ───────────────────────────────────────────────────────── */

export async function todayContentDecision(now = new Date(), client_?: Db): Promise<ContentDecision | null> {
  const db = await client(client_);

  const [disponiveis, plano, contagens, candidatos, sinais] = await Promise.all([
    suggestableStories(undefined, db),
    currentWeekPlan(now, db),
    instagramCountsSafe(),
    db.from('content_story_candidate').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db.from('content_learning').select('id', { count: 'exact', head: true }).eq('ladder_state', 'hypothesis').eq('active', true),
  ]);

  const cobertura = pillarCoverage(disponiveis.map((s) => ({ pillar: s.pillar, status: s.status })));
  const foco = plano?.primaryPillar ?? (await pickFocus(cobertura, db));

  return contentDecision({
    primaryPillar: foco,
    coverage: cobertura,
    developing: disponiveis.filter((s) => s.status !== 'ready_to_record').length,
    readyToRecord: disponiveis.filter((s) => s.status === 'ready_to_record').length,
    unlinkedMedia: contagens.unlinkedMedia,
    trialUnknown: contagens.trialUnknown,
    openCandidates: candidatos.count ?? 0,
    signalsNeedingDecision: sinais.count ?? 0,
    weekCovered: Boolean(plano && !plano.mappingOnly),
  });
}

/** As contagens do Instagram, sem deixar uma integração desligada derrubar o
 *  Hoje. Sem Instagram o Content Brain continua a funcionar. */
async function instagramCountsSafe(): Promise<{ unlinkedMedia: number; trialUnknown: number }> {
  try {
    const { instagramCounts } = await import('@/modules/integrations/instagram/service');
    const c = await instagramCounts();
    return { unlinkedMedia: c.unlinkedMedia, trialUnknown: c.trialUnknown };
  } catch {
    return { unlinkedMedia: 0, trialUnknown: 0 };
  }
}

/* ── Séries ───────────────────────────────────────────────────────────────── */

export type SeriesSuggestion = {
  storyIds: string[];
  titles: string[];
  premise: string;
  arc: string;
  mechanism: string;
  because: string;
  strength: 'suggest' | 'strong';
};

/** Procura continuidade real entre histórias confirmadas.
 *
 *  A IA propõe o agrupamento; a elegibilidade é decidida pelo domínio, e um
 *  cluster que não passe não é mostrado. */
export async function detectSeriesCandidates(client_?: Db): Promise<SeriesSuggestion[]> {
  const db = await client(client_);
  const stories = await suggestableStories(undefined, db);
  if (stories.length < SERIES_POLICY_V1.minStories) return [];

  const { data: emSerie } = await db.from('creator_story').select('id').not('series_id', 'is', null);
  const jaEmSerie = new Set((emSerie ?? []).map((s) => s.id));
  const livres = stories.filter((s) => !jaEmSerie.has(s.id));
  if (livres.length < SERIES_POLICY_V1.minStories) return [];

  const r = await runPrompt(
    detectSeriesPrompt,
    {
      stories: livres
        .map((s) => `id=${s.id} | ${s.title} | pilar=${s.pillar ?? '?'} | territórios=${s.territories.join(',') || '?'} | ${s.summary.slice(0, 140)}`)
        .join('\n'),
    },
    { entityType: 'content_series', entityId: null },
  );
  if (!r.ok) return [];

  const porId = new Map(livres.map((s) => [s.id, s]));
  const out: SeriesSuggestion[] = [];

  for (const c of r.output.clusters) {
    // Só ids que existem. Um cluster que invente um id é descartado.
    const validos = c.story_ids.filter((id) => porId.has(id));
    const elegivel = seriesEligibility(
      validos.map((id) => {
        const s = porId.get(id)!;
        return {
          storyId: s.id,
          title: s.title,
          pillar: s.pillar,
          territories: s.territories,
          factConfirmed: s.factStatus === 'confirmed',
          allowedForContent: s.allowedForContent,
          occurredAt: s.occurredAt,
        };
      }),
    );
    if (!elegivel.ok) continue;

    out.push({
      storyIds: elegivel.storyIds,
      titles: elegivel.storyIds.map((id) => porId.get(id)!.title),
      premise: c.premise,
      arc: c.arc,
      mechanism: c.mechanism,
      because: elegivel.because,
      strength: elegivel.strength,
    });
  }

  return out;
}

export async function adoptSeries(input: { storyIds: string[]; name: string; premise: string; arc: string; mechanism: string }): Promise<{ ok: true; seriesId: string } | { ok: false; error: string }> {
  const db = await client();

  const { data: existentes } = await db.from('creator_story').select('id').in('id', input.storyIds);
  const conhecidos = (existentes ?? []).map((s) => s.id);

  // Nenhum episódio sem história real. Um id inventado é recusado aqui.
  const { accepted } = acceptEpisodes(input.storyIds.map((storyId) => ({ storyId })), conhecidos);
  if (accepted.length < SERIES_POLICY_V1.minStories) {
    return { ok: false, error: 'Preciso de pelo menos duas histórias reais confirmadas para abrir uma série.' };
  }

  const { data, error } = await db
    .from('content_series')
    .insert({
      name: input.name,
      premise: input.premise,
      structure: input.arc,
      arc: input.arc,
      mechanism: input.mechanism,
      origin: 'real_story_cluster',
      story_count: accepted.length,
      no_invented_episodes: true,
      status: 'active',
      kind: 'story_cluster',
    })
    .select('id')
    .maybeSingle();

  if (error || !data) return { ok: false, error: error?.message ?? 'Não consegui criar a série.' };

  await db.from('creator_story').update({ series_id: data.id }).in('id', accepted.map((a) => a.storyId!));
  return { ok: true, seriesId: data.id };
}

/* ── Candidatos proativos ─────────────────────────────────────────────────── */

/** Varre eventos comerciais seguros e propõe «talvez valha guardar».
 *
 *  Nada aqui vira conteúdo. O que sai é uma pergunta de significado, e só
 *  depois de ela responder é que nasce uma história. */
export async function deriveStoryCandidates(now = new Date()): Promise<{ created: number; skipped: number; failures: string[] }> {
  const db = supabaseService();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { created: 0, skipped: 0, failures: ['Não encontrei o usuário.'] };

  const [{ data: vistos }, { data: recentes }] = await Promise.all([
    db.from('content_story_candidate').select('dedupe_key').limit(500),
    db.from('content_story_candidate').select('source, brand_id, created_at').order('created_at', { ascending: false }).limit(60),
  ]);

  const ctx = {
    seenKeys: (vistos ?? []).map((v) => v.dedupe_key),
    recent: (recentes ?? []).map((r) => ({ source: r.source as CandidateSource, brandId: r.brand_id, at: r.created_at })),
    now,
  };

  const eventos: EventInput[] = [];
  const desde = new Date(now.getTime() - 7 * 86400_000).toISOString();

  // Marcas que responderam. O fato é a resposta existir, não o que dizia — o
  // conteúdo do email é dado não confiável e não entra no cartão em bruto.
  const { data: respostas } = await db
    .from('activity_event')
    .select('id, brand_id, summary, occurred_at, event_type, brand:brand(name)')
    .in('event_type', ['message.received', 'opportunity.stage_changed', 'payment.received'])
    .gte('occurred_at', desde)
    .order('occurred_at', { ascending: false })
    .limit(20);

  for (const e of respostas ?? []) {
    const marca = (e.brand as { name?: string } | null)?.name ?? null;
    const source: CandidateSource =
      e.event_type === 'payment.received' ? 'payment' : e.event_type === 'opportunity.stage_changed' ? 'opportunity_stage' : 'brand_reply';
    eventos.push({
      source,
      externalKey: e.id,
      brandId: e.brand_id,
      brandName: marca,
      fact: e.summary,
      occurredAt: e.occurred_at,
      evidenceRefs: [e.id],
    });
  }

  const elegiveis: StoryCandidate[] = [];
  for (const e of eventos) {
    const r = candidateFor(e, ctx);
    if (r.ok) elegiveis.push(r.candidate);
  }
  const candidatos = consolidate(elegiveis).slice(0, MAX_CANDIDATES_PER_DAY);

  const falhas: string[] = [];
  let criados = 0;

  for (const c of candidatos) {
    const { error } = await db.from('content_story_candidate').upsert(
      {
        app_user_id: me.id,
        dedupe_key: c.dedupeKey,
        source: c.source,
        fact: c.fact,
        question: c.question,
        occurred_at: c.occurredAt,
        brand_id: c.brandId,
        brand_name: c.brandName,
        evidence_refs: asJson(c.evidenceRefs),
        status: 'open',
      },
      { onConflict: 'app_user_id,dedupe_key', ignoreDuplicates: true },
    );
    if (error) falhas.push(`candidato: ${error.message.slice(0, 140)}`);
    else criados += 1;
  }

  return { created: criados, skipped: eventos.length - candidatos.length, failures: falhas };
}

export type CandidateRow = {
  id: string;
  source: CandidateSource;
  fact: string;
  question: string;
  brandName: string | null;
  occurredAt: string;
};

export async function openCandidates(client_?: Db): Promise<CandidateRow[]> {
  const db = await client(client_);
  const { data } = await db
    .from('content_story_candidate')
    .select('id, source, fact, question, brand_name, occurred_at')
    .eq('status', 'open')
    .order('occurred_at', { ascending: false })
    .limit(6);

  return (data ?? []).map((r) => ({
    id: r.id,
    source: r.source as CandidateSource,
    fact: r.fact,
    question: r.question,
    brandName: r.brand_name,
    occurredAt: r.occurred_at,
  }));
}

/** A resposta dela. «Guardar» é o único caminho de um evento para uma
 *  história — e a história nasce restrita, à espera de confirmação factual. */
export async function decideCandidate(
  candidateId: string,
  decision: 'saved' | 'dismissed' | 'private',
): Promise<{ ok: true; storyId: string | null } | { ok: false; error: string }> {
  const db = await client();
  const { data: c } = await db
    .from('content_story_candidate')
    .select('id, fact, source, brand_name, occurred_at, evidence_refs')
    .eq('id', candidateId)
    .maybeSingle();
  if (!c) return { ok: false, error: 'Não encontrei esse cartão.' };

  if (decision !== 'saved') {
    await db.from('content_story_candidate').update({ status: decision, decided_at: new Date().toISOString() }).eq('id', candidateId);
    return { ok: true, storyId: null };
  }

  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { ok: false, error: 'Não encontrei o usuário.' };

  const { data: story, error } = await db
    .from('creator_story')
    .insert({
      app_user_id: me.id,
      title: c.fact.slice(0, 80),
      summary: c.fact,
      source_type: c.source === 'payment' ? 'opportunity_event' : c.source === 'production_milestone' ? 'production_event' : 'gmail_event',
      occurred_at: c.occurred_at,
      factual_sequence: asJson([{ text: c.fact, confirmed: false }]),
      // Guardado por ela não é o mesmo que confirmado: continua a precisar da
      // confirmação factual e de ela dizer o que aquilo significou.
      privacy_level: 'restricted',
      allowed_for_content: false,
      fact_status: 'needs_confirmation',
      status: 'needs_confirmation',
      source_refs: asJson({ candidateId, evidence: c.evidence_refs }),
      provenance: asJson({ detectedBy: 'carolos', savedBy: 'carol', at: new Date().toISOString() }),
    })
    .select('id')
    .maybeSingle();

  if (error || !story) return { ok: false, error: error?.message ?? 'Não consegui salvar.' };

  await db
    .from('content_story_candidate')
    .update({ status: 'saved', story_id: story.id, decided_at: new Date().toISOString() })
    .eq('id', candidateId);

  return { ok: true, storyId: story.id };
}
