import { guessNiche, isExcludedNiche, prospectableNiches } from '@/modules/brands/niches';
import { normalizeDomain, normalizeName } from '@/modules/brands/identity';

/** Regras puras do agente de prospecção.
 *
 *  Tudo o que decide se uma marca entra, se um email presta e por que ordem
 *  aparecem vive aqui: sem rede, sem base de dados, sem modelo. É o que se
 *  consegue testar, e é onde a qualidade se defende. */

/* ── Quantidade ──────────────────────────────────────────────────────────── */

export const LIMITS = {
  min: 5,
  target: 8,
  max: 10,
  /** Abaixo disto não vale a pena mostrar. Nem para encher a lista. */
  minFitScore: 70,
  /** Quantas se pesquisam a fundo. Pesquisar cem para escolher oito é dinheiro
   *  queimado; o funil aperta antes de a pesquisa ficar cara. */
  maxDeepResearch: 24,
} as const;

/* ── Estratégia de procura ───────────────────────────────────────────────── */

export type Strategy = {
  niches: string[];
  countries: string[];
  angle: string;
  seed: string;
};

const COUNTRIES = ['Portugal', 'Espanha', 'Brasil', 'Reino Unido', 'Alemanha', 'internacional'];

/** Ângulos de procura. Rodam para não se encontrar sempre o mesmo tipo de
 *  empresa — «SaaS português» todos os dias devolve a mesma lista à terceira. */
const ANGLES = [
  'marcas com anúncios ativos e criativos repetitivos',
  'produtos lançados nos últimos meses',
  'marcas que já trabalham com creators mas só com influencers grandes',
  'empresas com bom produto e presença social fraca',
  'produtos que resolvem um incómodo diário demonstrável',
  'marcas em expansão para novos mercados',
];

/** O dia decide a estratégia, e o histórico afasta o que saiu há pouco.
 *
 *  Determinístico à-de-propósito: a mesma data dá a mesma estratégia, por isso
 *  correr duas vezes no mesmo dia não procura duas coisas diferentes. */
export function strategyFor(date: Date, recentNiches: readonly string[] = []): Strategy {
  const day = Math.floor(date.getTime() / 86400000);
  const pool = prospectableNiches().map((n) => n.id);

  // O que saiu nos últimos dias vai para o fim da fila, não para o lixo.
  const tired = new Set(recentNiches);
  const fresh = pool.filter((n) => !tired.has(n));
  const ordered = fresh.length >= 2 ? fresh : pool;

  const pick = <T,>(list: readonly T[], offset: number) => list[(day + offset) % list.length];

  const niches = [pick(ordered, 0), pick(ordered, 3)].filter(
    (v, i, a) => v !== undefined && a.indexOf(v) === i,
  ) as string[];

  return {
    niches,
    countries: [pick(COUNTRIES, 0), pick(COUNTRIES, 2)].filter(
      (v, i, a) => a.indexOf(v) === i,
    ),
    angle: pick(ANGLES, 0),
    seed: date.toISOString().slice(0, 10),
  };
}

/* ── Supressão e deduplicação ────────────────────────────────────────────── */

export type Known = {
  normalizedNames: ReadonlySet<string>;
  domains: ReadonlySet<string>;
  /** Nome normalizado → instante até ao qual não se mostra. */
  snoozed: ReadonlyMap<string, string>;
};

export type Candidate = {
  name: string;
  website?: string | null;
  domain?: string | null;
  nicheId?: string | null;
  /** O que a descoberta diz que a marca faz. Texto livre, e é por isso que
   *  precisa de ser lido: um id de nicho pode vir errado ou não vir. */
  description?: string | null;
};

export type Suppression =
  | { blocked: false }
  | { blocked: true; reason: 'known_brand' | 'known_domain' | 'snoozed' | 'excluded_niche' | 'no_name' };

/** Antes de gastar um token: isto já é conhecido, está adormecido, ou é de um
 *  nicho que não se aborda? */
