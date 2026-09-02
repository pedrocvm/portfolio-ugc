/** O conteúdo próprio da Carol: pilares, repetição, e o que separa uma ideia
 *  de um lugar-comum.
 *
 *  Duas regras governam este módulo:
 *
 *  1. Uma ideia genérica é pior do que nenhuma. «5 dicas para ser UGC creator»
 *     é conteúdo que qualquer pessoa podia ter escrito sem conhecer a Carol —
 *     e conteúdo que qualquer pessoa podia ter escrito não constrói autoridade
 *     nenhuma.
 *
 *  2. O Instagram e o TikTok não são o mesmo vídeo com outro tamanho. Publicar
 *     o Reel tal e qual no TikTok é o erro que faz o TikTok não crescer.
 *
 *  Puro. Sem base de dados, sem modelo. */

export const PILLARS = [
  'UGC_AUTHORITY',
  'CREATIVE_STRATEGY',
  'EDITING',
  'BEHIND_THE_SCENES',
  'CREATOR_JOURNEY',
  'BUSINESS',
  'PORTFOLIO',
  'LIFESTYLE',
  'CREATOR_EDUCATION',
] as const;

export type Pillar = (typeof PILLARS)[number];

export const isPillar = (v: string): v is Pillar => (PILLARS as readonly string[]).includes(v);

export const PILLAR_LABEL: Record<Pillar, string> = {
  UGC_AUTHORITY: 'Autoridade em UGC',
  CREATIVE_STRATEGY: 'Estratégia criativa',
  EDITING: 'Edição e CapCut',
  BEHIND_THE_SCENES: 'Bastidores',
  CREATOR_JOURNEY: 'A jornada',
  BUSINESS: 'Negócio e prospecção',
  PORTFOLIO: 'Portefólio e casos',
  LIFESTYLE: 'Vida e contexto',
  CREATOR_EDUCATION: 'Ensinar creators',
};

/** Para quem é que cada pilar fala.
 *
 *  Isto existe por uma razão de estratégia: um perfil optimizado só para
 *  atrair creators aspirantes deixa de parecer uma creator que as marcas
 *  contratam. Os dois públicos podem coexistir — desde que alguém conte. */
export const PILLAR_AUDIENCE: Record<Pillar, 'brand' | 'creator' | 'both'> = {
  UGC_AUTHORITY: 'brand',
  CREATIVE_STRATEGY: 'brand',
  EDITING: 'both',
  BEHIND_THE_SCENES: 'both',
  CREATOR_JOURNEY: 'both',
  BUSINESS: 'creator',
  PORTFOLIO: 'brand',
  LIFESTYLE: 'both',
  CREATOR_EDUCATION: 'creator',
};

export type Platform = 'instagram' | 'tiktok';

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

/* ── Equilíbrio de pilares ────────────────────────────────────────────────── */

/** Que pilares evitar hoje, a partir do que já saiu.
 *
 *  Não é uma grelha rígida — é uma memória. Se os últimos três foram todos de
 *  edição, o quarto não devia ser. */
export function recentlyUsedPillars(
  history: readonly { pillar: string; at: string }[],
  opts: { window?: number } = {},
): Pillar[] {
  const window = opts.window ?? 5;
  return [...history]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, window)
    .map((h) => h.pillar)
    .filter(isPillar);
}

/** A ordem por que os pilares devem ser tentados hoje.
 *
 *  Primeiro os que não saem há mais tempo. Depois, entre iguais, os que falam
 *  com marcas — porque é isso que paga. */
export function pillarPriority(
  history: readonly { pillar: string; at: string }[],
  opts: { audienceTilt?: 'brand' | 'creator' | 'balanced' } = {},
): Pillar[] {
  const recentes = recentlyUsedPillars(history, { window: 8 });
  const posicao = new Map<Pillar, number>();
  recentes.forEach((p, i) => {
    if (!posicao.has(p)) posicao.set(p, i);
  });

  const tilt = opts.audienceTilt ?? 'balanced';
  const bonus = (p: Pillar) => {
    const a = PILLAR_AUDIENCE[p];
    if (tilt === 'balanced') return a === 'brand' ? 0.5 : 0;
    return a === tilt ? 1 : a === 'both' ? 0.5 : 0;
  };

  return [...PILLARS].sort((a, b) => {
    // Nunca usado vem primeiro: `Infinity` é literalmente «há mais tempo».
    const ra = posicao.has(a) ? posicao.get(a)! : Infinity;
    const rb = posicao.has(b) ? posicao.get(b)! : Infinity;
    if (ra !== rb) return rb - ra;
    return bonus(b) - bonus(a);
  });
}

/** O equilíbrio entre públicos, contado em vez de esperado.
 *
 *  «Não deixar o sistema optimizar só para atrair aspirantes a creator» só é
 *  verificável se alguém contar. */
