import 'server-only';

import type { Flags } from '@/lib/flags';
import { aiTaskEnabled } from '@/lib/flags';
import { daysBetween } from '@/lib/time';
import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { priorityScore } from '@/modules/actions/planner';
import { recordEvent, type Db } from '@/modules/activity/service';
import { runPrompt } from '@/modules/ai/gateway';
import { upsellScan } from '@/modules/ai/prompts/registry';

/** Receita, LTV e upsell.
 *
 *  Valor de produto e dinheiro vivem em colunas separadas e nunca se somam:
 *  contar uma permuta como receita é a forma mais rápida de a Carol achar que
 *  está ganhando mais do que ganha. */

export type PaymentRow = {
  id: string;
  brandId: string;
  brandName: string;
  collaborationId: string | null;
  kind: string;
  amountCents: number;
  currency: string;
  dueAt: string | null;
  paidAt: string | null;
  status: string;
  invoiceRef: string;
};

const SELECT = `
  id, brand_id, collaboration_id, kind, amount_cents, currency, due_at, paid_at,
  status, invoice_ref, brand:brand_id ( name )
`;

type RawPayment = {
  id: string; brand_id: string; collaboration_id: string | null; kind: string;
  amount_cents: number; currency: string; due_at: string | null; paid_at: string | null;
  status: string; invoice_ref: string; brand: { name: string } | null;
};

const toPayment = (r: RawPayment): PaymentRow => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand?.name ?? '—',
  collaborationId: r.collaboration_id,
  kind: r.kind,
  amountCents: r.amount_cents,
  currency: r.currency,
  dueAt: r.due_at,
  paidAt: r.paid_at,
  status: r.status,
  invoiceRef: r.invoice_ref,
});

export async function listPayments(): Promise<PaymentRow[]> {
  const db = await supabaseServer();
  const { data } = await db.from('payment').select(SELECT).order('due_at', { nullsFirst: false });
  return ((data ?? []) as unknown as RawPayment[]).map(toPayment);
}

export type RevenueSummary = {
  paidCents: number;
  outstandingCents: number;
  overdueCents: number;
  /** Valor de permuta. Nunca somado ao dinheiro. */
  barterValueCents: number;
  usageRevenueCents: number;
  byBrand: { brandName: string; cashCents: number; barterCents: number }[];
};

export async function revenueSummary(): Promise<RevenueSummary> {
  const payments = await listPayments();
  const today = new Date().toISOString().slice(0, 10);

  const cash = payments.filter((p) => p.kind !== 'barter');
  const barter = payments.filter((p) => p.kind === 'barter');

  const byBrand = new Map<string, { cashCents: number; barterCents: number }>();
  for (const p of payments) {
    const entry = byBrand.get(p.brandName) ?? { cashCents: 0, barterCents: 0 };
    if (p.kind === 'barter') entry.barterCents += p.amountCents;
    else if (p.status === 'paid') entry.cashCents += p.amountCents;
    byBrand.set(p.brandName, entry);
  }

  return {
    paidCents: cash.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amountCents, 0),
    outstandingCents: cash.filter((p) => p.status !== 'paid' && p.status !== 'written_off')
      .reduce((s, p) => s + p.amountCents, 0),
    overdueCents: cash
      .filter((p) => p.status !== 'paid' && p.status !== 'written_off' && p.dueAt && p.dueAt < today)
      .reduce((s, p) => s + p.amountCents, 0),
    barterValueCents: barter.reduce((s, p) => s + p.amountCents, 0),
    usageRevenueCents: cash.filter((p) => p.kind === 'usage_license' && p.status === 'paid')
      .reduce((s, p) => s + p.amountCents, 0),
    byBrand: [...byBrand]
      .map(([brandName, v]) => ({ brandName, ...v }))
      .sort((a, b) => b.cashCents - a.cashCents),
  };
}

