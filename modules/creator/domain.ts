/** O conteúdo próprio da Carol: repetição, energia, e o que separa uma ideia
 *  dela de uma ideia de qualquer creator.
 *
 *  Os pilares e a estratégia vivem em `strategy.ts`, que é a auditoria do
 *  Instagram feita estrutura. Este arquivo é o que decide, caso a caso, se uma
 *  ideia concreta passa.
 *
 *  Três regras governam-no:
 *
 *  1. Uma ideia que qualquer creator podia gravar trocando o rosto é fraca. O
 *     que é forte nasce dos dez anos de sala, do ceticismo, da casa, da pele —
 *     coisas que só ela tem.
 *
 *  2. Autoridade sim, professora não. A Carol mostra competência; não a
 *     afirma. «5 dicas de UGC» não é conteúdo dela, é conteúdo de guru.
 *
 *  3. O Instagram e o TikTok não são o mesmo vídeo com outro tamanho.
 *
 *  Puro. Sem base de dados, sem modelo. */

export {
  PILLARS, PILLAR_LABEL, PILLAR_SPEC, isPillar,
  AUDIENCE_PRIORITY, AUDIENCE_SPEC, CONTENT_DNA, ANTI_PATTERNS,
  PREFERRED_FORMATS, WEAK_FORMATS, SERIES_CANDIDATES, RESEARCH_TERRITORIES,
  HYPOTHESES, SUCCESS_SIGNALS, STRATEGY, STRATEGY_VERSION, STRATEGY_SOURCE, RESEARCH_MARKET,
  POSITIONING, NORTH_STAR, describeStrategy,
  type Pillar, type PillarSpec, type Audience, type SeriesCandidate,
  type CreatorContentStrategy, type Hypothesis,
} from './strategy';

import {
  ANTI_PATTERNS as _ANTI,
  PILLARS,
  PILLAR_SPEC,
  isPillar,
  type Pillar,
} from './strategy';

void _ANTI;

export type Platform = 'instagram' | 'tiktok';

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

/* ── Equilíbrio de pilares ────────────────────────────────────────────────── */

/** Que pilares evitar hoje, a partir do que já saiu.
 *
 *  Não é uma grelha rígida — é uma memória. Se os últimos três foram todos da
 *  sala, o quarto não devia ser. */
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

/** Quanto é que cada pilar está abaixo ou acima do peso que devia ter.
 *
 *  A auditoria dá pesos alvo — 30% para a sala, 25% para o teste, e por aí —
 *  e a única forma de os respeitar é comparar com o que saiu mesmo. Positivo
 *  quer dizer «está em falta». */
export function pillarDebt(
  history: readonly { pillar: string }[],
): Record<Pillar, number> {
  const contados = history.filter((h) => isPillar(h.pillar));
  const total = contados.length;
  const saida = {} as Record<Pillar, number>;

  for (const p of PILLARS) {
    const quantos = contados.filter((h) => h.pillar === p).length;
    const real = total === 0 ? 0 : quantos / total;
    saida[p] = PILLAR_SPEC[p].weight - real;
  }
  return saida;
}

/** A ordem por que os pilares devem ser tentados hoje.
 *
 *  Primeiro o que está mais em falta face ao peso alvo; entre iguais, o que
 *  não sai há mais tempo. Sem história nenhuma, a ordem é a dos pesos — o que
 *  põe «A sala» em primeiro, que é exatamente o que a auditoria diz que está
 *  a ser desperdiçado. */
