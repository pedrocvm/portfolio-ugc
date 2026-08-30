import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';
import { asJson } from '@/lib/supabase/json';
import { priorityScore } from '@/modules/actions/planner';
import { recordEvent, type Db } from '@/modules/activity/service';
import { refreshRelationship } from '@/modules/revenue/service';

/** Ciclo de vida da produção.
 *
 *  Uma oportunidade só vira colaboração com aceitação explícita — «adorámos a
 *  ideia» não é aceitação, e o redutor de etapas já garante isso. Aqui o que
 *  se garante é o outro lado: nada entra em produção com termos por fechar. */

export const COLLABORATION_STATUS = [
  'accepted', 'awaiting_terms', 'awaiting_product', 'awaiting_brief',
  'production_ready', 'in_production', 'delivered', 'in_revision',
  'approved', 'closed', 'cancelled',
] as const;

export type CollaborationStatus = (typeof COLLABORATION_STATUS)[number];

export const STATUS_LABEL: Record<CollaborationStatus, string> = {
  accepted: 'Aceite',
  awaiting_terms: 'À espera de termos',
  awaiting_product: 'À espera do produto',
  awaiting_brief: 'À espera do briefing',
  production_ready: 'Pronta para produzir',
  in_production: 'Em produção',
  delivered: 'Entregue',
  in_revision: 'Em revisão',
  approved: 'Aprovada',
  closed: 'Encerrada',
  cancelled: 'Cancelada',
};

export type CollaborationRow = {
  id: string;
  opportunityId: string;
  brandId: string;
  brandName: string;
  title: string;
  status: CollaborationStatus;
  compensationModel: string;
  deadlineAt: string | null;
  logisticsKind: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  trackingRef: string | null;
  accessStatus: string | null;
  paymentGate: string;
  gateBlockers: string[];
  revisionsIncluded: number | null;
  acceptedAt: string | null;
  notes: string;
};

const SELECT = `
  id, opportunity_id, brand_id, title, status, compensation_model, deadline_at,
  logistics_kind, shipped_at, received_at, tracking_ref, access_status,
  payment_gate, gate_blockers, revisions_included, accepted_at, notes,
  brand:brand_id ( name )
`;

type RawCollab = {
  id: string; opportunity_id: string; brand_id: string; title: string; status: string;
  compensation_model: string; deadline_at: string | null; logistics_kind: string | null;
  shipped_at: string | null; received_at: string | null; tracking_ref: string | null;
  access_status: string | null; payment_gate: string; gate_blockers: string[] | null;
  revisions_included: number | null; accepted_at: string | null; notes: string;
  brand: { name: string } | null;
};

const toCollab = (r: RawCollab): CollaborationRow => ({
  id: r.id,
  opportunityId: r.opportunity_id,
  brandId: r.brand_id,
  brandName: r.brand?.name ?? '—',
  title: r.title,
  status: r.status as CollaborationStatus,
  compensationModel: r.compensation_model,
  deadlineAt: r.deadline_at,
  logisticsKind: r.logistics_kind,
  shippedAt: r.shipped_at,
  receivedAt: r.received_at,
  trackingRef: r.tracking_ref,
  accessStatus: r.access_status,
  paymentGate: r.payment_gate,
  gateBlockers: r.gate_blockers ?? [],
  revisionsIncluded: r.revisions_included,
  acceptedAt: r.accepted_at,
  notes: r.notes,
});

export async function listCollaborations(): Promise<CollaborationRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('collaboration')
    .select(SELECT)
    .not('status', 'in', '(closed,cancelled)')
    .order('deadline_at', { nullsFirst: false });
  return ((data ?? []) as unknown as RawCollab[]).map(toCollab);
}

export async function getCollaboration(id: string): Promise<CollaborationRow | null> {
  const db = await supabaseServer();
  const { data } = await db.from('collaboration').select(SELECT).eq('id', id).maybeSingle();
  return data ? toCollab(data as unknown as RawCollab) : null;
}

/** O que ainda falta antes de valer a pena gravar. Se a Carol produzir sem
 *  isto resolvido, descobre o problema depois de a câmara já ter desligado. */
export function gateBlockers(c: {
  compensationModel: string;
  logisticsKind: string | null;
  receivedAt: string | null;
  accessStatus: string | null;
  hasBrief: boolean;
  hasRights: boolean;
  deadlineAt: string | null;
  paymentGate: string;
}): string[] {
  const blockers: string[] = [];

  if (c.compensationModel === 'unclear') blockers.push('Modelo de compensação por definir.');
  if (!c.deadlineAt) blockers.push('Sem prazo combinado.');
  if (!c.hasBrief) blockers.push('Briefing por receber ou por validar.');
  if (!c.hasRights) blockers.push('Direitos de uso por registar.');
  if (c.paymentGate === 'unresolved') blockers.push('Regra de pagamento por decidir.');

  if (c.logisticsKind === 'physical' && !c.receivedAt) blockers.push('Produto ainda não chegou.');
  if (c.logisticsKind === 'digital' && c.accessStatus !== 'ready') {
    blockers.push('Acesso ao produto digital ainda não está pronto.');
  }

  return blockers;
}

