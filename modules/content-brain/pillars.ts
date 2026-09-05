/** Pilar é função editorial. Território é assunto da vida. São eixos
 *  diferentes, e confundi-los foi o erro que o modelo antigo cometia.
 *
 *  `modules/creator/strategy.ts` tratava «A sala», «Testei», «Casa a dois»,
 *  «Corpo» e «Larguei o turno» como pilares e dava-lhes pesos. São temas: a
 *  mesma história de restaurante pode servir atração, autoridade ou conexão
 *  conforme o enquadramento. Um peso de 30% num tema obriga o perfil a falar
 *  de restaurante três vezes em dez, independentemente do que aconteceu na
 *  vida dela.
 *
 *  Aqui os pilares são quatro funções — o que o conteúdo precisa produzir no
 *  público — e o assunto passa a etiqueta ortogonal.
 *
 *  Fonte: CAROL_Content_Source_of_Truth_v3.0 §4. Puro. */

export const FUNCTIONAL_PILLARS = [
  'attraction_journey',
  'information_retention',
  'authority_conversion',
  'connection_personal',
] as const;

export type FunctionalPillar = (typeof FUNCTIONAL_PILLARS)[number];

export const isFunctionalPillar = (v: unknown): v is FunctionalPillar =>
  typeof v === 'string' && (FUNCTIONAL_PILLARS as readonly string[]).includes(v);

export type PillarSpec = {
  label: string;
  /** Para que existe, em duas frases, na linguagem da Carol. */
  purpose: string;
  /** Que matéria-prima procurar. Categorias, nunca ideias prontas. */
  rawMaterial: readonly string[];
  guardrails: readonly string[];
  /** Perguntas de descoberta. Uma de cada vez, nunca a lista toda. */
  discovery: readonly string[];
  /** Métricas que dizem se cumpriu a função. Alcance não serve para tudo. */
  primaryMetrics: readonly string[];
  secondaryMetrics: readonly string[];
};

export const PILLAR_SPEC: Record<FunctionalPillar, PillarSpec> = {
  attraction_journey: {
    label: 'Atração',
    purpose:
      'Chegar a quem ainda não conhece a Carol e fazer essa pessoa reconhecer algo de si numa situação real. Não precisa ensinar, não precisa vender, não precisa provar que ela é especialista.',
    rawMaterial: [
      'histórias reais da construção da carreira',
      'coisas que deram certo e coisas que deram errado',
      'frustrações, surpresas, primeiras vezes',
      'mudança de restaurante para digital',
      'humor de situação real',
      'pequenas vitórias com alguma coisa em jogo',
    ],
    guardrails: [
      'precisa ser compreensível sem contexto anterior',
      'não pode depender de um Reel antigo para fazer sentido',
      'nada de aula técnica nem venda direta',
    ],
    discovery: [
      'Qual foi a coisa mais inesperada que aconteceu?',
      'O que deu errado?',
      'O que te irritou ou te fez rir?',
      'O que mudou na tua cabeça?',
      'Que situação faria outra pessoa pensar «isso acontece comigo»?',
    ],
    primaryMetrics: ['reach', 'non_follower_share', 'views'],
    secondaryMetrics: ['profile_visits', 'follows', 'comments'],
  },
  information_retention: {
    label: 'Informação e craft',
    purpose:
      'Dar motivo para seguir e voltar, mostrando decisão de produção aplicada a trabalho real. A posição é «foi assim que eu resolvi», nunca «aula definitiva».',
    rawMaterial: [
      'decisões de gravação: luz, ângulo, cenário, iPhone',
      'edição ligada a uma necessidade real',
      'ganchos visuais',
      'como gravou uma tomada específica',
      'B-roll e close-up como prova',
      'antes/depois de uma decisão visual',
    ],
    guardrails: [
      'não virar curso gratuito de UGC',
      'nada de lista genérica de dicas desconectada da vida',
      'a decisão tem de ter sido tomada num trabalho real',
    ],
    discovery: [
      'Que problema de gravação você resolveu esta semana?',
      'Que decisão visual mudou uma tomada?',
      'O que você tentou e não funcionou?',
      'O que alguém perguntaria vendo o resultado final?',
    ],
    primaryMetrics: ['saves', 'avg_watch_time', 'follows'],
    secondaryMetrics: ['comments', 'reach'],
  },
  authority_conversion: {
    label: 'Prova e autoridade',
    purpose:
      'Fazer uma marca perceber que a Carol pesquisa, pensa e executa com cuidado. Autoridade por evidência, nunca por autoafirmação.',
    rawMaterial: [
      'processo contra resultado',
      'pesquisa antes de abordar ou gravar',
      'por que escolheu um caminho para uma marca',
      'feedback real de marca',
      'briefing e execução',
      'decisões de cenário, narrativa e edição',
    ],
    guardrails: [
      'sem prometer resultado que ainda não se consegue provar',
      'não virar aula para creators quando o alvo é a marca',
      'postura de guru reprova',
    ],
    discovery: [
      'O que você descobriu sobre a marca antes de gravar?',
      'Qual decisão foi específica para esse produto?',
      'Que feedback real você recebeu?',
      'Que detalhe mostra que você entendeu o consumidor?',
    ],
    primaryMetrics: ['profile_visits', 'follows', 'comments'],
    secondaryMetrics: ['views', 'reach'],
  },
  connection_personal: {
    label: 'Conexão',
    purpose:
      'Manter a Carol pessoa no centro e impedir que o perfil vire só trabalho ou portfólio. Pode ser leve e não precisa carregar lição.',
    rawMaterial: [
      'treino',
      'os animais da casa',
      'casa e rotina',
      'namorado',
      'vida em Portugal',
      'maquiagem',
      'humor cotidiano',
    ],
    guardrails: [
      'vida pessoal precisa de um ponto editorial',
      'não publicar rotina neutra só porque aconteceu',
      'exposição de terceiros exige autorização',
    ],
    discovery: [
      'Teve alguma coisa engraçada, bonita ou irritante hoje?',
      'O que você está vivendo que outras pessoas também vivem?',
      'Existe uma pequena história, mudança ou ritual aqui?',
    ],
    primaryMetrics: ['comments', 'follows'],
    secondaryMetrics: ['views', 'reach'],
  },
};

