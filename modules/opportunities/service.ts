import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';
import { recordEvent, touchActivity, type Db } from '@/modules/activity/service';
import {
  STAGE_LABEL, isClosed, isOpen, reduceStage, violations,
  type CommercialModel, type Stage, type StageSignal,
} from './domain';

/** A etapa como ela a lê na linha do tempo.
 *
 *  «Etapa: replied → proposal» é um identificador da base numa frase, e a
 *  linha do tempo é texto que ela lê. O rótulo já existia e era usado nas
 *  telas; faltava aqui, onde a frase é escrita e fica salva para sempre. */
const nomeDaEtapa = (stage: string): string =>
  (STAGE_LABEL[stage as Stage] ?? stage).toLowerCase();

export type OpportunityRow = {
  id: string;
  brandId: string;
  brandName: string;
  brandFitScore: number | null;
  primaryContactId: string | null;
  title: string;
  stage: Stage;
  commercialModel: CommercialModel;
  priority: 'A' | 'B' | 'C';
  source: string | null;
  productName: string;
  expectedCashCents: number | null;
  barterValueCents: number | null;
  currency: string;
  nextActionText: string;
  nextActionDueAt: string | null;
  waitingUntil: string | null;
  waitingReason: string | null;
  lossReason: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT = `
  id, brand_id, primary_contact_id, title, stage, commercial_model, priority, source,
  product_name, expected_cash_cents, barter_value_to_carol_cents, currency,
  next_action_text, next_action_due_at, waiting_until, waiting_reason, loss_reason,
  won_at, lost_at, last_activity_at, created_at, updated_at,
  brand:brand_id ( name, fit_score )
`;

type RawOpportunity = {
  id: string; brand_id: string; primary_contact_id: string | null; title: string; stage: string;
  commercial_model: string; priority: string; source: string | null; product_name: string;
  expected_cash_cents: number | null; barter_value_to_carol_cents: number | null; currency: string;
  next_action_text: string; next_action_due_at: string | null; waiting_until: string | null;
  waiting_reason: string | null; loss_reason: string | null; won_at: string | null;
  lost_at: string | null; last_activity_at: string | null; created_at: string; updated_at: string;
  brand: { name: string; fit_score: number | null } | null;
};

const toOpportunity = (r: RawOpportunity): OpportunityRow => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand?.name ?? '—',
  brandFitScore: r.brand?.fit_score ?? null,
  primaryContactId: r.primary_contact_id,
  title: r.title,
  stage: r.stage as Stage,
  commercialModel: r.commercial_model as CommercialModel,
  priority: r.priority as 'A' | 'B' | 'C',
  source: r.source,
  productName: r.product_name,
  expectedCashCents: r.expected_cash_cents,
  barterValueCents: r.barter_value_to_carol_cents,
  currency: r.currency,
  nextActionText: r.next_action_text,
  nextActionDueAt: r.next_action_due_at,
  waitingUntil: r.waiting_until,
  waitingReason: r.waiting_reason,
  lossReason: r.loss_reason,
  wonAt: r.won_at,
  lostAt: r.lost_at,
  lastActivityAt: r.last_activity_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listOpportunities(filter?: { stages?: Stage[] }): Promise<OpportunityRow[]> {
  const db = await supabaseServer();
  let query = db.from('opportunity').select(SELECT);
  if (filter?.stages?.length) query = query.in('stage', filter.stages);
  const { data } = await query.order('last_activity_at', { ascending: false, nullsFirst: false });
  return ((data ?? []) as unknown as RawOpportunity[]).map(toOpportunity);
}

export async function getOpportunity(id: string): Promise<OpportunityRow | null> {
  const db = await supabaseServer();
  const { data } = await db.from('opportunity').select(SELECT).eq('id', id).maybeSingle();
  return data ? toOpportunity(data as unknown as RawOpportunity) : null;
}

export async function opportunitiesForBrand(brandId: string): Promise<OpportunityRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('opportunity')
    .select(SELECT)
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown as RawOpportunity[]).map(toOpportunity);
}

/** Uma marca pode ter várias oportunidades ao longo do tempo, mas só uma
 *  ativa de cada vez por defeito: uma conversa nova sobre o mesmo produto é
 *  continuação, não um segundo negócio. */
