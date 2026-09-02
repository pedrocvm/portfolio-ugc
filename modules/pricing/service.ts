import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { recordEvent } from '@/modules/activity/service';
import { PricingRulesSchema, ScopeSchema, calculateQuote, checkFloor, type PricingRules, type QuoteResult } from './engine';

/** Leitura e escrita da política de preço e dos orçamentos.
 *
 *  Um orçamento enviado é história: a base de dados recusa alterá-lo (o
 *  trigger `quote_freeze`), e rever significa criar uma versão nova. Sem isso,
 *  ninguém consegue reconstruir o que a marca recebeu. */

export type Policy = { id: string; version: string; status: string; rules: PricingRules; notes: string };

export async function activePolicy(): Promise<Policy> {
  const db = await supabaseServer();
  const { data } = await db
    .from('pricing_policy')
    .select('id, version, status, rules, notes')
    .in('status', ['active', 'draft'])
    .order('status', { ascending: true }) // 'active' antes de 'draft'
    .limit(1)
    .maybeSingle();

  if (!data) {
    return {
      id: '',
      version: 'none',
      status: 'missing',
      rules: {},
      notes: 'Não existe política de preço configurada. Nenhum valor pode ser calculado.',
    };
  }

  return {
    id: data.id,
    version: data.version,
    status: data.status,
    rules: PricingRulesSchema.parse(data.rules ?? {}),
    notes: data.notes,
  };
}

export async function listPolicies() {
  const db = await supabaseServer();
  const { data } = await db
    .from('pricing_policy')
    .select('id, version, status, currency, markets, rules, notes, updated_at')
    .order('created_at', { ascending: false });
  return data ?? [];
}

/** salva regras novas numa versão nova. Editar uma política ativa por cima
 *  tornava impossível dizer que regras produziram um orçamento antigo. */
export async function savePolicyDraft(
  version: string,
  rules: unknown,
  notes: string,
  actorUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = PricingRulesSchema.safeParse(rules);
  if (!parsed.success) {
    return { ok: false, error: `Regras inválidas: ${parsed.error.issues[0]?.message ?? 'formato desconhecido'}` };
  }

  const db = await supabaseServer();
  const { error } = await db.from('pricing_policy').upsert(
    {
      version,
      status: 'draft',
      rules: asJson(parsed.data),
      notes,
      created_by: actorUserId,
    },
    { onConflict: 'version' },
  );
  return error ? { ok: false, error: 'Não foi possível salvar a política.' } : { ok: true };
}

export async function activatePolicy(version: string, actorUserId: string) {
  const db = await supabaseServer();
  // Só uma ativa de cada vez — a base garante isso com um índice único.
  await db.from('pricing_policy').update({ status: 'retired' }).eq('status', 'active');
  await db
    .from('pricing_policy')
    .update({ status: 'active', approved_by: actorUserId, approved_at: new Date().toISOString() })
    .eq('version', version);
}

export type QuoteRow = {
  id: string;
  version: number;
  status: string;
  policyVersion: string;
  recommendedCents: number;
  finalCents: number | null;
  currency: string;
  unresolved: string[];
  belowFloor: boolean;
  lineItems: QuoteResult['lines'];
  sentAt: string | null;
  createdAt: string;
};

export async function quotesFor(opportunityId: string): Promise<QuoteRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('quote')
    .select('id, version, status, pricing_policy_version, recommended_cents, final_cents, currency, unresolved, below_floor, line_items, sent_at, created_at')
    .eq('opportunity_id', opportunityId)
    .order('version', { ascending: false });

  return (data ?? []).map((q) => ({
    id: q.id,
    version: q.version,
    status: q.status,
    policyVersion: q.pricing_policy_version,
    recommendedCents: q.recommended_cents,
    finalCents: q.final_cents,
    currency: q.currency,
    unresolved: q.unresolved ?? [],
    belowFloor: q.below_floor,
    lineItems: (q.line_items ?? []) as QuoteResult['lines'],
    sentAt: q.sent_at,
    createdAt: q.created_at,
  }));
}

export async function previewQuote(scope: unknown): Promise<QuoteResult> {
  const policy = await activePolicy();
  return calculateQuote(policy.rules, scope, policy.version);
}

/** Cria um orçamento a partir do cálculo. salva a fotografia completa —
 *  política, escopo, linhas, direitos — para o poder reconstruir depois de a
 *  política mudar. */
export async function createQuote(input: {
  opportunityId: string;
  scope: unknown;
  finalCents?: number | null;
  overrideReason?: string;
  actorUserId: string;
}): Promise<{ ok: boolean; id?: string; error?: string; result?: QuoteResult }> {
  const db = await supabaseServer();
  const policy = await activePolicy();
  const scope = ScopeSchema.parse(input.scope ?? {});
  const result = calculateQuote(policy.rules, scope, policy.version);

  const final = input.finalCents ?? result.recommendedCents;
  if (final === null) {
    return {
      ok: false,
      error: 'Não há valor calculável e nenhum valor foi indicado à mão. Resolve a política ou escreve o valor.',
      result,
    };
  }

  const floor = checkFloor(final, result.minimumCents);
  if (floor.belowFloor && !input.overrideReason) {
    return { ok: false, error: `${floor.warning} Escreve a justificação para avançar.`, result };
  }

  const { data: opp } = await db
    .from('opportunity')
    .select('brand_id')
    .eq('id', input.opportunityId)
    .maybeSingle();

  const { data: last } = await db
    .from('quote')
    .select('id, version')
    .eq('opportunity_id', input.opportunityId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from('quote')
    .insert({
      opportunity_id: input.opportunityId,
      brand_id: opp?.brand_id ?? null,
      pricing_policy_version: policy.version,
      version: (last?.version ?? 0) + 1,
      status: 'draft',
      input_scope: asJson(scope),
      line_items: asJson(result.lines),
      rights_snapshot: asJson({
        paidUsage: scope.paidUsage,
        usageTerm: scope.usageTerm,
        platforms: scope.platforms,
        territories: scope.territories,
        whitelisting: scope.whitelisting,
        exclusivity: scope.exclusivity,
        rawFootage: scope.rawFootage,
        perpetual: scope.perpetual,
      }),
      base_cents: result.baseCents,
      adjustments_cents: result.adjustmentsCents,
      recommended_cents: result.recommendedCents ?? 0,
      minimum_cents: result.minimumCents,
      final_cents: final,
      currency: result.currency,
      unresolved: result.unresolved.map((u) => u.key),
      below_floor: floor.belowFloor,
      override_reason: input.overrideReason ?? null,
      superseded_by: null,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: 'Não foi possível criar o orçamento.', result };

  if (last) await db.from('quote').update({ superseded_by: data.id, status: 'superseded' }).eq('id', last.id);

  await recordEvent(db, {
    eventType: 'quote.sent',
    brandId: opp?.brand_id ?? null,
    opportunityId: input.opportunityId,
    actorType: 'carol',
    actorUserId: input.actorUserId,
    summary: `Orçamento v${(last?.version ?? 0) + 1} preparado: ${(final / 100).toFixed(2)} ${result.currency}.`,
    payload: {
      quoteId: data.id,
      finalCents: final,
      belowFloor: floor.belowFloor,
      unresolved: result.unresolved.map((u) => u.key),
    },
    policyVersion: policy.version,
  });

  return { ok: true, id: data.id, result };
}

/** Marca como enviado. A partir daqui o trigger na base impede qualquer
 *  alteração aos números. */
export async function markQuoteSent(quoteId: string) {
  const db = await supabaseServer();
  await db
    .from('quote')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', quoteId);
}

export { calculateQuote, checkFloor };