export const PILLAR_LABEL: Record<FunctionalPillar, string> = {
  attraction_journey: PILLAR_SPEC.attraction_journey.label,
  information_retention: PILLAR_SPEC.information_retention.label,
  authority_conversion: PILLAR_SPEC.authority_conversion.label,
  connection_personal: PILLAR_SPEC.connection_personal.label,
};

/* ── Territórios ──────────────────────────────────────────────────────────── */

export const TERRITORIES = [
  'ugc_journey',
  'career_transition',
  'brand_outreach',
  'brand_work',
  'creative_process',
  'editing',
  'filming',
  'tech',
  'smart_home',
  'pets',
  'relationship',
  'training',
  'makeup',
  'portugal_brazil',
  'home',
  'travel',
  'hospitality',
  'other',
] as const;

export type Territory = (typeof TERRITORIES)[number];

export const isTerritory = (v: unknown): v is Territory =>
  typeof v === 'string' && (TERRITORIES as readonly string[]).includes(v);

export const TERRITORY_LABEL: Record<Territory, string> = {
  ugc_journey: 'Jornada UGC',
  career_transition: 'Mudança de carreira',
  brand_outreach: 'Abordagem de marcas',
  brand_work: 'Trabalho de marca',
  creative_process: 'Processo criativo',
  editing: 'Edição',
  filming: 'Gravação',
  tech: 'Tecnologia',
  smart_home: 'Casa conectada',
  pets: 'Animais',
  relationship: 'Namorado',
  training: 'Treino',
  makeup: 'Maquiagem',
  portugal_brazil: 'Portugal e Brasil',
  home: 'Casa',
  travel: 'Viagem',
  hospitality: 'Restaurante e sala',
  other: 'Outro',
};

/* ── Exclusões, em código ─────────────────────────────────────────────────── */

/** Skincare está fora da estratégia editorial, e haircare segue a mesma
 *  decisão do projeto. Isto não é uma frase de prompt: é uma função com teste,
 *  porque uma regra que vive dentro de um prompt sobrevive só até alguém
 *  reescrever o prompt.
 *
 *  Maquiagem não é skincare, e a confusão entre «beauty» e «skincare» é
 *  exatamente o erro que esta lista existe para não deixar acontecer. */
export const EXCLUDED_TOPICS = ['skincare', 'haircare'] as const;
export type ExcludedTopic = (typeof EXCLUDED_TOPICS)[number];

const EXCLUSION_TERMS: Record<ExcludedTopic, readonly string[]> = {
  skincare: [
    'skincare', 'skin care', 'dermocosm', 'dermatolog', 'rosacea', 'rosácea',
    'acne', 'serum facial', 'sérum facial', 'protetor solar', 'protector solar',
    'hidratante facial', 'rotina de pele', 'cuidado com a pele', 'cuidados com a pele',
    'limpeza de pele', 'esfoliante facial', 'tonico facial', 'tónico facial',
  ],
  haircare: [
    'haircare', 'hair care', 'cuidado capilar', 'cuidados capilares',
    'rotina capilar', 'shampoo', 'champô', 'condicionador', 'cronograma capilar',
    'progressiva', 'botox capilar', 'hidratação capilar',
  ],
};

/** Termos que parecem excluídos e não são. Maquiagem é território permitido e
 *  a Carol nomeou-a como um dos conteúdos de que mais gostou. */
const ALLOWED_DESPITE_SIMILARITY = [
  'maquiagem', 'maquilhagem', 'makeup', 'batom', 'base', 'sombra', 'delineador',
  'blush', 'rimel', 'rímel', 'contorno',
];

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Devolve o tópico excluído que o texto pisa, ou `null`.
 *
 *  Devolve o motivo em vez de um booleano porque quem chama precisa de o dizer
 *  à Carol: «skincare está fora da estratégia» explica-se, «false» não. */