/** Cria a colaboração a partir de uma oportunidade fechada. */
export async function startCollaboration(
  opportunityId: string,
  actorUserId: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = await supabaseServer();
  const { data: opp } = await db
    .from('opportunity')
    .select('id, brand_id, stage, title, product_name, commercial_model, won_at')
    .eq('id', opportunityId)
    .maybeSingle();

  if (!opp) return { ok: false, error: 'Oportunidade não encontrada.' };
  if (opp.stage !== 'won') {
    return { ok: false, error: 'A produção só arranca depois de a oportunidade estar fechada.' };
  }

  const { data: existing } = await db
    .from('collaboration')
    .select('id')
    .eq('opportunity_id', opportunityId)
    .maybeSingle();
  if (existing) return { ok: true, id: existing.id };

  const { data, error } = await db
    .from('collaboration')
    .insert({
      opportunity_id: opportunityId,
      brand_id: opp.brand_id,
      title: opp.title || opp.product_name || 'Colaboração',
      status: 'accepted',
      compensation_model: opp.commercial_model === 'unclear' ? 'unclear' : opp.commercial_model,
      accepted_at: opp.won_at ?? new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: 'Não foi possível criar a colaboração.' };

  await recordEvent(db, {
    eventType: 'opportunity.won',
    brandId: opp.brand_id,
    opportunityId,
    collaborationId: data.id,
    actorType: 'carol',
    actorUserId,
    summary: 'Colaboração aberta a partir da oportunidade fechada.',
    payload: { collaborationId: data.id },
    dedupeKey: `collab:${data.id}:created`,
  });

  await refreshGate(db, data.id);
  return { ok: true, id: data.id };
}

/** Recalcula bloqueios e estado. Chamado depois de cada mudança para o painel
 *  nunca mostrar «pronta a gravar» com o produto ainda em trânsito. */
export async function refreshGate(db: Db, collaborationId: string) {
  const { data: c } = await db
    .from('collaboration')
    .select('id, brand_id, opportunity_id, status, compensation_model, logistics_kind, received_at, access_status, deadline_at, payment_gate')
    .eq('id', collaborationId)
    .maybeSingle();
  if (!c) return;

  const [{ data: brief }, { data: rights }] = await Promise.all([
    db.from('brief').select('id, status').eq('collaboration_id', collaborationId)
      .eq('status', 'validated').limit(1).maybeSingle(),
    db.from('rights_license').select('id').eq('collaboration_id', collaborationId).limit(1).maybeSingle(),
  ]);

  const blockers = gateBlockers({
    compensationModel: c.compensation_model,
    logisticsKind: c.logistics_kind,
    receivedAt: c.received_at,
    accessStatus: c.access_status,
    hasBrief: Boolean(brief),
    hasRights: Boolean(rights),
    deadlineAt: c.deadline_at,
    paymentGate: c.payment_gate,
  });

  // Só o estado de espera é derivado. Depois de a produção arrancar, quem
  // manda é a Carol: um cálculo automático não pode fazer recuar «entregue».
  const derived: CollaborationStatus | null =
    c.status === 'accepted' || c.status === 'awaiting_terms' || c.status === 'awaiting_product' ||
    c.status === 'awaiting_brief' || c.status === 'production_ready'
      ? blockers.length === 0
        ? 'production_ready'
        : blockers.some((b) => b.includes('produto') || b.includes('Acesso'))
          ? 'awaiting_product'
          : blockers.some((b) => b.includes('Briefing'))
            ? 'awaiting_brief'
            : 'awaiting_terms'
      : null;

  await db
    .from('collaboration')
    .update({ gate_blockers: blockers, ...(derived ? { status: derived } : {}) })
    .eq('id', collaborationId);

  if (blockers.length && derived !== 'production_ready') {
    await db.from('action_item').upsert(
      {
        collaboration_id: collaborationId,
        brand_id: c.brand_id,
        opportunity_id: c.opportunity_id,
        type: blockers.some((b) => b.includes('Briefing')) ? ('request_brief' as const) : ('start_production' as const),
        title: `Destravar produção: ${blockers[0]}`,
        reason: blockers.join(' '),
        evidence: asJson({ collaborationId, blockers }),
        risk: 'medium' as const,
        due_at: c.deadline_at ? `${c.deadline_at}T12:00:00Z` : null,
        priority_score: priorityScore({ type: 'start_production', risk: 'medium', dueAt: c.deadline_at }),
        status: 'open' as const,
        requires_approval: false,
        dedupe_key: `collab:${collaborationId}:gate`,
      },
      { onConflict: 'dedupe_key' },
    );
  } else {
    await db.from('action_item').update({ status: 'done' }).eq('dedupe_key', `collab:${collaborationId}:gate`);
  }
}

export async function updateCollaboration(
  collaborationId: string,
  patch: {
    status?: CollaborationStatus;
    compensationModel?: string;
    deadlineAt?: string | null;
    logisticsKind?: 'physical' | 'digital' | 'none' | null;
    shippedAt?: string | null;
    receivedAt?: string | null;
    trackingRef?: string | null;
    accessStatus?: 'required' | 'requested' | 'granted' | 'ready' | null;
    paymentGate?: 'unresolved' | 'none' | 'deposit' | 'full_upfront' | 'on_delivery';
    revisionsIncluded?: number | null;
    notes?: string;
  },
  actorUserId: string,
) {
  const db = await supabaseServer();
  const { data: before } = await db
    .from('collaboration')
    .select('brand_id, opportunity_id, received_at, status')
    .eq('id', collaborationId)
    .maybeSingle();

  await db
    .from('collaboration')
    .update({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.compensationModel ? { compensation_model: patch.compensationModel } : {}),
      ...(patch.deadlineAt !== undefined ? { deadline_at: patch.deadlineAt } : {}),
      ...(patch.logisticsKind !== undefined ? { logistics_kind: patch.logisticsKind } : {}),
      ...(patch.shippedAt !== undefined ? { shipped_at: patch.shippedAt } : {}),
      ...(patch.receivedAt !== undefined ? { received_at: patch.receivedAt } : {}),
      ...(patch.trackingRef !== undefined ? { tracking_ref: patch.trackingRef } : {}),
      ...(patch.accessStatus !== undefined ? { access_status: patch.accessStatus } : {}),
      ...(patch.paymentGate ? { payment_gate: patch.paymentGate } : {}),
      ...(patch.revisionsIncluded !== undefined ? { revisions_included: patch.revisionsIncluded } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.status === 'closed' ? { closed_at: new Date().toISOString() } : {}),
    })
    .eq('id', collaborationId);

  // Receber o produto é o arranque real do relógio de produção.
  if (patch.receivedAt && !before?.received_at) {
    await recordEvent(db, {
      eventType: 'product.received',
      brandId: before?.brand_id ?? null,
      opportunityId: before?.opportunity_id ?? null,
      collaborationId,
      actorType: 'carol',
      actorUserId,
      summary: `Produto recebido a ${patch.receivedAt}.`,
      payload: { receivedAt: patch.receivedAt },
      dedupeKey: `collab:${collaborationId}:received`,
    });
  }

  if (patch.shippedAt) {
    await recordEvent(db, {
      eventType: 'product.shipped',
      brandId: before?.brand_id ?? null,
      collaborationId,
      actorType: 'brand',
      summary: `Produto enviado a ${patch.shippedAt}.`,
      payload: { shippedAt: patch.shippedAt, tracking: patch.trackingRef ?? null },
      dedupeKey: `collab:${collaborationId}:shipped`,
    });
  }

  if (patch.accessStatus === 'ready') {
    await recordEvent(db, {
      eventType: 'access.granted',
      brandId: before?.brand_id ?? null,
      collaborationId,
      actorType: 'brand',
      summary: 'Acesso ao produto digital pronto.',
      payload: {},
      dedupeKey: `collab:${collaborationId}:access`,
    });
  }

  if (patch.status === 'closed' && before?.brand_id) await refreshRelationship(db, before.brand_id);
  await refreshGate(db, collaborationId);
}