export function pillarPriority(
  history: readonly { pillar: string; at: string }[],
): Pillar[] {
  const debt = pillarDebt(history);
  const recentes = recentlyUsedPillars(history, { window: 8 });
  const posicao = new Map<Pillar, number>();
  recentes.forEach((p, i) => {
    if (!posicao.has(p)) posicao.set(p, i);
  });

  return [...PILLARS].sort((a, b) => {
    if (Math.abs(debt[b] - debt[a]) > 0.02) return debt[b] - debt[a];
    // Nunca usado vem primeiro: `Infinity` é literalmente «há mais tempo».
    const ra = posicao.has(a) ? posicao.get(a)! : Infinity;
    const rb = posicao.has(b) ? posicao.get(b)! : Infinity;
    if (ra !== rb) return rb - ra;
    return PILLAR_SPEC[b].weight - PILLAR_SPEC[a].weight;
  });
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
 *  aconteceu. Resultado: `trend_ids` sempre vazio, e a seção «de onde veio»
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

/* ── «A Carol é substituível?» ────────────────────────────────────────────── */

/** Marcas do que só ela tem. Não é uma lista de palavras-chave bonita: cada
 *  uma sai de um fato da auditoria — dez anos de sala, o namorado que
 *  constrói, a rosácea, a Paraíba, a casa a nascer. */
const SIGNATURE = [
  /\b(sala|mesa|pedido|turno|servi[çc]o|restaurante|fine dining|ementa|cliente|gar[çc]on|card[áa]pio|atend|maitre|ma[îi]tre|pizzaria|bal[cç][ãa]o)\b/i,
  /\b(namorado|ele construiu|ele fez|a dois|casa nova|apartamento|mud[áa]mos|c[ée]tic|emburrad|sem facilitar|[àa] bruta)\b/i,
  /\b(ros[áa]cea|pele a arder|pele reativa|cabelo estragado|incêndio|bombeiro)\b/i,
  /\b(para[íi]ba|\bPB\b|porto|braga|brasileira em portugal|sotaque|portugu[êe]s de portugal)\b/i,
  /\b(larguei|deixei o restaurante|dez anos|10 anos|mudan[çc]a de carreira|primeiro cliente)\b/i,
];

/** «Este vídeo podia ser gravado praticamente igual por qualquer outra creator
 *  de UGC?»
 *
 *  É o teste mais importante que a auditoria propõe, e o mais fácil de falhar
 *  sem dar por isso: uma ideia correta, bem escrita e completamente anónima
 *  passa em todos os outros portões. */
export function replaceability(idea: {
  hook: string;
  script: string;
  title?: string;
  whyNow?: string;
}): { replaceable: boolean; marks: number; because: string } {
  const texto = `${idea.title ?? ''} ${idea.hook} ${idea.script} ${idea.whyNow ?? ''}`;
  const marks = SIGNATURE.filter((re) => re.test(texto)).length;

  if (marks === 0) {
    return {
      replaceable: true,
      marks,
      because: 'qualquer creator gravava isto trocando o rosto — não há nada dela lá dentro',
    };
  }
  return { replaceable: false, marks, because: '' };
}

/* ── Anti-guru ────────────────────────────────────────────────────────────── */

/** Sinais de que a ideia põe a Carol a dar aulas.
 *
 *  A auditoria é categórica: com quinze posts e nenhuma autoridade de ensino,
 *  vestir a personagem de professora atrai creators e afasta as marcas de
 *  dermocosmética e de casa que a pagariam. Autoridade sim, professora não. */
const GURU = [
  /\b(dicas|passos|regras|erros) (para|pra|de) (ser|fazer|come[çc]ar|melhorar)\b/i,
  /\bcomo (conseguir|ganhar|fechar|cobrar|come[çc]ar) (o teu|a tua|teu|seu|mais)\b/i,
  /\bo que (todo|toda|todos|todas) (creator|criador)/i,
  /\b(ensino|vou ensinar|aprende comigo|te ensino|aula|tutorial completo|masterclass|mentoria)\b/i,
  /\bferramentas que (todo|todos|toda)\b/i,
  /\bmétodo (infal[íi]vel|que funciona)\b/i,
  /\bse quiseres viver do digital\b/i,
];

export function guruProblems(idea: { hook: string; title?: string; script?: string }): string[] {
  const texto = `${idea.title ?? ''} ${idea.hook}`;
  for (const re of GURU) {
    if (re.test(texto)) {
      return ['põe-na a dar aulas — ela mostra competência, não a ensina'];
    }
  }
  return [];
}

/* ── Anti-catálogo ────────────────────────────────────────────────────────── */

/** Uma peça que é só produto bonito, lista de funcionalidades ou montagem
 *  estética. Continua valendo como portfólio; não vale como post orgânico.
 *
 *  A auditoria chama-lhe o erro do perfil atual: quarenta e cinco por cento do
 *  grid é inventário de cliente, e é onde ela desaparece do próprio feed. */
export function catalogProblems(idea: {
  hook: string;
  script?: string;
  format?: string;
  onScreenText?: readonly string[];
}): string[] {
  const out: string[] = [];
  const texto = `${idea.hook} ${idea.script ?? ''}`;

  if (/\b(muda|mudo|sem fala|sem voz|aesthetic montage|montagem est[ée]tica)\b/i.test(`${idea.format ?? ''} ${texto}`)) {
    out.push('é montagem muda: sem voz dela, qualquer creator europeia a substitui');
  }
  // Sem `\b` a fechar: o «:» não é caractere de palavra, e `\binclui:\b`
  // nunca casa. É o terceiro lugar hoje onde a fronteira de palavra do
  // JavaScript me apanhou — ela só conhece [A-Za-z0-9_].
  if (/(\bfuncionalidades\b|\bfeatures\b|\bm[óo]dulos\b|\binclui\s*:|\btudo o que (o|a) \w+ faz)/i.test(texto)) {
    out.push('é uma lista de funcionalidades, não uma história');
  }

  // Inglês de stock no tela. A auditoria nomeia os três casos reais.
  const stock = (idea.onScreenText ?? []).filter((t) =>
    /^\s*(home|rituals|welcome to my|unwind|my daily|self ?care|good vibes)\b/i.test(t),
  );
  if (stock.length) out.push(`tem inglês de stock no tela (${stock[0]})`);

  return out;
}

/* ── Energia ──────────────────────────────────────────────────────────────── */

export const ENERGY_LEVELS = ['low', 'normal', 'high'] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];

