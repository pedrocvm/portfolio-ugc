import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';
import { asJson } from '@/lib/supabase/json';
import { recordEvent, type Db } from '@/modules/activity/service';
import { effectiveFit, scoreBrandFit, type FitOverride, type FitResult, type FitSignals } from './fit';
import { guessNiche, nicheById } from './niches';
import {
  claimsFrom, normalizeName, resolveBrand,
  type IdentityClaim, type KnownBrand, type MatchVerdict,
} from './identity';

export type BrandRow = {
  id: string;
  name: string;
  normalizedName: string | null;
  domain: string | null;
  websiteUrl: string | null;
  countryCode: string | null;
  categoryPrimary: string | null;
  categoryTags: string[];
  interestLevel: number | null;
  fitScore: number | null;
  fitBand: string | null;
  fitPolicyVersion: string | null;
  fitBreakdown: unknown;
  fitOverride: FitOverride | null;
  status: string;
  source: string | null;
  lastActivityAt: string | null;
  dossier: unknown;
  dossierAt: string | null;
  notes: string;
  legacyInstagram: string;
  legacyContact: string;
  legacyStage: string;
  createdAt: string;
  updatedAt: string;
};

const SELECT =
  'id, name, normalized_name, domain, website_url, country_code, category_primary, category_tags,' +
  ' interest_level, fit_score, fit_band, fit_policy_version, fit_breakdown, fit_override, status,' +
  ' source, last_activity_at, dossier, dossier_at, notes, instagram, contact, stage, created_at, updated_at';

type RawBrand = {
  id: string; name: string; normalized_name: string | null; domain: string | null;
  website_url: string | null; country_code: string | null; category_primary: string | null;
  category_tags: string[] | null; interest_level: number | null; fit_score: number | null;
  fit_band: string | null; fit_policy_version: string | null; fit_breakdown: unknown;
  fit_override: unknown; status: string; source: string | null; last_activity_at: string | null;
  dossier: unknown; dossier_at: string | null; notes: string; instagram: string;
  contact: string; stage: string; created_at: string; updated_at: string;
};