export function suppress(c: Candidate, known: Known, now: Date): Suppression {
  const name = normalizeName(c.name);
  if (!name) return { blocked: true, reason: 'no_name' };

  // Skincare e haircare estão fora da estratégia — em código, não em prompt.
  //
  // Duas verificações e não uma: a descoberta devolve texto livre, e confiar
  // só no id de nicho deixava passar tudo o que viesse mal classificado ou por
  // classificar. O que a marca diz que faz também conta.
  if (isExcludedNiche(c.nicheId)) return { blocked: true, reason: 'excluded_niche' };
  const guessed = guessNiche(c.description, c.name);
  if (guessed && isExcludedNiche(guessed.id)) return { blocked: true, reason: 'excluded_niche' };

  const until = known.snoozed.get(name);
  if (until && new Date(until) > now) return { blocked: true, reason: 'snoozed' };

  if (known.normalizedNames.has(name)) return { blocked: true, reason: 'known_brand' };

  const domain = normalizeDomain(c.domain ?? c.website ?? null);
  if (domain && known.domains.has(domain)) return { blocked: true, reason: 'known_domain' };

  return { blocked: false };
}

/** Duas candidatas da mesma corrida podem ser a mesma empresa com nomes
 *  diferentes. Marcas fundem-se por identificador, nunca por nome parecido:
 *  o domínio é o identificador, o nome normalizado é a última hipótese. */
export function dedupe<T extends Candidate>(candidates: readonly T[]): T[] {
  const byDomain = new Map<string, T>();
  const byName = new Map<string, T>();
  const out: T[] = [];

  for (const c of candidates) {
    const domain = normalizeDomain(c.domain ?? c.website ?? null);
    const name = normalizeName(c.name);
    if (!name) continue;
    if (domain && byDomain.has(domain)) continue;
    if (!domain && byName.has(name)) continue;
    if (domain) byDomain.set(domain, c);
    byName.set(name, c);
    out.push(c);
  }
  return out;
}

/* ── Porta de qualidade do email ─────────────────────────────────────────── */

export type EmailInput = {
  subject: string;
  body: string;
  brandName: string;
  /** O produto ou funcionalidade concreta que o email nomeia. */
  product: string | null;
  /** Afirmações factuais que o email faz, cada uma com a fonte que a sustenta. */
  claims: { text: string; sourceId: string | null }[];
};

export type QualityResult = {
  pass: boolean;
  score: number;
  failures: string[];
  scores: Record<string, number>;
};

/** Frases que servem para qualquer empresa. Se o email vive delas, não foi
 *  escrito para ninguém. */
const GENERIC = [
  'espero que estejam bem',
  'adoro a vossa marca',
  'adoro o vosso trabalho',
  'sou uma grande fã',
  'gostaria de propor uma parceria',
  'acredito que podemos criar algo incrível',
  'vi o vosso perfil e adorei',
  'hope this email finds you well',
  'i love your brand',
  'i am a big fan',
  'i would love to collaborate',
];

const lower = (s: string) => s.toLowerCase();

/** Corre antes de a Carol ver o email. Um email que passa isto não é
 *  necessariamente bom; um que falha é seguramente mau. */