export const ENERGY_LABEL: Record<EnergyLevel, string> = {
  low: 'dia sem paciência',
  normal: 'dia normal',
  high: 'dia de produção',
};

/** Que energia uma ideia exige, a partir do que ela pede.
 *
 *  Serve para duas coisas: não propor um Reel de três horas no dia em que ela
 *  tem uma gravação comercial pesada, e responder ao «hoje não me apetece»
 *  com outra coisa em vez de com a mesma. */
export function energyOf(idea: {
  shots: number;
  editingComplexity: 'simple' | 'medium' | 'heavy';
  recordMinutes?: number | null;
  editMinutes?: number | null;
}): EnergyLevel {
  const total = (idea.recordMinutes ?? 0) + (idea.editMinutes ?? 0);
  if (idea.editingComplexity === 'heavy' || idea.shots >= 6 || total > 45) return 'high';
  if (idea.editingComplexity === 'simple' && idea.shots <= 3 && total <= 25) return 'low';
  return 'normal';
}

/** Quanto tempo sobra para conteúdo próprio, dado o que já está marcado.
 *
 *  Um dia com gravação comercial pesada não comporta uma segunda produção. */
export function energyBudget(input: {
  commercialShootToday: boolean;
  minutesCommitted: number;
}): { max: EnergyLevel; because: string } {
  if (input.commercialShootToday || input.minutesCommitted > 90) {
    return {
      max: 'low',
      because: 'já há uma gravação de marca hoje: o conteúdo próprio tem de sair da mesma sessão ou custar quase nada',
    };
  }
  if (input.minutesCommitted > 40) {
    return { max: 'normal', because: 'o dia já tem trabalho marcado' };
  }
  return { max: 'high', because: '' };
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

/** As dimensões da auditoria. Duas delas são novas e são as que interessam:
 *  `carolIdentity` — o que só ela tem lá dentro — e
 *  `authorityWithoutPreaching` — mostra sem ensinar. */
export type QualityDims = {
  /** Dez anos de sala, ceticismo, casa, pele, PB/Porto. Se isto é baixo, o
   *  vídeo é de qualquer pessoa. */
  carolIdentity: number;
  story: number;
  /** Prova no plano: tela, produto na mão, antes/depois. Não é slogan. */
  proof: number;
  humanConflict: number;
  /** O que um comprador de marca aprende sobre a competência dela. */
  brandSignal: number;
  engagement: number;
  originality: number;
  recordability: number;
  platformNative: number;
  /** Alta quando demonstra sem dar aula. Baixa quando vira professora. */
  authorityWithoutPreaching: number;
};

export const QUALITY_KEYS: (keyof QualityDims)[] = [
  'carolIdentity', 'story', 'proof', 'humanConflict', 'brandSignal',
  'engagement', 'originality', 'recordability', 'platformNative',
  'authorityWithoutPreaching',
];

/** Um número por dimensão no backend; uma frase à frente dela.
 *
 *  Quatro dimensões têm veto, e todas por uma razão da auditoria: sem
 *  identidade dela o vídeo é substituível; sem originalidade é lugar-comum;
 *  sem possibilidade de gravar não acontece; e a pregar afasta as marcas que
 *  pagam. Nenhuma delas se compensa com média — foi assim que «O que ninguém
 *  diz sobre gravar UGC» sobreviveu à primeira corrida. */
export function qualityVerdict(dims: Partial<QualityDims>): {
  score: number;
  verdict: 'record_today' | 'good_not_urgent' | 'reject';
  phrase: string;
} {
  const valores = QUALITY_KEYS.map((k) => dims[k]).filter((v): v is number => typeof v === 'number');
  const score = valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : 0;

  const vetos: [boolean, string][] = [
    [(dims.carolIdentity ?? 100) < 40, 'Qualquer creator gravava isto trocando o rosto.'],
    [(dims.originality ?? 100) < 40, 'Isto podia ser de qualquer pessoa. Não vale gravar.'],
    [(dims.recordability ?? 100) < 40, 'Boa ideia, mas não dá para gravar sozinha.'],
    [(dims.authorityWithoutPreaching ?? 100) < 40, 'Põe-na a dar aulas — não é o lugar dela.'],
  ];

  const falhou = vetos.find(([v]) => v);
  if (falhou) return { score, verdict: 'reject', phrase: falhou[1] };

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
    out.push('não há guião suficiente para pegar no celular e gravar');
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
      'Autoridade e prova de competência. O vídeo é portfólio: uma marca que o veja tem de entender que ela sabe o que faz.',
    treatment:
      'Mais cuidado, mais limpo, identidade visual consistente. Feito para salvar e partilhar. Legenda que acrescenta, não que repete.',
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

/* ── Um portão só ─────────────────────────────────────────────────────────── */

/** Tudo o que reprova uma ideia, num lugar.
 *
 *  Existia espalhado — genérico aqui, repetição ali — e a auditoria acrescentou
 *  três verificações novas. Quatro chamadas em quatro sites é como uma delas
 *  se esquece no caminho seguinte. */
export function ideaProblems(idea: {
  hook: string;
  script?: string;
  title?: string;
  whyNow?: string;
  format?: string;
  onScreenText?: readonly string[];
}): string[] {
  return [
    ...genericProblems(idea),
    ...guruProblems(idea),
    ...catalogProblems(idea),
    ...(replaceability({
      hook: idea.hook,
      script: idea.script ?? '',
      title: idea.title,
      whyNow: idea.whyNow,
    }).replaceable
      ? ['qualquer creator gravava isto trocando o rosto — não há nada dela lá dentro']
      : []),
  ];
}
