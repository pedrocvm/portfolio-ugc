import 'server-only';

import { aiTaskEnabled, type Flags } from '@/lib/flags';
import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { runPrompt } from '@/modules/ai/gateway';
import { brandDossier } from '@/modules/ai/prompts/registry';
import type { BrandDossier } from '@/modules/ai/schemas';
import { recordEvent } from '@/modules/activity/service';
import { scoreAndSaveFit } from './service';
import { NICHES, prospectableNiches } from './niches';
import type { FitCriterion, FitSignals } from './fit';

/** Dossiê de marca.
 *
 *  Sintetiza o que o sistema já sabe — notas, conversas, capturas, produtos —
 *  numa leitura comercial de uma página, e alimenta o fit score com sinais em
 *  vez de palpites.
 *
 *  Uma coisa que este dossiê NÃO faz: navegar a web. Sem recolha automática de
 *  evidência, o modelo só pode trabalhar com o que está no registro, e é isso
 *  que ele é instruído a fazer. Tudo o que não conseguir verificar sai em
 *  `unknowns`, não numa afirmação — «não consegui confirmar que fazem anúncios»
 *  é honesto; «não fazem anúncios» sem prova não é. */

const SIGNAL_KEYS: FitCriterion[] = [
  'paid_maturity', 'demo_potential', 'budget_signals', 'authentic_context',
  'economics', 'recurring_demand', 'aesthetic', 'contact_access',
  'logistics', 'portfolio_value',
];

export type DossierResult =
  | { ok: true; dossier: BrandDossier; fitScore: number }
  | { ok: false; code: string; message: string };

export async function buildDossier(brandId: string, flags: Flags): Promise<DossierResult> {
  if (!aiTaskEnabled(flags, 'ai_classification')) {
    return { ok: false, code: 'flag_off', message: 'A camada de IA está desligada.' };
  }

  const db = await supabaseServer();
  const { data: brand } = await db
    .from('brand')
    .select('id, name, website_url, domain, notes, category_primary, country_code')
    .eq('id', brandId)
    .maybeSingle();
  if (!brand) return { ok: false, code: 'not_found', message: 'Marca não encontrada.' };

  // A evidência é o que o sistema observou. Não há navegação: o que não estiver
  // aqui, o modelo tem de declarar como desconhecido.
  const [{ data: events }, { data: products }, { data: contacts }, { data: captures }, { data: identities }] =
    await Promise.all([
      db.from('activity_event').select('event_type, summary, payload, occurred_at')
        .eq('brand_id', brandId).order('occurred_at', { ascending: false }).limit(30),
      db.from('product').select('name, category, retail_price_cents, url, notes').eq('brand_id', brandId),
      db.from('contact').select('name, role, email, preferred_channel').eq('brand_id', brandId),
      db.from('capture_item').select('raw_input, note, extracted').eq('brand_id', brandId).limit(5),
      db.from('brand_identity').select('provider, external_id, url').eq('brand_id', brandId),
    ]);

  const evidence = [
    identities?.length
      ? `Identidades: ${identities.map((i) => `${i.provider}=${i.external_id}`).join(', ')}`
      : '',
    products?.length
      ? `Produtos conhecidos:\n${products.map((p) => `- ${p.name}${p.retail_price_cents ? ` (${p.retail_price_cents / 100} €)` : ''} ${p.notes}`).join('\n')}`
      : '',
    contacts?.length
      ? `Contatos: ${contacts.map((c) => `${c.name || '(sem nome)'} ${c.role} ${c.email ?? ''}`).join('; ')}`
      : '',
    events?.length
      ? `Histórico observado:\n${events.map((e) => `- ${e.occurred_at.slice(0, 10)} ${e.event_type}: ${e.summary}`).join('\n')}`
      : '',
    captures?.length
      ? `Capturas:\n${captures.map((c) => `- ${c.note} ${String(c.raw_input).slice(0, 400)}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = await runPrompt(
    brandDossier,
    {
      brandName: brand.name,
      website: brand.website_url ?? brand.domain,
      notes: brand.notes,
      evidence: evidence || '(o sistema ainda não observou nada sobre esta marca)',
      niches: prospectableNiches().map((n) => n.id).join(', ') + ', beauty',
    },
    { entityType: 'brand', entityId: brandId, cache: true },
  );

  if (!result.ok) return { ok: false, code: result.code, message: result.message };

  const dossier = result.output;

  // Um id de nicho que o modelo inventou não entra: só os que a política
  // conhece. Skincare vem como `beauty` e o motor de fit trata do resto.
  const nicheId = NICHES.some((n) => n.id === dossier.niche_id)
    ? dossier.niche_id
    : (brand.category_primary ?? null);

  const signals: FitSignals = { nicheId, evidence: {} };
  for (const key of SIGNAL_KEYS) {
    const value = dossier.fit_signals[key];
    if (typeof value === 'number') signals[key] = value;
  }
  for (const item of dossier.evidence) {
    signals.evidence![item.claim.slice(0, 40)] = item.source;
  }

  const fit = await scoreAndSaveFit(db, brandId, signals);

  await db
    .from('brand')
    .update({ dossier: asJson(dossier), dossier_at: new Date().toISOString() })
    .eq('id', brandId);

  await db.from('brand_research_snapshot').insert({
    brand_id: brandId,
    ai_run_id: result.runId,
    dossier: asJson(dossier),
    evidence: asJson(dossier.evidence),
    fit_score: fit.score,
    fit_breakdown: asJson(fit.lines),
    policy_version: fit.policyVersion,
  });

  await recordEvent(db, {
    eventType: 'brand.enriched',
    brandId,
    actorType: 'ai',
    summary: dossier.why_it_fits.slice(0, 200),
    payload: {
      bestProduct: dossier.best_product_to_pitch,
      risks: dossier.risks,
      unknowns: dossier.unknowns,
      evidenceCount: dossier.evidence.length,
    },
    confidence: dossier.confidence,
  });

  return { ok: true, dossier, fitScore: fit.score };
}

export async function latestDossier(brandId: string): Promise<BrandDossier | null> {
  const db = await supabaseServer();
  const { data } = await db.from('brand').select('dossier').eq('id', brandId).maybeSingle();
  return (data?.dossier ?? null) as BrandDossier | null;
}