export function audienceBalance(
  history: readonly { pillar: string }[],
): { brand: number; creator: number; both: number; tilt: 'brand' | 'creator' | 'balanced' } {
  let brand = 0;
  let creator = 0;
  let both = 0;
  for (const h of history) {
    if (!isPillar(h.pillar)) continue;
    const a = PILLAR_AUDIENCE[h.pillar];
    if (a === 'brand') brand++;
    else if (a === 'creator') creator++;
    else both++;
  }
  const total = brand + creator + both;
  if (total < 3) return { brand, creator, both, tilt: 'balanced' };
  // Inclina-se para o lado que está a faltar, não para o que já domina.
  if (creator > brand * 2) return { brand, creator, both, tilt: 'brand' };
  if (brand > creator * 3) return { brand, creator, both, tilt: 'creator' };
  return { brand, creator, both, tilt: 'balanced' };
}

/* ── Repetição ────────────────────────────────────────────────────────────── */

/** Palavras que não identificam uma ideia.
 *
 *  Sem a segunda linha, «Um UGC bonito pode ser um anúncio mau» e «Anúncio
 *  mau: quando o UGC é bonito» tinham impressões digitais diferentes — a
 *  primeira ficava com «pode» e a segunda com «quando», e o mesmo ângulo
 *  voltava na semana seguinte por causa de um verbo auxiliar. */
const STOP = new Set([
  'para','como','isso','esse','essa','esta','este','meu','minha','uma','com','que','por','dos','das',
  'não','nao','the','and','you','your','sobre','mais','pelo','pela','num','numa','fazer','faz','tem',
  'pode','podem','quando','onde','porque','porque','ainda','depois','antes','entre','sempre','nunca',
  'tudo','muito','muita','umas','meus','minhas','seja','esta','estao','está','estão','foi','ter',
  'vamos','vais','todo','toda','todos','todas','coisa','coisas','ser','sem',
]);

/** Impressão digital de uma ideia: o que ela é sobre, não como está escrita.
 *
 *  Duas ideias com o mesmo gancho reescrito são a mesma ideia. Sem isto, o
 *  mesmo assunto voltava todas as semanas com palavras diferentes. */
