/** Referências criativas: o que é uma boa, e por que ordem aparecem.
 *
 *  A tentação é ordenar por views. Um vídeo com três milhões de visualizações
 *  não é uma boa referência se a Carol não o consegue gravar sozinha em casa —
 *  é uma boa referência para quem tem equipe. O que interessa é o que se
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

/** Uma data que o Postgres aceite, ou nada.
 *
 *  O modelo devolve `published_at` em prosa — «13 de maio de 2026», «há duas
 *  semanas» — e o schema aceita-o como texto. Escrito assim numa coluna `date`
 *  o INSERT rebenta, e a referência perdia-se em silêncio. Uma data que não se
 *  consegue ler é uma data que não se sabe: `null`, e a frescura passa a
 *  «sem data», que é verdade. */
export function asDate(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return Number.isNaN(Date.parse(iso[1])) ? null : iso[1];
  return null;
}

/** Endereços que o modelo escreve quando não tem um.
 *
 *  `https://www.youtube.com/watch?v=...` passa em qualquer teste de forma —
 *  tem esquema, tem ponto, não tem espaços — e não leva a lado nenhum. Foi o
 *  que entrou na primeira corrida real: o prompt proíbe inventar links e o
 *  modelo obedeceu escrevendo reticências, que é a versão honesta da invenção
 *  e igualmente inútil. */
const FAKE_URL = /(\.\.\.|…|\bVIDEO_?ID\b|\bEXAMPLE\b|\bexemplo\b|\bxxx+\b|\{|\}|<|>)/i;

/** A forma de um endereço de vídeo em cada plataforma.
 *
 *  O teste de reticências não chegou. A pesquisa devolve fichas de citação —
 *  cadeias longas em base64 — e o modelo, proibido de inventar um link, pegou
 *  numa dessas e vestiu-a de YouTube:
 *  `youtube.com/watch?v=AUZIYQHiWvUJ…iGQT30ws3xCvdnXLisGZ==`. Tem esquema, tem
 *  domínio, não tem reticências, e abre em «Este vídeo não está disponível».
 *  Foram as duas únicas referências que a primeira corrida real salvou, e são
 *  a razão de as ideias saírem pobres: não há vídeo nenhum por trás delas.
 *
 *  Um id do YouTube tem onze caracteres. Isto sabe-se sem ir à rede, e é o
 *  que separa um endereço de uma alegação. */
const VIDEO_SHAPE: { host: RegExp; path: RegExp }[] = [
  { host: /(^|\.)youtube\.com$/i, path: /^\/(shorts|live|embed)\/[\w-]{11}$|^\/watch$/i },
  { host: /(^|\.)youtu\.be$/i, path: /^\/[\w-]{11}$/ },
  { host: /(^|\.)instagram\.com$/i, path: /^\/(reel|reels|p|tv)\/[\w-]+/i },
  { host: /(^|\.)tiktok\.com$/i, path: /\/video\/\d+|^\/[\w.@-]+$/i },
  { host: /(^|\.)facebook\.com$/i, path: /^\/ads\/library|^\/(reel|watch|videos)\b/i },
];

/** `youtube.com/watch` leva o id no `v`, que tem de ter onze caracteres. */
const idDoWatch = (u: URL) => /^[\w-]{11}$/.test(u.searchParams.get('v') ?? '');

/** `false` só quando o endereço é de uma plataforma conhecida e não tem a
 *  forma de um vídeo dela. Um domínio que não conhecemos passa: a referência
 *  pode estar num blog, e recusar tudo o que não é dos cinco sítios era
 *  apertar mais do que o problema. */
export function looksLikeVideoUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return false;
  }
  const shape = VIDEO_SHAPE.find((s) => s.host.test(u.hostname));
  if (!shape) return true;
  if (!shape.path.test(u.pathname)) return false;
  if (/youtube\.com$/i.test(u.hostname) && u.pathname === '/watch') return idDoWatch(u);
  return true;
}

/** Onde ela publica. Um Reel e um TikTok são o molde do que ela grava; um
 *  vídeo de dez minutos do YouTube ensina alguma coisa e não é o formato. */
export const NATIVE_PLATFORMS: readonly ReferencePlatform[] = [
  'instagram',
  'tiktok',
  'meta_ads',
  'tiktok_creative_center',
];

/** O portão de qualidade.
 *
 *  Uma referência sem endereço não é uma referência: é uma alegação. Uma sem
 *  análise é um link, que é o trabalho que se queria evitar. As duas coisas
 *  reprovam, e reprovam com um motivo legível. */
export function referenceProblems(ref: Partial<Reference>): string[] {
  const out: string[] = [];
  const url = (ref.sourceUrl ?? '').trim();

  if (!/^https?:\/\/\S+\.\S+/.test(url)) out.push('sem endereço verificável');
  else if (FAKE_URL.test(url)) out.push('o endereço é um exemplo, não um vídeo');
  else if (!looksLikeVideoUrl(url)) out.push('o endereço não tem a forma de um vídeo daquela plataforma');
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

  // Gravável sozinha, em casa, com celular. É o filtro que separa uma
  // referência útil de uma produção com equipe.
  const heavy = /(drone|est[úu]dio|studio|equipa de|equipe de|crew|actores|atores|figura[çc][ãa]o|cen[áa]rio constru)/i;
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

  // O formato conta. Ela publica Reels e TikToks; uma referência do YouTube
  // ensina o mecanismo mas não é o molde, e estava a ganhar por ser a única
  // plataforma que a pesquisa consegue citar.
  if (NATIVE_PLATFORMS.includes(ref.platform)) {
    score += 12;
    lines.push(`É do formato que ela publica: ${PLATFORM_LABEL[ref.platform]}.`);
  } else {
    lines.push(`${PLATFORM_LABEL[ref.platform]}: serve o mecanismo, não o formato.`);
  }

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
