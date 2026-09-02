import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { deriveMilestones, isFreshMilestone, MILESTONE_LABEL, type Milestone, type MilestoneKind } from './domain';

export * from './domain';

/** Os marcos derivam-se; não se cadastram.
 *
 *  Um tela onde a Carol registasse «primeiro cliente internacional» era mais um
 *  formulário para ela manter — e o CarolOS existe para não ter formulários que
 *  dependem da memória dela. Estes saem dos pagamentos e dos eventos que já
 *  estão gravados, e é por isso que nenhum é uma invenção. */

export type MilestoneRunResult = { derived: number; created: number };

export async function refreshMilestones(homeCountry = 'PT'): Promise<MilestoneRunResult> {
  const db = supabaseService();

  const [{ data: payments }, { data: events }] = await Promise.all([
    db
      .from('payment')
      .select('id, kind, amount_cents, currency, paid_at, brand_id, brand:brand_id ( name, country_code )')
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: true })
      .limit(200),
    db
      .from('activity_event')
      .select('id, event_type, brand_id, occurred_at, summary, payload, brand:brand_id ( name )')
      .in('event_type', ['reply.received', 'product.received', 'opportunity.lost', 'content.approved', 'revision.requested'])
      .order('occurred_at', { ascending: true })
      .limit(400),
  ]);

  type BrandRef = { name: string; country_code: string | null } | { name: string; country_code: string | null }[] | null;
  const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  const derived = deriveMilestones({
    homeCountry,
    payments: (payments ?? []).map((p) => {
      const b = one(p.brand as BrandRef);
      return {
        id: p.id,
        brandId: p.brand_id,
        brandName: b?.name ?? null,
        brandCountry: b?.country_code ?? null,
        kind: p.kind,
        amountCents: p.amount_cents,
        currency: p.currency,
        // `paid_at` é uma data, e o domínio compara instantes.
        receivedAt: p.paid_at ? `${p.paid_at}T00:00:00Z` : null,
      };
    }),
    events: (events ?? []).map((e) => {
      const b = one(e.brand as { name: string } | { name: string }[] | null);
      return {
        id: e.id,
        type: e.event_type,
        brandId: e.brand_id,
        brandName: b?.name ?? null,
        occurredAt: e.occurred_at,
        summary: e.summary,
        payload: (e.payload ?? {}) as Record<string, unknown>,
      };
    }),
  });

  let created = 0;
  for (const m of derived) {
    const { data, error } = await db
      .from('business_milestone')
      .upsert(
        {
          kind: m.kind,
          dedupe_key: m.dedupeKey,
          occurred_at: m.occurredAt,
          brand_id: m.brandId,
          summary: m.summary,
          evidence: asJson(m.evidence),
        },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      .select('id');
    if (!error && (data ?? []).length > 0) created++;
  }

  return { derived: derived.length, created };
}

export type MilestoneRow = {
  id: string;
  kind: MilestoneKind;
  label: string;
  summary: string;
  occurredAt: string;
  brandId: string | null;
  brandName: string | null;
  evidence: { kind: string; id: string; at: string; note?: string }[];
  usedForContent: boolean;
};

/** Os que ainda são notícia e ainda não viraram conteúdo. */
export async function contentWorthyMilestones(limit = 5): Promise<MilestoneRow[]> {
  const db = supabaseService();
  const { data } = await db
    .from('business_milestone')
    .select('id, kind, summary, occurred_at, brand_id, evidence, used_for_content, brand:brand_id ( name )')
    .eq('used_for_content', false)
    .order('occurred_at', { ascending: false })
    .limit(limit * 3);

  const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  return (data ?? [])
    .filter((m) => isFreshMilestone({ occurredAt: m.occurred_at }))
    .slice(0, limit)
    .map((m) => ({
      id: m.id,
      kind: m.kind as MilestoneKind,
      label: MILESTONE_LABEL[m.kind as MilestoneKind] ?? m.kind,
      summary: m.summary,
      occurredAt: m.occurred_at,
      brandId: m.brand_id,
      brandName: one(m.brand as { name: string } | { name: string }[] | null)?.name ?? null,
      evidence: (m.evidence ?? []) as MilestoneRow['evidence'],
      usedForContent: m.used_for_content,
    }));
}

export async function markMilestoneUsed(id: string): Promise<void> {
  await supabaseService().from('business_milestone').update({ used_for_content: true }).eq('id', id);
}

export async function allMilestones(limit = 30): Promise<MilestoneRow[]> {
  const db = supabaseService();
  const { data } = await db
    .from('business_milestone')
    .select('id, kind, summary, occurred_at, brand_id, evidence, used_for_content, brand:brand_id ( name )')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  return (data ?? []).map((m) => ({
    id: m.id,
    kind: m.kind as MilestoneKind,
    label: MILESTONE_LABEL[m.kind as MilestoneKind] ?? m.kind,
    summary: m.summary,
    occurredAt: m.occurred_at,
    brandId: m.brand_id,
    brandName: one(m.brand as { name: string } | { name: string }[] | null)?.name ?? null,
    evidence: (m.evidence ?? []) as MilestoneRow['evidence'],
    usedForContent: m.used_for_content,
  }));
}

/** Um marco só vira conteúdo com a prova junta. É isto que impede o plano de
 *  conteúdo de contar uma história que não aconteceu. */
export function describeMilestones(rows: readonly MilestoneRow[]): string {
  if (rows.length === 0) return '';
  return rows
    .map(
      (m) =>
        `- ${m.label} (${m.occurredAt.slice(0, 10)}): ${m.summary}` +
        (m.evidence.length ? ` [prova: ${m.evidence.map((e) => `${e.kind}:${e.id.slice(0, 8)}`).join(', ')}]` : ''),
    )
    .join('\n');
}

export type { Milestone };
