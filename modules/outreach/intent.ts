/** O que a Carol pediu, entendido — e defendido.
 *
 *  A busca manual devolvia apps quando ela escrevia «hotéis», porque o ranking
 *  era o Brand Fit tech-first: um hotel perdia sempre para um SaaS, e a lista
 *  enchia-se com o nicho habitual dela em vez do que ela tinha pedido.
 *
 *  A regra que este módulo existe para impor: **a intenção explícita ganha ao
 *  perfil por omissão**. Se ela escreveu hotéis, o sistema procura hotéis, e o
 *  perfil dela serve só para ordenar os hotéis entre si.
 *
 *  Puro de propósito. É a peça onde um erro se paga em resultados errados todos
 *  os dias, e é a única maneira de a testar sem falar com um modelo. */

export type ManualIntent = {
  rawQuery: string;
  normalizedQuery: string;
  /** A categoria em linguagem natural: «hotéis», «restaurantes italianos». */
  mainCategory: string;
  /** Formas próximas que o motor pode procurar sem trair o pedido. */
  expansions: string[];
  /** Uma candidata tem de bater em pelo menos um destes para entrar. */
  requiredConcepts: string[];
  /** Ajudam a ordenar, não decidem a entrada. */
  optionalConcepts: string[];
  /** Nunca devolver isto, por muito que encaixe no perfil dela. */
  exclusions: string[];
  country: string;
};

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Palavras que não distinguem nada e só diluem a comparação. */
const STOP = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'para', 'por',
  'com', 'um', 'uma', 'no', 'na', 'nos', 'nas', 'que', 'the', 'of', 'and', 'in',
  'marcas', 'marca', 'empresas', 'empresa', 'negocios', 'negocio',
]);

export const tokens = (s: string) => strip(s).split(' ').filter((t) => t.length > 2 && !STOP.has(t));

/** Singular e plural da mesma palavra são a mesma coisa para uma busca. */
export function stem(word: string): string {
  const w = strip(word);
  // A salva era pelo comprimento da palavra e cortava cedo demais: «apps»
  // ficava «apps» e nunca batia com «app». Cada regra abaixo salva-se a si
  // própria — o que sobra tem de continuar a ser uma palavra.
  if (w.length < 4) return w;
  if (w.endsWith('oes') || w.endsWith('aes')) return `${w.slice(0, -3)}ao`;
  // -al/-el/-ol/-ul fazem plural em -ais/-eis/-ois/-uis.
  for (const [plural, singular] of [['ais', 'al'], ['eis', 'el'], ['ois', 'ol'], ['uis', 'ul']]) {
    if (w.endsWith(plural)) return `${w.slice(0, -3)}${singular}`;
  }
  if (w.endsWith('ns')) return `${w.slice(0, -2)}m`;
  // O `-es` só é plural depois de r, s ou z: mar→mares, luz→luzes. Em
  // «restaurantes» o plural é só o `s`, e cortar `es` dava «restaurant».
  if (w.endsWith('es') && /[rsz]$/.test(w.slice(0, -2))) return w.slice(0, -2);
  if (w.endsWith('s') && w.length > 3) return w.slice(0, -1);
  return w;
}

/** Famílias de negócio que o motor conhece.
 *
 *  Não é para classificar o mundo: é para dar sinónimos verdadeiros a uma busca
 *  e evitar que «hotéis» e «hotelaria» sejam tratados como coisas diferentes.
 *  Uma busca que não caia em nenhuma família funciona na mesma — usa as próprias
 *  palavras dela. */
type Family = {
  id: string;
  terms: readonly string[];
  expand: readonly string[];
  /** Famílias do mesmo mundo. Um wine hotel é hotelaria e é turismo; penalizar
   *  por isso deitava fora precisamente os melhores resultados. */
  related?: readonly string[];
};