export async function recordPayment(input: {
  brandId: string;
  collaborationId?: string | null;
  opportunityId?: string | null;
  kind: 'cash' | 'reimbursement' | 'barter' | 'usage_license';
  amountCents: number;
  dueAt?: string | null;
  invoiceRef?: string;
  actorUserId: string;
}) {
  const db = await supabaseServer();
  const { data, error } = await db
    .from('payment')
    .insert({
      brand_id: input.brandId,
      collaboration_id: input.collaborationId ?? null,
      opportunity_id: input.opportunityId ?? null,
      kind: input.kind,
      amount_cents: input.amountCents,
      due_at: input.dueAt ?? null,
      invoice_ref: input.invoiceRef ?? '',
      status: 'due',
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false as const, error: 'Não foi possível registar o valor.' };

  await recordEvent(db, {
    eventType: 'invoice.sent',
    brandId: input.brandId,
    opportunityId: input.opportunityId ?? null,
    collaborationId: input.collaborationId ?? null,
    actorType: 'carol',
    actorUserId: input.actorUserId,
    summary: `${input.kind === 'barter' ? 'Valor de permuta' : 'Valor'} registado: ${(input.amountCents / 100).toFixed(2)} €.`,
    payload: { paymentId: data.id, kind: input.kind, amountCents: input.amountCents },
  });
  return { ok: true as const, id: data.id };
}

export async function markPaid(paymentId: string, actorUserId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('payment')
    .update({ status: 'paid', paid_at: new Date().toISOString().slice(0, 10) })
    .eq('id', paymentId)
    .select('brand_id, collaboration_id, amount_cents, kind')
    .maybeSingle();

  if (!data) return;

  await recordEvent(db, {
    eventType: 'payment.received',
    brandId: data.brand_id,
    collaborationId: data.collaboration_id,
    actorType: 'carol',
    actorUserId,
    summary: `Pagamento recebido: ${(data.amount_cents / 100).toFixed(2)} €.`,
    payload: { paymentId, amountCents: data.amount_cents, kind: data.kind },
    dedupeKey: `payment:${paymentId}:received`,
  });

  await db.from('action_item').update({ status: 'done' }).eq('dedupe_key', `payment:${paymentId}:chase`);
  await refreshRelationship(db, data.brand_id);
}

/** Recalcula o retrato da relação. Materializado porque a listagem de marcas
 *  e o motor de upsell perguntam por ele constantemente. */
export async function refreshRelationship(db: Db, brandId: string) {
  const [{ data: payments }, { data: opps }, { data: collabs }] = await Promise.all([
    db.from('payment').select('kind, amount_cents, status, paid_at').eq('brand_id', brandId),
    db.from('opportunity').select('stage').eq('brand_id', brandId),
    db.from('collaboration').select('id, status, closed_at').eq('brand_id', brandId),
  ]);

  const cash = (payments ?? [])
    .filter((p) => p.kind !== 'barter' && p.status === 'paid')
    .reduce((s, p) => s + p.amount_cents, 0);
  const barter = (payments ?? [])
    .filter((p) => p.kind === 'barter')
    .reduce((s, p) => s + p.amount_cents, 0);

  const lastJob = (collabs ?? [])
    .map((c) => c.closed_at)
    .filter(Boolean)
    .sort()
    .pop();

  await db.from('relationship').upsert({
    brand_id: brandId,
    total_cash_cents: cash,
    total_barter_cents: barter,
    collaborations_count: collabs?.length ?? 0,
    opportunities_count: opps?.length ?? 0,
    won_count: (opps ?? []).filter((o) => o.stage === 'won').length,
    lost_count: (opps ?? []).filter((o) => o.stage === 'lost').length,
    last_job_at: lastJob ?? null,
  });
}

export type RelationshipRow = {
  brandId: string;
  brandName: string;
  totalCashCents: number;
  totalBarterCents: number;
  wonCount: number;
  lostCount: number;
  collaborationsCount: number;
  lastInteractionAt: string | null;
  lastJobAt: string | null;
  nextTouchAt: string | null;
};

export async function listRelationships(): Promise<RelationshipRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('relationship')
    .select(`
      brand_id, total_cash_cents, total_barter_cents, won_count, lost_count,
      collaborations_count, last_interaction_at, last_job_at, next_touch_at,
      brand:brand_id ( name )
    `)
    .order('total_cash_cents', { ascending: false });

  return ((data ?? []) as unknown as {
    brand_id: string; total_cash_cents: number; total_barter_cents: number;
    won_count: number; lost_count: number; collaborations_count: number;
    last_interaction_at: string | null; last_job_at: string | null;
    next_touch_at: string | null; brand: { name: string } | null;
  }[]).map((r) => ({
    brandId: r.brand_id,
    brandName: r.brand?.name ?? '—',
    totalCashCents: r.total_cash_cents,
    totalBarterCents: r.total_barter_cents,
    wonCount: r.won_count,
    lostCount: r.lost_count,
    collaborationsCount: r.collaborations_count,
    lastInteractionAt: r.last_interaction_at,
    lastJobAt: r.last_job_at,
    nextTouchAt: r.next_touch_at,
  }));
}

