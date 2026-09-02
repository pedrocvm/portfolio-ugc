/** Tendências: o que está subindo, e se isso interessa à Carol.
 *
 *  Duas perguntas diferentes, e confundi-las é o erro clássico. «Está a
 *  funcionar» é um fato sobre o mundo; «vale a pena para ela» é um juízo
 *  sobre o perfil dela. Um vídeo com dez milhões de visualizações de alguém a
 *  saltar de um penhasco está funcionando e não interessa nada.
 *
 *  Uma tendência de há três meses também não é uma tendência: é história. Por
 *  isso a frescura entra no veredicto, e não só na etiqueta.
 *
 *  Puro. */

import type { Freshness } from '@/modules/references/domain';

export { FRESHNESS_LABEL, type Freshness } from '@/modules/references/domain';

/** Uma tendência envelhece muito mais depressa do que uma referência.
 *
 *  Uma referência é uma estrutura — problema, tentativa, produto, resolução —
 *  e essa continua funcionando daqui a um ano. Uma tendência é um momento: aos
 *  três meses já não está subindo, está descendo, e recomendá-la como atual
 *  é a forma mais rápida de a Carol publicar tarde. Daí duas escalas. */
export function trendFreshness(publishedAt: string | null | undefined, now: Date = new Date()): Freshness {
  if (!publishedAt) return 'unknown';
  const at = Date.parse(publishedAt);
  if (Number.isNaN(at)) return 'unknown';
  const days = Math.floor((now.getTime() - at) / 86_400_000);
  if (days < 0) return 'unknown';
  if (days <= 14) return 'fresh';
  if (days <= 45) return 'recent';
  if (days <= 90) return 'aging';
  return 'stale';
}

export const TREND_KINDS = [
  'format',
  'hook',
  'editing',
  'structure',
  'series',
  'audio',
  'text',
  'transition',
  'pov',
  'other',
] as const;

export type TrendKind = (typeof TREND_KINDS)[number];

export const TREND_KIND_LABEL: Record<TrendKind, string> = {
  format: 'formato',
  hook: 'gancho',
  editing: 'edição',
  structure: 'estrutura',
  series: 'série',
  audio: 'som',
  text: 'texto na tela',
  transition: 'transição',
  pov: 'ponto de vista',
  other: 'outro',
};

export const isTrendKind = (v: string): v is TrendKind =>
  (TREND_KINDS as readonly string[]).includes(v);

export type TrendPlatform = 'instagram' | 'tiktok' | 'youtube' | 'capcut' | 'multi' | 'other';

export type Trend = {
  title: string;
  kind: TrendKind;
  platform: TrendPlatform;
  description: string;
  whyTrending: string;
  /** Cada tendência tem de poder ser clicada. Sem prova é uma opinião. */
  evidence: { url: string; note?: string }[];
  publishedAt: string | null;
  detectedAt: string;
};

/** Chave estável entre corridas. Sem isto a mesma tendência entrava todos os
 *  dias com um id novo e a lista enchia-se de cópias com palavras trocadas. */
export function trendFingerprint(t: Pick<Trend, 'title' | 'kind' | 'platform'>): string {
  const slug = t.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    // Palavras curtas variam entre versões da mesma frase; as longas é que a
    // identificam.
    .filter((w) => w.length > 3)
    .sort()
    .slice(0, 6)
    .join('-');
  return `${t.platform}:${t.kind}:${slug}`;
}