export function scoreEmail(input: EmailInput): QualityResult {
  const body = lower(input.body);
  const words = input.body.trim().split(/\s+/).filter(Boolean).length;
  const failures: string[] = [];
  const scores: Record<string, number> = {};

  // Personalização: nomeia a marca e um produto concreto.
  const namesBrand = body.includes(lower(input.brandName));
  const namesProduct = Boolean(input.product && body.includes(lower(input.product)));
  scores.personalization = (namesBrand ? 50 : 0) + (namesProduct ? 50 : 0);
  if (!namesBrand) failures.push('não nomeia a marca');
  if (!namesProduct) failures.push('não nomeia um produto ou funcionalidade concreta');

  // Genericidade: cada frase de catálogo tira pontos.
  const hits = GENERIC.filter((g) => body.includes(g));
  scores.genericness = Math.max(0, 100 - hits.length * 45);
  if (hits.length) failures.push(`frases genéricas: ${hits.join('; ')}`);

  // Factualidade: nenhuma afirmação sem fonte. Inventar uma observação sobre
  // a marca é a forma mais rápida de queimar a primeira impressão.
  const unsourced = input.claims.filter((c) => !c.sourceId);
  scores.factuality = input.claims.length === 0 ? 60 : Math.round((1 - unsourced.length / input.claims.length) * 100);
  if (unsourced.length) failures.push(`${unsourced.length} afirmações sem fonte`);

  // Comprimento: um email frio longo não se lê.
  scores.length = words >= 60 && words <= 220 ? 100 : words < 60 ? 40 : Math.max(0, 100 - (words - 220));
  if (words > 260) failures.push(`demasiado longo (${words} palavras)`);
  if (words < 45) failures.push(`demasiado curto (${words} palavras)`);

  // Assunto: existe, é curto, e não é o assunto de toda a gente.
  const subject = input.subject.trim();
  const lazySubject = /^(ugc|parceria|colabora|partnership|collaboration)/i.test(subject);
  scores.subject = subject.length === 0 ? 0 : lazySubject ? 40 : subject.length <= 78 ? 100 : 60;
  if (!subject) failures.push('sem assunto');
  if (lazySubject) failures.push('assunto genérico');

  // Um pedido claro, e um só.
  const hasCta = /\?|\b(faz sentido|interessa|posso|quer[ie]|podemos|would you|are you open|shall i)\b/i.test(input.body);
  scores.cta = hasCta ? 100 : 0;
  if (!hasCta) failures.push('sem pedido claro no fim');

  const score = Math.round(
    scores.personalization * 0.3 +
      scores.genericness * 0.2 +
      scores.factuality * 0.25 +
      scores.length * 0.1 +
      scores.subject * 0.075 +
      scores.cta * 0.075,
  );

  // Personalização e factualidade não se compensam com o resto: um email
  // impecável sobre fatos inventados continua a ser um email a rejeitar.
  const hardFail = scores.personalization < 50 || scores.factuality < 70 || scores.genericness < 60;

  return { pass: !hardFail && score >= 70, score, failures, scores };
}

/* ── Ordenação ───────────────────────────────────────────────────────────── */

export type Rankable = {
  fitScore: number;
  quality: number;
  paidMediaSignal: 'none' | 'weak' | 'medium' | 'strong' | null;
  emailConfidence: 'verified' | 'high' | 'medium' | 'low' | 'unknown' | null;
  redFlags: readonly string[];
};

const PAID = { strong: 12, medium: 8, weak: 3, none: 0 } as const;
const CONFIDENCE = { verified: 8, high: 6, medium: 3, low: -4, unknown: -6 } as const;

/** Encaixe é a base; sinal de que compram criativos e um contato em que se
 *  confia decidem os desempates. Bandeiras vermelhas descem, não eliminam. */
export function rankScore(c: Rankable): number {
  return (
    c.fitScore +
    c.quality * 0.25 +
    PAID[c.paidMediaSignal ?? 'none'] +
    CONFIDENCE[c.emailConfidence ?? 'unknown'] -
    c.redFlags.length * 5
  );
}

/** Escolhe o que mostrar hoje. Devolve menos do que o alvo sem pedir desculpa:
 *  encher a lista com leads maus é o oposto do que isto existe para fazer. */
export function selectDaily<T extends Rankable>(
  candidates: readonly T[],
  limits: { minFitScore: number; max: number } = LIMITS,
): T[] {
  return [...candidates]
    .filter((c) => c.fitScore >= limits.minFitScore)
    .sort((a, b) => rankScore(b) - rankScore(a))
    .slice(0, limits.max);
}