export function excludedTopicIn(text: string): ExcludedTopic | null {
  const t = fold(text);
  for (const topic of EXCLUDED_TOPICS) {
    for (const term of EXCLUSION_TERMS[topic]) {
      if (t.includes(fold(term))) return topic;
    }
  }
  return null;
}

export const isExcludedTopic = (text: string): boolean => excludedTopicIn(text) !== null;

/** Maquiagem passa. Existe porque um filtro de «beauty» apanharia as duas e
 *  a decisão da Carol separa-as explicitamente. */
export const isAllowedBeauty = (text: string): boolean => {
  const t = fold(text);
  return ALLOWED_DESPITE_SIMILARITY.some((w) => t.includes(fold(w))) && excludedTopicIn(text) === null;
};

export const EXCLUSION_REASON: Record<ExcludedTopic, string> = {
  skincare: 'Skincare está fora da estratégia de conteúdo. Maquiagem continua dentro.',
  haircare: 'Haircare está fora da estratégia de conteúdo.',
};

/* ── Pilares antigos, como história ───────────────────────────────────────── */

/** As cinco etiquetas antigas sobrevivem para não perder histórico e
 *  analytics. Não voltam a dirigir decisão nenhuma: mapeiam para território,
 *  que é o que sempre foram. */
export const LEGACY_PILLARS = ['A_SALA', 'TESTEI', 'CASA_A_DOIS', 'CORPO', 'LARGUEI_O_TURNO'] as const;
export type LegacyPillar = (typeof LEGACY_PILLARS)[number];

export const isLegacyPillar = (v: unknown): v is LegacyPillar =>
  typeof v === 'string' && (LEGACY_PILLARS as readonly string[]).includes(v);

/** Território provável de uma etiqueta antiga. Nunca devolve um pilar
 *  funcional: a função de um conteúdo antigo não é dedutível do tema, e
 *  adivinhá-la seria reclassificar por palpite. */
export const LEGACY_TERRITORY: Record<LegacyPillar, Territory> = {
  A_SALA: 'hospitality',
  TESTEI: 'brand_work',
  CASA_A_DOIS: 'home',
  CORPO: 'training',
  LARGUEI_O_TURNO: 'career_transition',
};

export const LEGACY_PILLAR_LABEL: Record<LegacyPillar, string> = {
  A_SALA: 'A sala',
  TESTEI: 'Testei de verdade',
  CASA_A_DOIS: 'Casa a dois',
  CORPO: 'Corpo no lugar',
  LARGUEI_O_TURNO: 'Larguei o turno',
};

/* ── Cobertura ────────────────────────────────────────────────────────────── */

export type PillarCoverage = {
  pillar: FunctionalPillar;
  label: string;
  /** Histórias confirmadas e ainda não usadas. */
  available: number;
  /** Histórias já estruturadas e prontas para gravar. */
  ready: number;
  /** Conteúdos publicados que cumpriram esta função. */
  published: number;
  /** Verdadeiro quando não há matéria-prima suficiente para uma semana. */
  needsMapping: boolean;
};

/** Abaixo disto, o pilar não tem com que trabalhar e a ação certa é mapear —
 *  nunca gerar. Três é o mínimo para uma semana não repetir a mesma história
 *  com outras palavras. Policy, não ciência. */
export const MIN_STORIES_FOR_WEEK = 3;

export function pillarCoverage(
  stories: readonly { pillar: string | null; status: string }[],
  published: readonly { pillar: string | null }[] = [],
): PillarCoverage[] {
  return FUNCTIONAL_PILLARS.map((pillar) => {
    const mine = stories.filter((s) => s.pillar === pillar);
    const available = mine.filter((s) => s.status !== 'used' && s.status !== 'archived' && s.status !== 'rejected').length;
    const ready = mine.filter((s) => s.status === 'ready_to_record' || s.status === 'structured').length;
    return {
      pillar,
      label: PILLAR_LABEL[pillar],
      available,
      ready,
      published: published.filter((p) => p.pillar === pillar).length,
      needsMapping: available < MIN_STORIES_FOR_WEEK,
    };
  });
}

/** Qual pilar mapear a seguir: o de menor cobertura. Empate resolve-se pela
 *  ordem canônica, que põe Atração primeiro — é a fase declarada do perfil. */
export function pillarToMap(coverage: readonly PillarCoverage[]): FunctionalPillar | null {
  const carentes = coverage.filter((c) => c.needsMapping);
  if (carentes.length === 0) return null;
  return [...carentes].sort((a, b) => {
    if (a.available !== b.available) return a.available - b.available;
    return FUNCTIONAL_PILLARS.indexOf(a.pillar) - FUNCTIONAL_PILLARS.indexOf(b.pillar);
  })[0].pillar;
}