/** Um projeto não acaba na entrega. Depois de aprovado, avalia-se se há uma
 *  segunda oferta e quando propô-la — propor no próprio dia soa transacional,
 *  e nunca propor é deixar dinheiro em cima da mesa. */
export async function scanUpsells(db: Db, flags: Flags) {
  const { data: approved } = await db
    .from('collaboration')
    .select('id, brand_id, opportunity_id, title, status, closed_at, updated_at, brand:brand_id ( name )')
    .in('status', ['approved', 'closed']);

  let created = 0;
  let skipped = 0;

  for (const c of approved ?? []) {
    const brand = c.brand as unknown as { name: string } | null;
    const since = daysBetween(new Date(c.closed_at ?? c.updated_at), new Date());

    // Propor no próprio dia parece transacional; sete dias dá tempo à marca
    // de usar o criativo e forma opinião.
    if (since < 7) {
      skipped++;
      continue;
    }

    const { data: existing } = await db
      .from('action_item')
      .select('id')
      .eq('dedupe_key', `collab:${c.id}:upsell`)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    let reason = 'Trabalho aprovado há mais de uma semana. Vale avaliar a próxima oferta.';
    let offer: string | null = null;

    if (aiTaskEnabled(flags, 'ai_classification')) {
      const [{ data: events }, { data: content }, { data: rights }] = await Promise.all([
        db.from('activity_event').select('event_type, summary, occurred_at')
          .eq('brand_id', c.brand_id).order('occurred_at', { ascending: false }).limit(20),
        db.from('content_asset').select('title, funnel_role, hook, status').eq('collaboration_id', c.id),
        db.from('rights_license').select('end_at, paid_allowed, status').eq('brand_id', c.brand_id),
      ]);

      const result = await runPrompt(
        upsellScan,
        {
          brandName: brand?.name ?? 'marca',
          history: (events ?? []).map((e) => `${e.occurred_at.slice(0, 10)} ${e.event_type}: ${e.summary}`).join('\n'),
          content: (content ?? []).map((x) => `${x.funnel_role ?? '—'} ${x.title} (${x.status})`).join('\n'),
          rights: (rights ?? []).map((r) => `${r.paid_allowed ? 'pago' : 'orgânico'} até ${r.end_at ?? 'sem fim'} (${r.status})`).join('\n'),
          daysSinceApproval: since,
        },
        { entityType: 'collaboration', entityId: c.id, cache: true },
      );

      if (result.ok) {
        if (!result.output.warranted || result.output.timing === 'not_yet') {
          skipped++;
          continue;
        }
        reason = result.output.reason;
        offer = result.output.offer_type;

        await db.from('ai_recommendation').insert({
          ai_run_id: result.runId,
          opportunity_id: c.opportunity_id,
          brand_id: c.brand_id,
          kind: 'upsell',
          action: offer ?? 'upsell',
          summary: result.output.angle ?? '',
          reason,
          payload: asJson(result.output),
          confidence: result.output.confidence,
          requires_approval: true,
        });
      }
    }

    await db.from('action_item').upsert(
      {
        opportunity_id: c.opportunity_id,
        brand_id: c.brand_id,
        collaboration_id: c.id,
        type: 'upsell' as const,
        title: 'Avaliar a próxima oferta',
        reason,
        evidence: asJson({ collaborationId: c.id, daysSinceApproval: since, offer }),
        risk: 'none' as const,
        due_at: null,
        priority_score: priorityScore({ type: 'upsell' }),
        status: 'open' as const,
        requires_approval: true,
        dedupe_key: `collab:${c.id}:upsell`,
      },
      { onConflict: 'dedupe_key' },
    );

    await recordEvent(db, {
      eventType: 'upsell.created',
      brandId: c.brand_id,
      opportunityId: c.opportunity_id,
      collaborationId: c.id,
      actorType: 'system',
      summary: reason,
      payload: { offer },
      dedupeKey: `collab:${c.id}:upsell`,
    });

    created++;
  }

  return { created, skipped };
}