export function dedupeTrends<T extends Pick<Trend, 'title' | 'kind' | 'platform'>>(
  trends: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of trends) {
    const key = trendFingerprint(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Uma tendência sem prova clicável não entra. */
export function trendProblems(t: Partial<Trend>): string[] {
  const out: string[] = [];
  if (!(t.title ?? '').trim()) out.push('sem nome');
  const links = (t.evidence ?? []).filter((e) => /^https?:\/\/\S+\.\S+/.test(e.url ?? ''));
  if (links.length === 0) out.push('sem prova clicável');
  if ((t.whyTrending ?? '').trim().length < 15) out.push('sem explicação de porque está subindo');
  return out;
}

export type FitVerdict = 'adopt' | 'adapt' | 'skip';

export type FitInput = {
  trend: Trend;
  /** O que o perfil dela diz que é natural. Vazio quando ainda não se observou
   *  o perfil — e nesse caso o encaixe é mais conservador, não mais otimista. */
  topics: readonly string[];
  avoidedFormats: readonly string[];
  /** Tolerância a aparecer a falar para a câmara, 0 a 1. */
  talkingHeadTolerance: number | null;
  /** Complexidade de edição que ela consegue, 0 a 1. */
  editingComplexity: number | null;
  now?: Date;
};

export type FitResult = {
  score: number;
  verdict: FitVerdict;
  reason: string;
  freshness: Freshness;
};

/** «Isto parece a Carol? Ela conseguia gravar? Aumenta a autoridade dela?»
 *
 *  Um número entre 0 e 100 e um veredicto. O número fica no backend; ela vê a
 *  frase. */
export function trendFit(input: FitInput): FitResult {
  const now = input.now ?? new Date();
  const fresh = trendFreshness(input.trend.publishedAt ?? input.trend.detectedAt, now);
  const reasons: string[] = [];
  let score = 40;

  const byFreshness: Record<Freshness, number> = { fresh: 25, recent: 12, aging: -10, stale: -35, unknown: 0 };
  score += byFreshness[fresh];
  if (fresh === 'stale') reasons.push('já passou o momento');
  else if (fresh === 'fresh') reasons.push('está acontecendo agora');

  const haystack = `${input.trend.title} ${input.trend.description} ${input.trend.whyTrending}`.toLowerCase();

  const hits = input.topics.filter((t) => t.trim() && haystack.includes(t.toLowerCase().trim()));
  if (hits.length) {
    score += Math.min(20, hits.length * 10);
    reasons.push(`toca no que ela já faz (${hits.slice(0, 2).join(', ')})`);
  } else if (input.topics.length) {
    score -= 5;
  }

  // Um formato que ela evita não é uma penalização: é um não.
  //
  // Enquanto foi só -40 pontos, «coreografia de dança» somava tanto por ser
  // recente e por tocar em edição que voltava a passar o corte. Uma tendência
  // que a faria sentir-se ridícula a gravar não se recupera com pontos.
  const avoided = input.avoidedFormats.find((f) => f.trim() && haystack.includes(f.toLowerCase().trim()));
  let vetoed = false;
  if (avoided) {
    vetoed = true;
    reasons.unshift(`é do tipo que ela evita (${avoided})`);
  }

  // Sem perfil observado não se assume que ela topa tudo.
  if (/talking ?head|a falar para a c[âa]mara|piece to camera/.test(haystack)) {
    const tol = input.talkingHeadTolerance ?? 0.5;
    score += Math.round((tol - 0.5) * 30);
    if (tol < 0.35) reasons.push('exige muito tempo a falar para a câmara');
  }

  if (/(motion|masking|keyframe|kinetic|3d|after effects)/.test(haystack)) {
    const skill = input.editingComplexity ?? 0.5;
    score += Math.round((skill - 0.5) * 24);
    if (skill < 0.35) reasons.push('a edição é mais pesada do que o costume dela');
  }

  // O que a marca vê. Uma tendência que só serve para entreter não constrói
  // autoridade, e a autoridade é o objetivo declarado do perfil.
  if (/(estrat[ée]gia|hook|gancho|edi[çc][ãa]o|performance|an[úu]ncio|brief|storytelling|creative)/.test(haystack)) {
    score += 12;
    reasons.push('dá para mostrar competência, não só entretenimento');
  }

  // Perigosa, ofensiva ou dependente de uma pessoa concreta: fora.
  if (/(desafio perigoso|prank|pol[ée]mic|drama de|expor algu[ée]m)/.test(haystack)) {
    vetoed = true;
    reasons.unshift('o ângulo não serve a imagem dela');
  }

  score = vetoed ? 0 : Math.max(0, Math.min(100, score));
  const verdict: FitVerdict = vetoed ? 'skip' : score >= 70 ? 'adopt' : score >= 45 ? 'adapt' : 'skip';

  const reason =
    reasons.length === 0
      ? verdict === 'skip'
        ? 'Não encontrei ligação ao que ela faz.'
        : 'Encaixa no que ela faz.'
      : `${reasons[0].charAt(0).toUpperCase()}${reasons[0].slice(1)}${reasons.length > 1 ? `; ${reasons.slice(1).join('; ')}` : ''}.`;

  return { score, verdict, reason, freshness: fresh };
}

/** Do funil de custo: descobrir é barato, analisar a fundo é caro.
 *
 *  Não se mandam cem vídeos a um modelo. Deduplica-se, tira-se o que já morreu
 *  de velho, e só o topo é que leva análise. */
export function shortlistForDeepAnalysis<T extends Pick<Trend, 'title' | 'kind' | 'platform' | 'publishedAt' | 'detectedAt'>>(
  trends: readonly T[],
  opts: { max?: number; now?: Date } = {},
): T[] {
  const now = opts.now ?? new Date();
  const max = opts.max ?? 12;
  return dedupeTrends(trends)
    .filter((t) => trendFreshness(t.publishedAt ?? t.detectedAt, now) !== 'stale')
    .slice(0, max);
}