export function ideaFingerprint(idea: { platform: string; pillar: string; hook: string; title?: string }): string {
  const palavras = `${idea.title ?? ''} ${idea.hook}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 3 && !STOP.has(w));

  const nucleo = [...new Set(palavras)].sort().slice(0, 6).join('-');
  return `${idea.platform}:${idea.pillar}:${nucleo}`;
}

/** Quão parecida é uma ideia com as que já existem, 0 a 1. */
export function similarity(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((w) => w.length > 3 && !STOP.has(w)),
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return comuns / Math.min(ta.size, tb.size);
}

export function isRepeat(
  idea: { platform: string; pillar: string; hook: string; title?: string },
  previous: readonly { fingerprint: string; hook: string }[],
  opts: { threshold?: number } = {},
): { repeat: boolean; because: string | null } {
  const fp = ideaFingerprint(idea);
  const igual = previous.find((p) => p.fingerprint === fp);
  if (igual) return { repeat: true, because: 'já foi sugerida com este mesmo ângulo' };

  const limite = opts.threshold ?? 0.7;
  const parecida = previous.find((p) => similarity(idea.hook, p.hook) >= limite);
  if (parecida) return { repeat: true, because: 'o gancho é quase o mesmo de uma anterior' };

  return { repeat: false, because: null };
}

/** Que tendências alimentaram esta ideia.
 *
 *  Isto comparava o título da tendência com o texto da ideia por igualdade de
 *  cadeia — exigia que o modelo repetisse o título ao caractere, o que nunca
 *  aconteceu. Resultado: `trend_ids` sempre vazio, e a secção «de onde veio»
 *  sempre em branco numa tela que promete que toda a tendência é clicável.
 *
 *  Compara-se agora por sobreposição de palavras, que é como se reconhece um
 *  assunto. O limiar é baixo de propósito: falhar uma ligação verdadeira é
 *  pior do que citar uma tendência a mais, porque o custo de citar a mais é
 *  ela clicar e discordar, e o de falhar é a tela mentir por omissão. */
export function matchTrends<T extends { id: string; title: string; description?: string }>(
  idea: { whyNow: string; script: string; hook: string },
  trends: readonly T[],
  opts: { threshold?: number } = {},
): string[] {
  const limite = opts.threshold ?? 0.34;
  const texto = `${idea.whyNow} ${idea.hook} ${idea.script}`;
  return trends
    .filter((t) => similarity(texto, `${t.title} ${t.description ?? ''}`) >= limite)
    .map((t) => t.id);
}

/* ── Porta anti-genérico ──────────────────────────────────────────────────── */

/** Ganchos que qualquer pessoa podia ter escrito sem conhecer a Carol.
 *  Cada um destes apareceu num perfil de creator qualquer esta semana. */
const GENERIC = [
  /^\s*\d+\s+(dicas|erros|coisas|passos|formas|maneiras)\b/i,
  /\b(dicas|erros) que (voc[êe]|tu|ningu[ée]m)\b/i,
  // «O que ninguém DIZ sobre…» passou na primeira corrida real, porque a regra
  // só conhecia «conta» e «contou» e exigia o «te». A fórmula é a mesma e o
  // resultado também: um título que qualquer creator já publicou.
  /\bo que ningu[ée]m (te )?(conta|contou|diz|disse|fala|falou)\b/i,
  /\bsegredos? (do|da|de)\b/i,
  /\bcomo (ganhar|fazer) dinheiro (com|na|no)\b/i,
  /\bguia (completo|definitivo)\b/i,
  /\btudo o que (precisas?|voc[êe] precisa) (de )?saber\b/i,
  /\bverdade que ningu[ée]m\b/i,
];

export type QualityDims = {
  /** Podia ter sido escrita sem conhecer a Carol? */
  originality: number;
  /** Nomeia uma coisa concreta — um produto, um número, um momento? */
  specificity: number;
  /** Parece ela? */
  carolFit: number;
  /** Uma marca aprende alguma coisa sobre a competência dela? */
  authority: number;
  /** Há razão para comentar, guardar ou partilhar? */
  engagement: number;
  /** Consegue gravar isto sozinha, hoje? */
  recordability: number;
  /** É nativo desta plataforma? */
  platformNative: number;
  /** A referência ou tendência de que nasce ainda é actual? */
  freshness: number;
};

export const QUALITY_KEYS: (keyof QualityDims)[] = [
  'originality', 'specificity', 'carolFit', 'authority',
  'engagement', 'recordability', 'platformNative', 'freshness',
];

/** Um número por dimensão no backend; uma frase à frente dela.
 *
 *  Mostrar oito números obrigava-a a aprender a escala. A frase não. */
export function qualityVerdict(dims: Partial<QualityDims>): {
  score: number;
  verdict: 'record_today' | 'good_not_urgent' | 'reject';
  phrase: string;
} {
  const valores = QUALITY_KEYS.map((k) => dims[k]).filter((v): v is number => typeof v === 'number');
  const score = valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : 0;

  // Uma ideia genérica ou que ela não consegue gravar não sobe por média:
  // essas duas dimensões têm veto.
  const generica = (dims.originality ?? 100) < 40;
  const impossivel = (dims.recordability ?? 100) < 40;

  if (generica || impossivel) {
    return {
      score,
      verdict: 'reject',
      phrase: generica
        ? 'Isto podia ser de qualquer pessoa. Não vale gravar.'
        : 'Boa ideia, mas não dá para gravar sozinha.',
    };
  }
  if (score >= 72) return { score, verdict: 'record_today', phrase: 'Eu gravaria este hoje.' };
  return { score, verdict: 'good_not_urgent', phrase: 'Boa ideia, mas não é urgente.' };
}

/** O que reprova antes sequer de haver nota. */
export function genericProblems(idea: { hook: string; script?: string; title?: string }): string[] {
  const out: string[] = [];
  const hook = (idea.hook ?? '').trim();

  if (hook.length < 15) out.push('o gancho é demasiado curto para prender alguém');
  for (const re of GENERIC) {
    if (re.test(hook) || re.test(idea.title ?? '')) {
      out.push('o ângulo é o lugar-comum que qualquer creator já publicou');
      break;
    }
  }
  // «Mastigado significa mastigado»: sem guião, não é trabalho preparado.
  if ((idea.script ?? '').trim().split(/\s+/).filter(Boolean).length < 30) {
    out.push('não há guião suficiente para pegar no telemóvel e gravar');
  }
  return out;
}

/* ── Plataforma ───────────────────────────────────────────────────────────── */

/** O que cada plataforma pede, dito para ir dentro do prompt e para ir dentro
 *  do teste. Uma constante partilhada é o que garante que a diferença existe
 *  mesmo, em vez de ser uma promessa no texto do prompt. */
export const PLATFORM_BRIEF: Record<Platform, { objective: string; treatment: string; avoid: string }> = {
  instagram: {
    objective:
      'Autoridade e prova de competência. O vídeo é portefólio: uma marca que o veja tem de perceber que ela sabe o que faz.',
    treatment:
      'Mais cuidado, mais limpo, identidade visual consistente. Feito para guardar e partilhar. Legenda que acrescenta, não que repete.',
    avoid: 'Espontaneidade descuidada; humor interno de creators; conteúdo que só faz sentido para quem já a segue.',
  },
  tiktok: {
    objective:
      'Watch time e comentários. Curiosidade primeiro, contexto depois. História acima de produção.',
    treatment:
      'Gancho no primeiro segundo, ritmo falado, menos polimento quando o polimento afasta. Serializável: um episódio pede o seguinte.',
    avoid: 'Reel republicado tal e qual; abertura com apresentação; linguagem de legenda de Instagram.',
  },
};

/** Duas ideias que são a mesma ideia com outro tamanho é o erro que se quer
 *  evitar. Isto verifica-o em vez de o pedir por favor. */
export function platformTreatmentsDiffer(
  a: { platform: Platform; hook: string; format: string; script?: string },
  b: { platform: Platform; hook: string; format: string; script?: string },
): { differ: boolean; because: string } {
  if (a.platform === b.platform) return { differ: true, because: 'são da mesma plataforma' };
  if (similarity(a.hook, b.hook) >= 0.7) return { differ: false, because: 'o gancho é o mesmo nas duas' };
  if (a.format.trim().toLowerCase() === b.format.trim().toLowerCase() && similarity(a.script ?? '', b.script ?? '') >= 0.6) {
    return { differ: false, because: 'o formato e o guião são os mesmos' };
  }
  return { differ: true, because: 'tratamentos diferentes' };
}

/* ── Carga e envelhecimento ───────────────────────────────────────────────── */

/** Se já há sete ideias boas por gravar, não se fazem mais catorze.
 *
 *  Uma lista que cresce mais depressa do que se consome deixa de ser um plano
 *  e passa a ser uma dívida. */
export function shouldGenerate(
  readyCount: number,
  opts: { cap?: number } = {},
): { generate: boolean; refreshOnly: boolean; because: string } {
  const cap = opts.cap ?? 6;
  if (readyCount >= cap + 3) {
    return {
      generate: false,
      refreshOnly: true,
      because: `Já há ${readyCount} ideias por gravar. Em vez de somar, refresco a ordem e substituo as que envelheceram.`,
    };
  }
  if (readyCount >= cap) {
    return { generate: true, refreshOnly: true, because: `Há ${readyCount} por gravar: substituo em vez de acrescentar.` };
  }
  return { generate: true, refreshOnly: false, because: '' };
}

/** Uma ideia nascida de uma tendência morre com ela. */
export function isStale(
  idea: { freshUntil: string | null; generatedAt: string },
  now: Date = new Date(),
): boolean {
  if (idea.freshUntil) return Date.parse(idea.freshUntil) < now.getTime();
  // Sem prazo declarado, três semanas. Uma ideia de autoridade envelhece
  // devagar, mas nenhuma envelhece nunca.
  return now.getTime() - Date.parse(idea.generatedAt) > 21 * 86_400_000;
}

/** O prazo de validade de uma ideia, a partir do que a alimentou. */
export function freshUntilFor(
  source: { trendFreshness?: string | null; hasTrend: boolean },
  now: Date = new Date(),
): string | null {
  if (!source.hasTrend) return null;
  const dias = source.trendFreshness === 'fresh' ? 10 : source.trendFreshness === 'recent' ? 21 : 7;
  return new Date(now.getTime() + dias * 86_400_000).toISOString().slice(0, 10);
}

/* ── Séries ───────────────────────────────────────────────────────────────── */

/** Uma série não se força todos os dias. Precisa de premissa, estrutura
 *  repetível, nome reconhecível e episódios pela frente. */
export function seriesIsViable(s: {
  name: string;
  premise: string;
  structure: string;
  nextTopics: readonly string[];
}): { viable: boolean; missing: string[] } {
  const missing: string[] = [];
  if (s.name.trim().length < 3) missing.push('nome');
  if (s.premise.trim().length < 25) missing.push('premissa');
  if (s.structure.trim().length < 25) missing.push('estrutura repetível');
  if (s.nextTopics.filter((t) => t.trim()).length < 2) missing.push('episódios pela frente');
  return { viable: missing.length === 0, missing };
}

/* ── Tempo ────────────────────────────────────────────────────────────────── */

/** Estimativa de gravação a partir do que a ideia pede.
 *
 *  Não é precisão absurda: é uma ordem de grandeza que ajuda a decidir se cabe
 *  antes do almoço. Com histórico real, o serviço corrige por cima. */
export function estimateMinutes(idea: {
  shots: number;
  durationSeconds: number | null;
  editingComplexity: 'simple' | 'medium' | 'heavy';
}): { record: number; edit: number } {
  const takes = Math.max(1, idea.shots);
  const record = Math.max(5, Math.round(takes * 2.5 + (idea.durationSeconds ?? 30) / 15));
  const peso = { simple: 1, medium: 1.8, heavy: 3 }[idea.editingComplexity];
  const edit = Math.max(8, Math.round(takes * 2 * peso + 6));
  return { record, edit };
}
