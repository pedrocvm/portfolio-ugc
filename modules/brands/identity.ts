/** Resolução de identidade de marca. Duas marcas só se juntam por prova —
 *  um domínio, um handle, um id de fornecedor. Nomes parecidos geram um
 *  candidato para revisão, nunca uma fusão silenciosa: «Nuxe Portugal» e
 *  «Nuxe France» são a mesma empresa; «Maia Shop» e «Maia Tech» não são. */

export type IdentityProvider =
  | 'domain'
  | 'email_domain'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'youtube'
  | 'external';

/** Domínios de correio pessoal nunca identificam uma marca: dez marcas podem
 *  responder de um gmail e não são a mesma empresa. */
export const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com',
  'outlook.pt', 'live.com', 'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'me.com',
  'aol.com', 'proton.me', 'protonmail.com', 'sapo.pt', 'uol.com.br', 'bol.com.br',
  'terra.com.br', 'msn.com', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com',
]);

/** Espelha `public.carolos_normalize` em SQL. Se um dos dois mudar, o backfill
 *  e a aplicação deixam de encontrar as mesmas marcas. */
export const normalizeName = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export function normalizeDomain(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return null;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const host = new URL(withScheme).hostname.replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null;
}

export function emailDomain(value: string | null | undefined): string | null {
  const email = normalizeEmail(value);
  if (!email) return null;
  const domain = email.split('@')[1];
  return GENERIC_EMAIL_DOMAINS.has(domain) ? null : domain;
}

export function normalizeHandle(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  // aceita @handle, instagram.com/handle e handle
  const fromUrl = raw.match(/(?:instagram|tiktok|linkedin|youtube)\.com\/(?:@)?([\w.\-]+)/i);
  const handle = (fromUrl?.[1] ?? raw).replace(/^@/, '').replace(/\/$/, '').toLowerCase();
  return /^[\w.\-]{2,}$/.test(handle) ? handle : null;
}

export type IdentityClaim = { provider: IdentityProvider; externalId: string; url?: string };

/** Extrai todas as identidades verificáveis de um conjunto de sinais soltos.
 *  Nada aqui é adivinhado: ou o sinal contém um identificador, ou não sai nada. */
export function claimsFrom(signals: {
  website?: string | null;
  email?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  urls?: readonly string[];
}): IdentityClaim[] {
  const out: IdentityClaim[] = [];
  const seen = new Set<string>();
  const push = (provider: IdentityProvider, externalId: string | null, url?: string) => {
    if (!externalId) return;
    const key = `${provider}:${externalId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ provider, externalId, url });
  };

  push('domain', normalizeDomain(signals.website), signals.website ?? undefined);
  push('email_domain', emailDomain(signals.email));
  push('instagram', normalizeHandle(signals.instagram), signals.instagram ?? undefined);
  push('tiktok', normalizeHandle(signals.tiktok), signals.tiktok ?? undefined);

  for (const url of signals.urls ?? []) {
    if (/instagram\.com/i.test(url)) push('instagram', normalizeHandle(url), url);
    else if (/tiktok\.com/i.test(url)) push('tiktok', normalizeHandle(url), url);
    else push('domain', normalizeDomain(url), url);
  }
  return out;
}

export type MatchVerdict =
  | { kind: 'exact'; brandId: string; via: IdentityClaim }
  | { kind: 'candidate'; brandId: string; reason: string; confidence: number }
  | { kind: 'none' };

export type KnownBrand = {
  id: string;
  normalizedName: string;
  identities: readonly { provider: string; externalId: string }[];
};

/** Um identificador de fornecedor que bate é prova: junta. Um nome que bate é
 *  uma pista: propõe. Um nome contido noutro é uma pista mais fraca ainda, e
 *  exige pelo menos quatro caracteres para «Ach» não colar a «Achilles». */
export function resolveBrand(
  claims: readonly IdentityClaim[],
  name: string | null | undefined,
  known: readonly KnownBrand[],
): MatchVerdict {
  for (const claim of claims) {
    const hit = known.find((b) =>
      b.identities.some(
        (i) => i.provider === claim.provider && i.externalId === claim.externalId,
      ),
    );
    if (hit) return { kind: 'exact', brandId: hit.id, via: claim };
  }

  const norm = normalizeName(name);
  if (!norm) return { kind: 'none' };

  const sameName = known.find((b) => b.normalizedName === norm);
  if (sameName) {
    return {
      kind: 'candidate',
      brandId: sameName.id,
      reason: 'O nome normalizado é igual, mas nenhum identificador o confirma.',
      confidence: 0.7,
    };
  }

  if (norm.length >= 4) {
    const contained = known.find(
      (b) =>
        b.normalizedName.length >= 4 &&
        (b.normalizedName.includes(norm) || norm.includes(b.normalizedName)),
    );
    if (contained) {
      return {
        kind: 'candidate',
        brandId: contained.id,
        reason: `Um nome contém o outro ("${contained.normalizedName}" / "${norm}").`,
        confidence: 0.45,
      };
    }
  }

  return { kind: 'none' };
}