const FAMILIES: readonly Family[] = [
  {
    id: 'hospitality',
    related: ['travel', 'food'],
    terms: ['hotel', 'hotelaria', 'resort', 'pousada', 'hostel', 'alojamento', 'estadia', 'hospedagem'],
    expand: ['hotéis', 'hotéis boutique', 'hotelaria independente', 'resorts', 'alojamento local'],
  },
  {
    id: 'food',
    related: ['hospitality', 'travel'],
    terms: ['restaurante', 'gastronomia', 'gastronomico', 'bistro', 'cafe', 'cafetaria',
      'padaria', 'pizzaria', 'marisqueira', 'tasca', 'cozinha', 'chef', 'dining',
      'jantar', 'menu', 'culinaria'],
    expand: ['restaurantes', 'restauração', 'cafés e bistrôs'],
  },
  {
    id: 'fitness',
    related: ['clinic'],
    terms: ['academia', 'ginasio', 'fitness', 'crossfit', 'pilates', 'yoga', 'treino'],
    expand: ['ginásios', 'estúdios de fitness', 'boxes de crossfit'],
  },
  {
    id: 'clinic',
    related: ['fitness'],
    terms: ['clinica', 'dentaria', 'dentista', 'medico', 'estetica', 'fisioterapia', 'veterinaria'],
    expand: ['clínicas', 'consultórios'],
  },
  {
    id: 'furniture',
    related: ['retail'],
    terms: ['mobiliario', 'movel', 'moveis', 'decoracao', 'interiores', 'iluminacao'],
    expand: ['mobiliário', 'marcas de decoração', 'design de interiores'],
  },
  {
    id: 'software',
    related: ['hardware'],
    terms: ['saas', 'software', 'plataforma', 'app', 'aplicacao', 'aplicativo', 'startup', 'fintech', 'crm', 'erp'],
    expand: ['SaaS', 'aplicações', 'plataformas B2B'],
  },
  {
    id: 'hardware',
    related: ['software'],
    terms: ['gadget', 'eletronica', 'dispositivo', 'robo', 'aspirador', 'domotica', 'wearable'],
    expand: ['gadgets', 'consumer tech', 'eletrónica de consumo'],
  },
  {
    id: 'pet',
    terms: ['pet', 'animal', 'animais', 'cao', 'gato', 'petshop'],
    expand: ['pet tech', 'marcas para animais'],
  },
  {
    id: 'travel',
    related: ['hospitality', 'food'],
    terms: ['viagem', 'viagens', 'turismo', 'travel', 'enoturismo'],
    expand: ['turismo', 'experiências de viagem'],
  },
  {
    id: 'retail',
    related: ['furniture'],
    terms: ['loja', 'retalho', 'ecommerce', 'marketplace', 'vestuario', 'moda', 'joalharia'],
    expand: ['comércio', 'lojas online'],
  },
];

export function familyFor(query: string): Family | null {
  const t = tokens(query).map(stem);
  for (const f of FAMILIES) {
    if (f.terms.some((term) => t.includes(stem(term)))) return f;
  }
  return null;
}

/** Traduz o que ela escreveu numa intenção que o motor pode defender.
 *
 *  «software para hotéis» é software, não hotelaria: quando duas famílias
 *  aparecem, ganha a que está na posição de substantivo principal — em
 *  português, a primeira. É o que separa interpretar de casar palavras. */
export function parseManualIntent(rawQuery: string, country: string): ManualIntent {
  const normalizedQuery = strip(rawQuery);
  const t = tokens(rawQuery);
  const stems = t.map(stem);

  const hits = FAMILIES.map((f) => ({
    f,
    at: Math.min(...f.terms.map((term) => {
      const i = stems.indexOf(stem(term));
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    })),
  })).filter((h) => Number.isFinite(h.at));

  hits.sort((a, b) => a.at - b.at);
  const principal = hits[0]?.f ?? null;
  // Uma segunda família é contexto, não alvo: «software para hotéis» procura
  // software, e é por isso que a hotelaria não pode entrar nas exclusões.
  const secundaria = hits[1]?.f ?? null;

  const expansions = [
    rawQuery.trim(),
    ...(principal ? principal.expand : []),
  ]
    .map((s) => s.trim())
    .filter((s, i, a) => s && a.indexOf(s) === i)
    .slice(0, 6);

  const required = [
    ...t,
    ...(principal ? principal.terms : []),
  ].map(stem).filter((s, i, a) => a.indexOf(s) === i);

  return {
    rawQuery: rawQuery.trim(),
    normalizedQuery,
    mainCategory: rawQuery.trim(),
    expansions,
    requiredConcepts: required,
    optionalConcepts: secundaria ? secundaria.terms.map(stem) : [],
    // Nunca se exclui uma família que a busca mencionou, nem uma do mesmo
    // mundo: «hotéis» tem de aceitar enoturismo e alojamento rural.
    exclusions: FAMILIES.filter(
      (f) =>
        f !== principal &&
        f !== secundaria &&
        !principal?.related?.includes(f.id) &&
        !secundaria?.related?.includes(f.id),
    )
      .flatMap((f) => f.terms)
      .map(stem),
    country,
  };
}