const toBrand = (r: RawBrand): BrandRow => ({
  id: r.id,
  name: r.name,
  normalizedName: r.normalized_name,
  domain: r.domain,
  websiteUrl: r.website_url,
  countryCode: r.country_code,
  categoryPrimary: r.category_primary,
  categoryTags: r.category_tags ?? [],
  interestLevel: r.interest_level,
  fitScore: r.fit_score,
  fitBand: r.fit_band,
  fitPolicyVersion: r.fit_policy_version,
  fitBreakdown: r.fit_breakdown,
  fitOverride: (r.fit_override ?? null) as FitOverride | null,
  status: r.status,
  source: r.source,
  lastActivityAt: r.last_activity_at,
  dossier: r.dossier,
  dossierAt: r.dossier_at,
  notes: r.notes,
  legacyInstagram: r.instagram,
  legacyContact: r.contact,
  legacyStage: r.stage,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listBrandRows(): Promise<BrandRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('brand')
    .select(SELECT)
    .order('last_activity_at', { ascending: false, nullsFirst: false });
  return ((data ?? []) as unknown as RawBrand[]).map(toBrand);
}

export async function getBrand(id: string): Promise<BrandRow | null> {
  const db = await supabaseServer();
  const { data } = await db.from('brand').select(SELECT).eq('id', id).maybeSingle();
  return data ? toBrand(data as unknown as RawBrand) : null;
}

export async function brandIdentities(brandId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('brand_identity')
    .select('id, provider, external_id, url, is_primary, verified')
    .eq('brand_id', brandId);
  return data ?? [];
}

/** Envie o que é preciso para decidir se uma marca nova já existe. Sem isto,
 *  cada ingestão faria uma consulta por marca conhecida. */
export async function knownBrands(db: Db): Promise<KnownBrand[]> {
  const [{ data: brands }, { data: ids }] = await Promise.all([
    db.from('brand').select('id, normalized_name'),
    db.from('brand_identity').select('brand_id, provider, external_id'),
  ]);

  const byBrand = new Map<string, { provider: string; externalId: string }[]>();
  for (const i of ids ?? []) {
    const list = byBrand.get(i.brand_id) ?? [];
    list.push({ provider: i.provider, externalId: i.external_id });
    byBrand.set(i.brand_id, list);
  }

  return (brands ?? []).map((b) => ({
    id: b.id,
    normalizedName: b.normalized_name ?? '',
    identities: byBrand.get(b.id) ?? [],
  }));
}

export type ResolveResult = {
  brandId: string;
  created: boolean;
  /** Preenchido quando a resolução é só um palpite e precisa de confirmação. */
  mergeCandidate: { brandId: string; reason: string; confidence: number } | null;
};

/** Encontra ou cria a marca a partir de sinais soltos.
 *
 *  Só funde por prova. Um nome parecido devolve `mergeCandidate` e cria na
 *  mesma uma marca nova: é melhor ter duas fichas que alguém junta com um
 *  clique do que ter o histórico de duas empresas misturado sem volta. */
export async function resolveOrCreateBrand(
  db: Db,
  signals: {
    name: string;
    website?: string | null;
    email?: string | null;
    instagram?: string | null;
    countryCode?: string | null;
    source: string;
    notes?: string;
    nicheHint?: string | null;
  },
): Promise<ResolveResult> {
  const claims = claimsFrom(signals);
  const known = await knownBrands(db);
  const verdict: MatchVerdict = resolveBrand(claims, signals.name, known);

  if (verdict.kind === 'exact') {
    await attachIdentities(db, verdict.brandId, claims);
    return { brandId: verdict.brandId, created: false, mergeCandidate: null };
  }

  const niche =
    (signals.nicheHint ? nicheById(signals.nicheHint) : null) ??
    guessNiche(signals.name, signals.notes, signals.website);

  const { data, error } = await db
    .from('brand')
    .insert({
      name: signals.name,
      normalized_name: normalizeName(signals.name),
      website_url: signals.website ?? null,
      country_code: signals.countryCode ?? null,
      category_primary: niche?.id ?? null,
      source: signals.source,
      notes: signals.notes ?? '',
      status: 'active',
      last_activity_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`Não foi possível criar a marca: ${error?.message}`);

  await attachIdentities(db, data.id, claims);
  await db.from('relationship').upsert({ brand_id: data.id, first_contact_at: new Date().toISOString() });

  await recordEvent(db, {
    eventType: 'brand.discovered',
    brandId: data.id,
    actorType: 'system',
    summary: `Marca criada a partir de ${signals.source}.`,
    payload: { source: signals.source, claims, niche: niche?.id ?? null },
    dedupeKey: `brand:${data.id}:discovered`,
  });

  return {
    brandId: data.id,
    created: true,
    mergeCandidate: verdict.kind === 'candidate' ? verdict : null,
  };
}

async function attachIdentities(db: Db, brandId: string, claims: readonly IdentityClaim[]) {
  if (!claims.length) return;
  await db.from('brand_identity').upsert(
    claims.map((c) => ({
      brand_id: brandId,
      provider: c.provider,
      external_id: c.externalId,
      url: c.url ?? null,
      verified: c.provider === 'domain' || c.provider === 'instagram',
    })),
    { onConflict: 'provider,external_id', ignoreDuplicates: true },
  );
}

/** Recalcula e salva o fit. O score derivado é uma fotografia: a fonte de
 *  verdade é a política mais os sinais, e ambos ficam no breakdown para a
 *  interface poder explicar cada ponto. */
export async function scoreAndSaveFit(
  db: Db,
  brandId: string,
  signals: FitSignals,
): Promise<FitResult> {
  const result = scoreBrandFit(signals);
  await db
    .from('brand')
    .update({
      fit_score: result.score,
      fit_band: result.band,
      fit_policy_version: result.policyVersion,
      fit_breakdown: asJson({ lines: result.lines, unknowns: result.unknowns, summary: result.summary }),
      category_primary: signals.nicheId ?? null,
    })
    .eq('id', brandId);

  await recordEvent(db, {
    eventType: 'brand.qualified',
    brandId,
    actorType: 'system',
    summary: result.summary,
    payload: { score: result.score, band: result.band, unknowns: result.unknowns },
    policyVersion: result.policyVersion,
  });

  return result;
}

export function brandFit(brand: BrandRow) {
  const stored = (brand.fitBreakdown ?? null) as { lines?: unknown; summary?: string } | null;
  const computed: FitResult = {
    score: brand.fitScore ?? 0,
    band: (brand.fitBand as FitResult['band']) ?? 'ignore',
    policyVersion: brand.fitPolicyVersion ?? '',
    lines: (stored?.lines ?? []) as FitResult['lines'],
    unknowns: [],
    excludedNiche: nicheById(brand.categoryPrimary).tier === 'EXCLUDED',
    summary: stored?.summary ?? '',
  };
  return { computed, effective: effectiveFit(computed, brand.fitOverride) };
}