export async function activeOpportunityFor(db: Db, brandId: string): Promise<string | null> {
  const { data } = await db
    .from('opportunity')
    .select('id')
    .eq('brand_id', brandId)
    .not('stage', 'in', '(won,lost)')
    .order('last_activity_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function ensureOpportunity(
  db: Db,
  brandId: string,
  input: { title: string; source: string; productName?: string; contactId?: string | null },
): Promise<{ id: string; created: boolean }> {
  const existing = await activeOpportunityFor(db, brandId);
  if (existing) return { id: existing, created: false };

  const { data, error } = await db
    .from('opportunity')
    .insert({
      brand_id: brandId,
      primary_contact_id: input.contactId ?? null,
      title: input.title,
      stage: 'discovered',
      source: input.source,
      product_name: input.productName ?? '',
      last_activity_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`Não foi possível criar a oportunidade: ${error?.message}`);
  return { id: data.id, created: true };
}

export type StageChange = {
  applied: boolean;
  from: Stage;
  to: Stage;
  reason: string;
  needsApproval: boolean;
};

/** Aplica o redutor. Uma transição que o domínio marca como não aplicável
 *  automaticamente fica em proposta: o evento é registado, o estado não muda,
 *  e o Hoje mostra-a como decisão a tomar. */
export async function applyStageSignal(
  db: Db,
  opportunityId: string,
  signal: StageSignal,
  options: { autoApply: boolean; eventId?: string | null; occurredAt?: string },
): Promise<StageChange | null> {
  const { data: current } = await db
    .from('opportunity')
    .select('id, brand_id, stage, won_at, lost_at, loss_reason, next_action_text, next_action_due_at, waiting_until')
    .eq('id', opportunityId)
    .maybeSingle();
  if (!current) return null;

  const from = current.stage as Stage;
  const transition = reduceStage(from, signal);
  if (!transition || transition.to === from) return null;

  const shouldApply = options.autoApply && transition.autoApplicable;
  const at = options.occurredAt ?? new Date().toISOString();

  await recordEvent(db, {
    eventType: 'opportunity.stage_changed',
    occurredAt: at,
    brandId: current.brand_id,
    opportunityId,
    actorType: shouldApply ? 'system' : 'ai',
    summary: shouldApply
      ? `Etapa: ${nomeDaEtapa(from)} → ${nomeDaEtapa(transition.to)}. ${transition.reason}`
      : `Sugestão de etapa: ${nomeDaEtapa(from)} → ${nomeDaEtapa(transition.to)}. ${transition.reason}`,
    payload: {
      from,
      to: transition.to,
      reason: transition.reason,
      applied: shouldApply,
      triggerEventId: options.eventId ?? null,
      signal: { ...signal },
    },
    confidence: signal.confidence ?? null,
  });

  if (shouldApply) {
    await db
      .from('opportunity')
      .update({
        stage: transition.to,
        last_activity_at: at,
        ...(transition.to === 'won' ? { won_at: at } : {}),
        ...(transition.to === 'lost'
          ? { lost_at: at, loss_reason: signal.rejectionReason ?? transition.reason }
          : {}),
      })
      .eq('id', opportunityId);
  }

  return {
    applied: shouldApply,
    from,
    to: transition.to,
    reason: transition.reason,
    needsApproval: !transition.autoApplicable,
  };
}

export async function setStageManually(
  opportunityId: string,
  to: Stage,
  reason: string,
  actorUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = await supabaseServer();
  const { data: current } = await db
    .from('opportunity')
    .select('id, brand_id, stage, next_action_text, next_action_due_at, waiting_until, won_at, lost_at')
    .eq('id', opportunityId)
    .maybeSingle();
  if (!current) return { ok: false, error: 'Oportunidade não encontrada.' };

  const at = new Date().toISOString();
  const wonAt = to === 'won' ? (current.won_at ?? at) : null;
  const lostAt = to === 'lost' ? (current.lost_at ?? at) : null;
  const lossReason = to === 'lost' ? reason || 'Decisão manual sem motivo escrito.' : null;

  const patch = {
    stage: to,
    last_activity_at: at,
    won_at: wonAt,
    lost_at: lostAt,
    ...(to === 'lost' ? { loss_reason: lossReason } : {}),
  };

  const problems = violations({
    stage: to,
    wonAt,
    lostAt,
    lossReason,
    nextActionText: current.next_action_text,
    nextActionDueAt: current.next_action_due_at,
    waitingUntil: current.waiting_until,
  });
  // A falta de próxima ação não bloqueia uma decisão manual: o planeador
  // resolve isso a seguir. Faltar um motivo de perda, sim.
  const blocking = problems.filter((p) => p.includes('motivo'));
  if (blocking.length) return { ok: false, error: blocking[0] };

  const { error } = await db.from('opportunity').update(patch).eq('id', opportunityId);
  if (error) return { ok: false, error: 'Não foi possível gravar a etapa.' };

  await recordEvent(db, {
    eventType:
      to === 'won' ? 'opportunity.won' : to === 'lost' ? 'opportunity.lost' : 'opportunity.stage_changed',
    brandId: current.brand_id,
    opportunityId,
    actorType: 'carol',
    actorUserId,
    summary: `Etapa alterada à mão: ${nomeDaEtapa(current.stage)} → ${nomeDaEtapa(to)}.${reason ? ` ${reason}` : ''}`,
    payload: { from: current.stage, to, reason, manual: true },
  });

  await touchActivity(db, { brandId: current.brand_id, opportunityId }, at);
  return { ok: true };
}

export async function setWaiting(
  opportunityId: string,
  until: string | null,
  reason: string,
  actorUserId: string,
) {
  const db = await supabaseServer();
  const { data: opp } = await db
    .from('opportunity')
    .select('brand_id')
    .eq('id', opportunityId)
    .maybeSingle();

  await db
    .from('opportunity')
    .update({ waiting_until: until, waiting_reason: until ? reason : null })
    .eq('id', opportunityId);

  await recordEvent(db, {
    eventType: 'opportunity.nurtured',
    brandId: opp?.brand_id ?? null,
    opportunityId,
    actorType: 'carol',
    actorUserId,
    summary: until ? `Em espera até ${until.slice(0, 10)}. ${reason}` : 'Espera removida.',
    payload: { waitingUntil: until, reason },
  });
}

export const openStagesFilter = () =>
  (['discovered', 'qualified', 'outreach', 'replied', 'commercial_qualification', 'proposal', 'negotiation'] as Stage[]);

export { isOpen, isClosed };