/** Abaixo disto, não é o que ela pediu. */
export const RELEVANCE_GATE = 45;

/* ── O portão ────────────────────────────────────────────────────────────── */

export type Candidate = {
  name: string;
  description: string;
  category?: string | null;
  country?: string | null;
};

export type Relevance = {
  /** 0-100: isto é o que ela pediu? */
  score: number;
  passes: boolean;
  /** Porque entrou ou porque não entrou, em português. */
  reason: string;
};

/** Mede a distância entre a candidata e o pedido.
 *
 *  Não conta encaixe com o perfil dela: isso é outra pontuação, e misturá-las
 *  era exatamente o defeito. Aqui só se pergunta se é a coisa certa. */
export function relevanceFor(c: Candidate, intent: ManualIntent): Relevance {
  const texto = [c.name, c.category ?? '', c.description].join(' ');
  const stems = new Set(tokens(texto).map(stem));

  const required = intent.requiredConcepts.filter((r) => stems.has(r));
  const excluded = intent.exclusions.filter((e) => stems.has(e));
  const optional = intent.optionalConcepts.filter((o) => stems.has(o));

  if (required.length === 0) {
    // A exclusão só se nomeia quando explica alguma coisa: dizer «é software»
    // ajuda-a a entender porque a rejeitei; dizer «não bateu» não ajuda nada.
    const familia = familyFor(texto);
    return {
      // O corte é quem decide, aqui como em todo o lado: devolver `false` à mão
      // era uma segunda regra a decidir a mesma coisa, e uma delas ia ficar para
      // trás no dia em que a outra mudasse.
      score: 0,
      passes: 0 >= RELEVANCE_GATE,
      reason: familia
        ? `Não é ${intent.mainCategory}: parece outra coisa.`
        : `Não bate com «${intent.mainCategory}».`,
    };
  }

  // Bater em mais conceitos do pedido é bater mais no alvo.
  const cobertura = Math.min(1, required.length / Math.max(1, Math.min(3, intent.requiredConcepts.length)));
  let score = Math.round(40 + cobertura * 50 + Math.min(10, optional.length * 5));

  // Uma candidata ambígua — bate no pedido e também noutras famílias — desce.
  // Estava descendo até ao corte e a parar lá, o que garantia que passava
  // sempre: um piso no valor exato do corte é um corte que não corta.
  if (excluded.length) score -= 20 * Math.min(3, excluded.length);

  return {
    score: Math.min(100, score),
    passes: score >= RELEVANCE_GATE,
    reason: `Corresponde a «${intent.mainCategory}».`,
  };
}

/* ── Oportunidade, separada da relevância ────────────────────────────────── */

export type OpportunitySignals = {
  paidMedia: 'none' | 'weak' | 'medium' | 'strong' | null;
  ugc: 'none' | 'product_only' | 'influencers' | 'ugc' | 'creator_program' | null;
  demonstrable: number | null;
  creativeGap: number | null;
  digitalPresence: number | null;
  reachable: boolean;
  sameLanguage: boolean;
};

export type Opportunity = { score: number; band: 'Excelente' | 'Bom' | 'Razoável' | 'Fraco'; lines: string[] };

const PESO = {
  paidMedia: 26,
  ugc: 14,
  demonstrable: 20,
  creativeGap: 16,
  digitalPresence: 12,
  reachable: 8,
  sameLanguage: 4,
} as const;

/** Vale a pena fazer UGC para esta empresa?
 *
 *  Deliberadamente cego ao nicho. Um hotel não perde pontos por não ser SaaS —
 *  se ela pediu hotéis, o que interessa é qual dos hotéis é a melhor
 *  oportunidade. O encaixe tech-first continua existindo e continua mandando na
 *  busca automática; aqui não entra.
 *
 *  Desconhecido conta como neutro e fica assinalado, como em todo o resto do
 *  CarolOS: um campo por saber não é um zero. */