/** ── Entregas e revisões ───────────────────────────────────────────────── */

export async function recordDelivery(input: {
  collaborationId: string;
  contentAssetId?: string | null;
  assetUrl: string;
  recipient: string;
  channel: string;
  actorUserId: string;
}) {
  const db = await supabaseServer();
  const { data: last } = await db
    .from('deliverable')
    .select('version')
    .eq('collaboration_id', input.collaborationId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (last?.version ?? 0) + 1;
  const { data, error } = await db
    .from('deliverable')
    .insert({
      collaboration_id: input.collaborationId,
      content_asset_id: input.contentAssetId ?? null,
      version,
      asset_url: input.assetUrl,
      delivered_at: new Date().toISOString(),
      recipient: input.recipient,
      channel: input.channel,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false as const, error: 'Não foi possível registar a entrega.' };

  const { data: c } = await db
    .from('collaboration')
    .select('brand_id, opportunity_id')
    .eq('id', input.collaborationId)
    .maybeSingle();

  await db.from('collaboration').update({ status: 'delivered' }).eq('id', input.collaborationId);

  await recordEvent(db, {
    eventType: 'content.delivered',
    brandId: c?.brand_id ?? null,
    opportunityId: c?.opportunity_id ?? null,
    collaborationId: input.collaborationId,
    actorType: 'carol',
    actorUserId: input.actorUserId,
    summary: `Versão ${version} entregue a ${input.recipient}.`,
    payload: { deliverableId: data.id, version, assetUrl: input.assetUrl },
    dedupeKey: `deliverable:${data.id}:delivered`,
  });

  return { ok: true as const, id: data.id, version };
}

/** Uma revisão é classificada contra o âmbito acordado. Tratar tudo como
 *  incluído é como o scope creep entra sem ninguém dar por ela. */
export async function recordFeedback(input: {
  deliverableId: string;
  feedback: string;
  classification: 'in_scope' | 'subjective' | 'brief_change' | 'new_deliverable';
  actorUserId: string;
}) {
  const db = await supabaseServer();
  const { data } = await db
    .from('deliverable')
    .update({
      feedback: input.feedback,
      feedback_class: input.classification,
      approval_status: 'revision_requested',
    })
    .eq('id', input.deliverableId)
    .select('collaboration_id, version')
    .maybeSingle();

  if (!data) return;

  const { data: c } = await db
    .from('collaboration')
    .select('brand_id, opportunity_id, revisions_included')
    .eq('id', data.collaboration_id)
    .maybeSingle();

  await db.from('collaboration').update({ status: 'in_revision' }).eq('id', data.collaboration_id);

  const outOfScope = input.classification === 'brief_change' || input.classification === 'new_deliverable';

  await recordEvent(db, {
    eventType: 'revision.requested',
    brandId: c?.brand_id ?? null,
    opportunityId: c?.opportunity_id ?? null,
    collaborationId: data.collaboration_id,
    actorType: 'brand',
    actorUserId: input.actorUserId,
    summary: outOfScope
      ? `Revisão fora do âmbito (${input.classification}): é uma nova negociação, não uma correção.`
      : `Revisão dentro do âmbito na versão ${data.version}.`,
    payload: { deliverableId: input.deliverableId, classification: input.classification, outOfScope },
  });
}

export async function approveDelivery(deliverableId: string, actorUserId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('deliverable')
    .update({ approval_status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', deliverableId)
    .select('collaboration_id, version, content_asset_id')
    .maybeSingle();

  if (!data) return;

  const { data: c } = await db
    .from('collaboration')
    .select('brand_id, opportunity_id')
    .eq('id', data.collaboration_id)
    .maybeSingle();

  await db.from('collaboration').update({ status: 'approved' }).eq('id', data.collaboration_id);
  if (data.content_asset_id) {
    await db.from('content_asset').update({ status: 'approved' }).eq('id', data.content_asset_id);
  }

  await recordEvent(db, {
    eventType: 'content.approved',
    brandId: c?.brand_id ?? null,
    opportunityId: c?.opportunity_id ?? null,
    collaborationId: data.collaboration_id,
    actorType: 'brand',
    actorUserId,
    summary: `Versão ${data.version} aprovada.`,
    payload: { deliverableId },
    dedupeKey: `deliverable:${deliverableId}:approved`,
  });

  // A aprovação abre o encerramento: case, métricas, direitos, upsell. É aqui
  // que um projecto deixa de morrer na entrega.
  await db.from('action_item').upsert(
    {
      collaboration_id: data.collaboration_id,
      brand_id: c?.brand_id ?? null,
      opportunity_id: c?.opportunity_id ?? null,
      type: 'request_metrics' as const,
      title: 'Fechar o ciclo: feedback, métricas e permissão de portfólio',
      reason:
        'O trabalho foi aprovado. Sem métricas e sem permissão, a entrega não vira prova comercial nem sobe o preço da próxima.',
      evidence: asJson({ deliverableId }),
      risk: 'none' as const,
      priority_score: priorityScore({ type: 'request_metrics' }),
      status: 'open' as const,
      requires_approval: true,
      dedupe_key: `collab:${data.collaboration_id}:closeout`,
    },
    { onConflict: 'dedupe_key' },
  );
}

export async function deliverablesFor(collaborationId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('deliverable')
    .select('id, version, asset_url, delivered_at, recipient, channel, feedback, feedback_class, approval_status, approved_at')
    .eq('collaboration_id', collaborationId)
    .order('version', { ascending: false });
  return data ?? [];
}
