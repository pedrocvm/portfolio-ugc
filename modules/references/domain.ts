/** Referências criativas: o que é uma boa, e por que ordem aparecem.
 *
 *  A tentação é ordenar por views. Um vídeo com três milhões de visualizações
 *  não é uma boa referência se a Carol não o consegue gravar sozinha em casa —
 *  é uma boa referência para quem tem equipa. O que interessa é o que se
 *  transfere: a estrutura, o gancho, o ritmo, a ideia.
 *
 *  Puro. Quem vai à web é o serviço. */

export const REFERENCE_PLATFORMS = [
  'instagram',
  'tiktok',
  'youtube',
  'meta_ads',
  'tiktok_creative_center',
  'web',
  'other',
] as const;

export type ReferencePlatform = (typeof REFERENCE_PLATFORMS)[number];

export const PLATFORM_LABEL: Record<ReferencePlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  meta_ads: 'Biblioteca de anúncios da Meta',
  tiktok_creative_center: 'TikTok Creative Center',
  web: 'Web',
  other: 'Outro',
};

export const isReferencePlatform = (v: string): v is ReferencePlatform =>
  (REFERENCE_PLATFORMS as readonly string[]).includes(v);

export type Freshness = 'fresh' | 'recent' | 'aging' | 'stale' | 'unknown';

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: 'destas semanas',
  recent: 'destes meses',
  aging: 'já tem uns meses',
  stale: 'antiga',
  unknown: 'sem data',
};

/** Sem data não se finge uma. `unknown` é uma resposta, «fresh» não é. */
export function freshnessOf(publishedAt: string | null | undefined, now: Date = new Date()): Freshness {
  if (!publishedAt) return 'unknown';
  const at = Date.parse(publishedAt);
  if (Number.isNaN(at)) return 'unknown';
  const days = Math.floor((now.getTime() - at) / 86_400_000);
  if (days < 0) return 'unknown';
  if (days <= 30) return 'fresh';
  if (days <= 90) return 'recent';
  if (days <= 270) return 'aging';
  return 'stale';
}

export type Reference = {
  sourceUrl: string;
  platform: ReferencePlatform;
  title: string;
  hook: string;
  structure: string;
  editingStyle: string;
  whyItWorks: string;
  format: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  creatorHandle: string | null;
  brandName: string | null;
  signals: string[];
  sourceConfidence: 'verified' | 'reported' | 'unverified';
};

export type ReferenceLink = {
  fitReason: string;
  adaptation: string;
  doNotCopy: string;
};

/** O portão de qualidade.
 *
 *  Uma referência sem endereço não é uma referência: é uma alegação. Uma sem
 *  análise é um link, que é o trabalho que se queria evitar. As duas coisas
 *  reprovam, e reprovam com um motivo legível. */
export function referenceProblems(ref: Partial<Reference>): string[] {
  const out: string[] = [];
  const url = (ref.sourceUrl ?? '').trim();

  if (!/^https?:\/\/\S+\.\S+/.test(url)) out.push('sem endereço verificável');
  if ((ref.whyItWorks ?? '').trim().length < 20) out.push('sem explicação do que a faz funcionar');
  if ((ref.structure ?? '').trim().length < 10 && (ref.hook ?? '').trim().length < 10) {
    out.push('sem estrutura nem gancho — não há nada para adaptar');
  }
  return out;
}

export const referenceIsUsable = (ref: Partial<Reference>) => referenceProblems(ref).length === 0;

/** Endereço normalizado, para a mesma referência não entrar duas vezes.
 *
 *  Corta parâmetros de rastreio e a barra final; mantém o resto, porque num
 *  TikTok o id do vídeo está no caminho e cortá-lo colapsava vídeos diferentes
 *  do mesmo criador numa só linha. */
export function normalizeReferenceUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|igshid|_r$|_t$|is_from|si$)/i.test(key)) u.searchParams.delete(key);
    }
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const query = u.searchParams.toString();
    return `${u.protocol}//${u.hostname}${path}${query ? `?${query}` : ''}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

export function dedupeReferences<T extends { sourceUrl: string }>(refs: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of refs) {
    const key = normalizeReferenceUrl(r.sourceUrl);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** A nota de uma referência para ESTA marca.
 *
 *  Deliberadamente não tem views. O que soma é: dá para adaptar, dá para
 *  gravar sozinha, é recente, e alguém explicou porque encaixa nesta marca. */
export function scoreReference(
  ref: Reference,
  link: ReferenceLink,
  now: Date = new Date(),
): { score: number; lines: string[] } {
  const lines: string[] = [];
  let score = 0;

  const fresh = freshnessOf(ref.publishedAt, now);
  const byFreshness: Record<Freshness, number> = { fresh: 25, recent: 18, aging: 8, stale: 0, unknown: 10 };
  score += byFreshness[fresh];
  lines.push(`Frescura: ${FRESHNESS_LABEL[fresh]}.`);

  if (link.adaptation.trim().length >= 40) {
    score += 25;
    lines.push('Traz uma adaptação concreta para esta marca.');
  } else if (link.adaptation.trim()) {
    score += 10;
    lines.push('A adaptação é vaga.');
  } else {
    lines.push('Sem adaptação: só serve como inspiração solta.');
  }

  if (link.fitReason.trim().length >= 30) {
    score += 15;
    lines.push('Diz porque encaixa nesta marca em concreto.');
  }

  // Gravável sozinha, em casa, com telemóvel. É o filtro que separa uma
  // referência útil de uma produção com equipa.
  const heavy = /(drone|est[úu]dio|studio|equipa de|crew|actores|atores|figura[çc][ãa]o|cen[áa]rio constru)/i;
  const feasible = !heavy.test(`${ref.structure} ${ref.editingStyle} ${ref.whyItWorks}`);
  if (feasible) {
    score += 20;
    lines.push('Dá para gravar sozinha.');
  } else {
    lines.push('Precisa de produção que ela não tem — serve de ideia, não de molde.');
  }

  if (ref.durationSeconds !== null && ref.durationSeconds <= 60) {
    score += 5;
    lines.push('Formato curto, do tamanho do que ela publica.');
  }

  if (ref.sourceConfidence === 'verified') score += 10;
  else if (ref.sourceConfidence === 'reported') score += 5;

  return { score: Math.max(0, Math.min(100, score)), lines };
}

/** Duas a três por marca, por ordem de utilidade.
 *
 *  O corte não é uma preferência de desenho: quatro referências por marca em
 *  seis marcas são vinte e quatro vídeos para ver antes de gravar um. */
export function rankReferences<T extends { ref: Reference; link: ReferenceLink }>(
  items: readonly T[],
  opts: { max?: number; now?: Date } = {},
): (T & { score: number; lines: string[] })[] {
  const now = opts.now ?? new Date();
  const max = opts.max ?? 3;
  return items
    .filter((i) => referenceIsUsable(i.ref))
    .map((i) => ({ ...i, ...scoreReference(i.ref, i.link, now) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