export function opportunityFor(s: OpportunitySignals): Opportunity {
  const lines: string[] = [];
  let pontos = 0;
  let possivel = 0;

  const somar = (peso: number, fracao: number | null, dito: string, assunto: string) => {
    possivel += peso;
    if (fracao === null) {
      pontos += peso * 0.5;
      lines.push(`${assunto}: por saber`);
      return;
    }
    pontos += peso * fracao;
    lines.push(dito);
  };

  const paid = { none: 0, weak: 0.3, medium: 0.65, strong: 1 };
  somar(
    PESO.paidMedia,
    s.paidMedia ? paid[s.paidMedia] : null,
    s.paidMedia === 'strong' ? 'Compra criativos' : s.paidMedia === 'none' ? 'Sem anúncios detectados' : 'Anuncia',
    'Investimento em anúncios',
  );

  const ugc = { none: 0.35, product_only: 0.7, influencers: 0.5, ugc: 0.9, creator_program: 1 };
  somar(
    PESO.ugc,
    s.ugc ? ugc[s.ugc] : null,
    s.ugc === 'creator_program' ? 'Tem programa de creators'
      : s.ugc === 'ugc' ? 'Já usa UGC'
      : s.ugc === 'product_only' ? 'Só mostra o produto'
      : s.ugc === 'influencers' ? 'Trabalha com influencers'
      : 'Sem creators',
    'Trabalho com creators',
  );

  somar(PESO.demonstrable, s.demonstrable === null ? null : s.demonstrable / 5, 'Dá para mostrar em vídeo', 'Potencial de demonstração');
  somar(PESO.creativeGap, s.creativeGap === null ? null : s.creativeGap / 5, 'Há espaço criativo por preencher', 'Espaço criativo');
  somar(PESO.digitalPresence, s.digitalPresence === null ? null : s.digitalPresence / 5, 'Presença digital ativa', 'Presença digital');

  possivel += PESO.reachable;
  pontos += s.reachable ? PESO.reachable : 0;
  lines.push(s.reachable ? 'Há como falar com eles' : 'Sem contato direto');

  possivel += PESO.sameLanguage;
  pontos += s.sameLanguage ? PESO.sameLanguage : 0;
  if (!s.sameLanguage) lines.push('Fora do português');

  const score = Math.round((pontos / possivel) * 100);
  const band = score >= 80 ? 'Excelente' : score >= 65 ? 'Bom' : score >= 45 ? 'Razoável' : 'Fraco';
  return { score, band, lines };
}

/** «Portugal» e «PT» são o mesmo lugar; «Portugal» e «Espanha» não são.
 *  Compara-se por prefixo normalizado para não falhar em «Brasil»/«Brazil». */
export function sameCountry(a: string, b: string): boolean {
  const n = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const A = n(a);
  const B = n(b);
  if (!A || !B) return true;
  const alias: Record<string, string> = {
    pt: 'portugal', br: 'brasil', brazil: 'brasil', es: 'espanha', spain: 'espanha',
    de: 'alemanha', germany: 'alemanha', uk: 'reino unido', gb: 'reino unido',
    us: 'eua', usa: 'eua', 'united states': 'eua', fr: 'franca', france: 'franca',
  };
  return (alias[A] ?? A) === (alias[B] ?? B);
}

/* ── A marca cai num nicho que ela escolheu? ─────────────────────────────── */

/** Se o que a marca faz corresponde a um dos nichos do foco.
 *
 *  O `niche_id` só conhece a lista de origem: um hotel sai sempre como «Outro»,
 *  por muito que ela tenha posto hotéis de luxo no foco. Isto compara o texto da
 *  marca com o que ela escreveu, pela mesma família e pelo mesmo radical que a
 *  busca dirigida usa — não vale a pena ter duas noções de «isto é aquilo». */
export function focusMatch(
  text: string,
  focusLabels: readonly string[],
): { matches: boolean; label?: string } {
  const stems = new Set(tokens(text).map(stem));
  const familia = familyFor(text);

  for (const label of focusLabels) {
    if (tokens(label).map(stem).some((t) => stems.has(t))) return { matches: true, label };
    const f = familyFor(label);
    if (f && familia && (f.id === familia.id || f.related?.includes(familia.id))) {
      return { matches: true, label };
    }
  }
  return { matches: false };
}
