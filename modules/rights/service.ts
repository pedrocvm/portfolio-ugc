import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';
import { recordEvent, type Db } from '@/modules/activity/service';
import { computeEnd, expiryStatus, rightsRisks, type RightsScope } from './engine';

export type LicenseRow = {
  id: string;
  brandId: string;
  brandName: string;
  opportunityId: string | null;
  collaborationId: string | null;
  scope: RightsScope;
  feeCents: number | null;
  currency: string;
  status: string;
  notes: string;
  expiry: ReturnType<typeof expiryStatus>;
};

const SELECT = `
  id, brand_id, opportunity_id, collaboration_id, organic_allowed, paid_allowed,
  platforms, territories, start_at, end_at, duration_days, whitelisting, exclusivity,
  exclusivity_scope, exclusivity_end_at, raw_footage, portfolio_permission,
  third_party_usage, fee_cents, currency, status, notes, brand:brand_id ( name )
`;

type RawLicense = {
  id: string; brand_id: string; opportunity_id: string | null; collaboration_id: string | null;
  organic_allowed: boolean; paid_allowed: boolean; platforms: string[]; territories: string[];
  start_at: string | null; end_at: string | null; duration_days: number | null;
  whitelisting: boolean; exclusivity: boolean; exclusivity_scope: string | null;
  exclusivity_end_at: string | null; raw_footage: boolean; portfolio_permission: boolean | null;
  third_party_usage: boolean; fee_cents: number | null; currency: string; status: string;
  notes: string; brand: { name: string } | null;
};

const toLicense = (r: RawLicense): LicenseRow => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand?.name ?? '—',
  opportunityId: r.opportunity_id,
  collaborationId: r.collaboration_id,
  scope: {
    organicAllowed: r.organic_allowed,
    paidAllowed: r.paid_allowed,
    platforms: r.platforms ?? [],
    territories: r.territories ?? [],
    startAt: r.start_at,
    endAt: r.end_at,
    durationDays: r.duration_days,
    whitelisting: r.whitelisting,
    exclusivity: r.exclusivity,
    exclusivityScope: r.exclusivity_scope,
    exclusivityEndAt: r.exclusivity_end_at,
    rawFootage: r.raw_footage,
    portfolioPermission: r.portfolio_permission,
    thirdPartyUsage: r.third_party_usage,
  },
  feeCents: r.fee_cents,
  currency: r.currency,
  status: r.status,
  notes: r.notes,
  expiry: expiryStatus(r.end_at),
});

export async function listLicenses(): Promise<LicenseRow[]> {
  const db = await supabaseServer();
  const { data } = await db.from('rights_license').select(SELECT).order('end_at', { nullsFirst: false });
  return ((data ?? []) as unknown as RawLicense[]).map(toLicense);
}

export async function licensesForBrand(brandId: string): Promise<LicenseRow[]> {
  const db = await supabaseServer();
  const { data } = await db.from('rights_license').select(SELECT).eq('brand_id', brandId);
  return ((data ?? []) as unknown as RawLicense[]).map(toLicense);
}

export async function createLicense(input: {
  brandId: string;
  opportunityId?: string | null;
  collaborationId?: string | null;
  scope: RightsScope;
  feeCents?: number | null;
  notes?: string;
  actorUserId: string;
}) {
  const db = await supabaseServer();
  const endAt = input.scope.endAt ?? computeEnd(input.scope.startAt, input.scope.durationDays);

  const { data, error } = await db
    .from('rights_license')
    .insert({
      brand_id: input.brandId,
      opportunity_id: input.opportunityId ?? null,
      collaboration_id: input.collaborationId ?? null,
      organic_allowed: input.scope.organicAllowed,
      paid_allowed: input.scope.paidAllowed,
      platforms: [...input.scope.platforms],
      territories: [...input.scope.territories],
      start_at: input.scope.startAt,
      end_at: endAt,
      duration_days: input.scope.durationDays,
      whitelisting: input.scope.whitelisting,
      exclusivity: input.scope.exclusivity,
      exclusivity_scope: input.scope.exclusivityScope,
      exclusivity_end_at: input.scope.exclusivityEndAt,
      raw_footage: input.scope.rawFootage,
      portfolio_permission: input.scope.portfolioPermission,
      third_party_usage: input.scope.thirdPartyUsage,
      fee_cents: input.feeCents ?? null,
      notes: input.notes ?? '',
      status: 'active',
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false as const, error: 'Não foi possível registar a licença.' };

  await recordEvent(db, {
    eventType: 'rights.started',
    brandId: input.brandId,
    opportunityId: input.opportunityId ?? null,
    collaborationId: input.collaborationId ?? null,
    actorType: 'carol',
    actorUserId: input.actorUserId,
    summary: input.scope.paidAllowed
      ? `Licença de uso pago${endAt ? ` até ${endAt}` : ' sem data de fim'}.`
      : 'Licença de uso orgânico registada.',
    payload: {
      licenseId: data.id,
      paidAllowed: input.scope.paidAllowed,
      platforms: input.scope.platforms,
      endAt,
      risks: rightsRisks(input.scope).map((f) => f.code),
    },
  });

  return { ok: true as const, id: data.id };
}

/** Marca como expiradas as licenças que passaram da data e regista o evento.
 *  Uma licença que expira sem ninguém saber é receita de renovação perdida —
 *  ou, pior, uma marca a correr anúncios sem autorização. */
export async function expireLicenses(db: Db): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: expiring } = await db
    .from('rights_license')
    .select('id, brand_id, opportunity_id, end_at')
    .eq('status', 'active')
    .not('end_at', 'is', null)
    .lte('end_at', today);

  for (const l of expiring ?? []) {
    await db.from('rights_license').update({ status: 'expired' }).eq('id', l.id);
    await recordEvent(db, {
      eventType: 'rights.expiring',
      brandId: l.brand_id,
      opportunityId: l.opportunity_id,
      actorType: 'system',
      summary: `A licença terminou a ${l.end_at}.`,
      payload: { licenseId: l.id, endAt: l.end_at },
      dedupeKey: `rights:${l.id}:expired`,
    });
  }

  // Aviso antecipado, para a renovação ser proposta antes de a campanha parar.
  const { data: soon } = await db
    .from('rights_license')
    .select('id, brand_id, opportunity_id, end_at')
    .eq('status', 'active')
    .not('end_at', 'is', null);

  for (const l of soon ?? []) {
    if (expiryStatus(l.end_at).state !== 'expiring') continue;
    await recordEvent(db, {
      eventType: 'rights.expiring',
      brandId: l.brand_id,
      opportunityId: l.opportunity_id,
      actorType: 'system',
      summary: `A licença termina a ${l.end_at}.`,
      payload: { licenseId: l.id, endAt: l.end_at },
      dedupeKey: `rights:${l.id}:expiring`,
    });
  }

  return expiring?.length ?? 0;
}

export { rightsRisks, expiryStatus, computeEnd };
