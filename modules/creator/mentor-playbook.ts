/** O que a mentora ensinou, como estrutura — não como parágrafo de prompt.
 *
 *  Fonte: a primeira sessão da mentoria de conteúdo (E1 · CCF · Caroline Bez
 *  Fontana), 1 de Setembro de 2026. O documento que existe são as anotações
 *  que o Gemini gerou na reunião, e isso tem duas consequências que este
 *  arquivo grava de propósito:
 *
 *  1. **Autoridade alta sobre estratégia de conteúdo, nenhuma sobre o
 *     algoritmo.** «Um Reels Test que falha fica entre 100 e 300 views» é o
 *     que a mentora observou nos perfis dela, não um fato do Instagram — e
 *     nunca pode ganhar a um número real da Carol.
 *
 *  2. **Nem tudo é regra.** Há regras (mostrar o que está por trás), há
 *     heurísticas (2000 views merece análise), e há experiências (3 a 5 testes
 *     por dia). Tratá-las todas como lei é como uma mentoria vira culpa.
 *
 *  Dois eixos que o documento traz e que NÃO se contradizem: a FUNÇÃO do
 *  conteúdo (atrair, educar, converter) e o MODO editorial (autoridade,
 *  entretenimento, informação, pessoal). Uma peça tem uma função e um ou dois
 *  modos. Os cinco pilares da auditoria (`strategy.ts`) continuam a ser o
 *  TERRITÓRIO: sobre o que ela fala. Três eixos, três perguntas diferentes.
 *
 *  Puro, e versionado: uma ideia salva tem de saber que playbook a produziu. */

export const PLAYBOOK_VERSION = 'MENTOR_PLAYBOOK_V1';

export const MENTOR_SOURCE = {
  id: 'mentor-ccf-e1',
  name: 'Mentoria de conteúdo · CCF · E1',
  mentor: 'Caroline Bez Fontana',
  kind: 'mentor_session',
  effectiveAt: '2026-09-01',
  /** Como o documento nasceu. Cada frase passou por um modelo antes de chegar
   *  aqui, e por isso nenhuma vira verdade absoluta sozinha. */
  recordedBy: 'anotações da reunião geradas pelo Gemini (Google Meet)',
  authority:
    'high for content strategy advice; none as evidence about the platform algorithm or about Carol’s real numbers',
  provenanceLabel: 'Mentoria Caroline · 01/09/2026',
} as const;

/* ── Tipos de conhecimento ────────────────────────────────────────────────── */

/** Não se trata tudo igual. Uma regra aplica-se; uma heurística compara-se com
 *  o real; uma experiência mede-se; um sinal observado da Carol ganha às
 *  três; uma política canónica não se discute numa mentoria. */
export const KNOWLEDGE_KINDS = [
  'MENTOR_RULE',
  'MENTOR_HEURISTIC',
  'MENTOR_EXPERIMENT',
  'OBSERVED_CAROL_SIGNAL',
  'CANONICAL_BUSINESS_POLICY',
] as const;

export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const KNOWLEDGE_KIND_LABEL: Record<KnowledgeKind, string> = {
  MENTOR_RULE: 'regra da mentoria',
  MENTOR_HEURISTIC: 'heurística da mentoria',
  MENTOR_EXPERIMENT: 'experiência da mentoria',
  OBSERVED_CAROL_SIGNAL: 'observado nos números da Carol',
  CANONICAL_BUSINESS_POLICY: 'decisão do negócio',
};

export type PlaybookRule = {
  id: string;
  kind: KnowledgeKind;
  /** A frase curta que a Carol lê. */
  rule: string;
  /** O «porquê» que abre quando ela pergunta. */
  why: string;
};

/* ── Eixo 1: a função do conteúdo ─────────────────────────────────────────── */

export const CONTENT_FUNCTIONS = ['attract_connect', 'educate_retain', 'convert'] as const;
export type ContentFunction = (typeof CONTENT_FUNCTIONS)[number];

export const isContentFunction = (v: string): v is ContentFunction =>
  (CONTENT_FUNCTIONS as readonly string[]).includes(v);

export const FUNCTION_SPEC: Record<
  ContentFunction,
  { label: string; objective: string; signals: readonly string[]; targetShare: number }
> = {
  attract_connect: {
    label: 'Atrair e conectar',
    objective: 'Chegar a gente nova e gerar identificação.',
    signals: ['nonFollowerReach', 'shares', 'follows'],
    targetShare: 0.4,
  },
  educate_retain: {
    label: 'Educar e reter',
    objective: 'Entregar algo útil que se salva — e que mostra que ela domina o ofício.',
    signals: ['saves', 'watchTime', 'comments'],
    targetShare: 0.35,
  },
  convert: {
    label: 'Converter',
    objective: 'Provar capacidade para uma marca que está decidindo se contrata.',
    signals: ['profileVisits', 'inboundLeads'],
    targetShare: 0.25,
  },
};

/** A mentora pediu para começar pelo pilar de informação — é o mais simples de
 *  produzir. É uma preferência de arranque, não um peso permanente. */
export const INITIAL_FUNCTION_FOCUS: ContentFunction = 'educate_retain';

/* ── Eixo 2: o modo editorial ─────────────────────────────────────────────── */

export const EDITORIAL_MODES = ['authority', 'entertainment', 'information', 'personal'] as const;
export type EditorialMode = (typeof EDITORIAL_MODES)[number];

export const isEditorialMode = (v: string): v is EditorialMode =>
  (EDITORIAL_MODES as readonly string[]).includes(v);

export const MODE_SPEC: Record<EditorialMode, { label: string; what: string }> = {
  authority: { label: 'Autoridade', what: 'Referência: mostra que ela sabe o que está fazendo.' },
  entertainment: { label: 'Entretenimento', what: 'Identificação, humor, o cotidiano em que o público se reconhece.' },
  information: { label: 'Informação', what: 'Acionável: algo que a pessoa aplica hoje.' },
  personal: { label: 'Pessoal', what: 'Trajetória, namorado, casa, a vida de brasileira em Portugal.' },
};

/* ── Ganchos ──────────────────────────────────────────────────────────────── */

export const HOOK_CHANNELS = ['visual', 'written', 'spoken'] as const;
export type HookChannel = (typeof HOOK_CHANNELS)[number];

export const HOOK_CHANNEL_LABEL: Record<HookChannel, string> = {
  visual: 'o que prende o olho',
  written: 'o que se lê',
  spoken: 'o que se ouve',
};

/** Os cinco tipos de gancho escrito que a mentora ensinou. */
export const WRITTEN_HOOK_TYPES = ['identification', 'experience', 'emotion', 'teaching', 'update'] as const;
export type WrittenHookType = (typeof WRITTEN_HOOK_TYPES)[number];

export const WRITTEN_HOOK_LABEL: Record<WrittenHookType, string> = {
  identification: 'identificação',
  experience: 'vivência',
  emotion: 'emoção',
  teaching: 'ensinamento',
  update: 'atualização',
};

/* ── Storytelling ─────────────────────────────────────────────────────────── */

export const STORY_ROLES = {
  hero: 'a pessoa que vê: tem o problema',
  villain: 'o problema em si — nunca a concorrência',
  guide: 'a Carol, ou o produto, mostrando o caminho',
} as const;

export const STORY_SECTIONS = ['hook', 'problem', 'development', 'proof', 'payoff', 'cta'] as const;
export type StorySection = (typeof STORY_SECTIONS)[number];

export const STORY_SECTION_LABEL: Record<StorySection, string> = {
  hook: 'Gancho',
  problem: 'Problema',
  development: 'Desenvolvimento',
  proof: 'Prova',
  payoff: 'Payoff',
  cta: 'Remate',
};

/* ── Reels Test ───────────────────────────────────────────────────────────── */

export const REELS_TEST_POLICY = {
  purpose: 'Entrega para quem não segue: público frio. Serve para atrair, não para vender.',
  excluded: ['conversão direta', 'portfólio', 'venda', 'conteúdo que exige contexto prévio', 'conteúdo muito técnico'],
  brollFormat: {
    minSeconds: 5,
    maxSeconds: 7,
    shape: 'B-roll curto + gancho escrito + legenda que entrega o contexto ou a solução',
    why: 'A pessoa relê o vídeo enquanto lê a legenda, e o tempo de tela sobe.',
  },
  cta: {
    preferred: ['seguir', 'salvar', 'comentar'],
    avoid: ['me contrata', 'pede orçamento', 'link na bio', 'manda mensagem'],
    note: 'Incluir o @ na legenda facilita seguir.',
  },
  /** Experiência, não obrigação. */
  frequency: { kind: 'MENTOR_EXPERIMENT' as const, min: 3, max: 5, per: 'day', spaced: true },
  repost: 'Nunca o mesmo conteúdo igual. Trocar música, frase ou enquadramento é aceitável; idêntico não.',
  cleanup: 'Não apagar o conteúdo antigo todo de uma vez.',
} as const;

/** Números que a mentora citou. São heurísticas: a linha de base real da Carol
 *  ganha-lhes sempre que existir. */
export const PERFORMANCE_HEURISTICS = {
  kind: 'MENTOR_HEURISTIC' as const,
  weakTestMaxViews: 300,
  worthAnalysingViews: 2000,
  feedCandidateViews: 3000,
  note: 'Observado pela mentora noutros perfis. Não é um fato sobre o Instagram nem sobre a Carol.',
} as const;

/* ── Séries e experiências ────────────────────────────────────────────────── */

export const BRAGA_REAL = {
  name: 'Braga Real',
  aliases: ['Braga Profunda'],
  premise:
    'Braga vista por quem passou dez anos numa sala: restaurantes, serviço, experiências e vida local, sem a versão de luxo nem a versão instagramável.',
  structure: 'o lugar → o que ela repara antes de todo mundo (serviço, ritmo, gente) → o veredito de quem já serviu mesa',
  avoid: ['top 5 lugares instagramáveis', 'roteiro turístico', 'review de decoração'],
  pillar: 'A_SALA',
} as const;

export const EXPERIMENT_KINDS = [
  'reels_test_short',
  'english_content',
  'braga_real',
  'capcut_breakdown',
  'talking_head_vs_broll',
  'aesthetic_territory',
] as const;
export type ExperimentKind = (typeof EXPERIMENT_KINDS)[number];

export const EXPERIMENT_SPEC: Record<
  ExperimentKind,
  { label: string; hypothesis: string; whatWeTest: string; compare: readonly string[] }
> = {
  reels_test_short: {
    label: 'Reels Test curto',
    hypothesis: 'B-roll de 5 a 7 segundos com gancho escrito alcança mais não seguidores do que um Reel falado.',
    whatWeTest: 'Peças de teste com B-roll que já existe, gancho escrito e legenda com a solução.',
    compare: ['nonFollowerReach', 'views', 'follows'],
  },
  english_content: {
    label: 'Conteúdo em inglês',
    hypothesis: 'Um vídeo em inglês por semana traz alcance internacional e interesse de marcas de fora.',
    whatWeTest: 'Uma peça em inglês por semana, com guião, sem mudar o feed inteiro.',
    compare: ['reach', 'retention', 'brandInterest'],
  },
  braga_real: {
    label: 'Braga Real',
    hypothesis: 'Braga contada com olhar de sala identifica mais do que conteúdo de lugar bonito.',
    whatWeTest: 'Episódios da série, um lugar de cada vez.',
    compare: ['comments', 'shares', 'nonFollowerReach'],
  },
  capcut_breakdown: {
    label: 'Bastidor de edição',
    hypothesis: 'Mostrar a decisão de edição (bruto → ajuste → final) gera saves sem virar aula.',
    whatWeTest: 'Peças de prova de ofício sobre edição, sem tutorial.',
    compare: ['saves', 'profileVisits'],
  },
  talking_head_vs_broll: {
    label: 'Talking head vs B-roll',
    hypothesis: 'Talking head sobre jornada gera mais comentários do que montagem estética.',
    whatWeTest: 'O mesmo tema nos dois formatos.',
    compare: ['comments', 'retention'],
  },
  aesthetic_territory: {
    label: 'Maquiagem e estilo',
    hypothesis: 'Um território estético mais cuidado (maquiagem, moda) pode funcionar como conteúdo orgânico.',
    whatWeTest: 'Poucas peças, como território experimental — nunca como prioridade comercial.',
    compare: ['saves', 'nonFollowerReach'],
  },
};

/* ── As regras, uma a uma ─────────────────────────────────────────────────── */

export const PLAYBOOK_RULES: readonly PlaybookRule[] = [
  {
    id: 'lens',
    kind: 'MENTOR_RULE',
    rule: 'Mostrar o que está por trás do trabalho.',
    why: 'A régua da mentora: «Estou mostrando o que está por trás do meu trabalho?» Existe processo, raciocínio, escolha, bastidor? Se não, a autoridade não aparece.',
  },
  {
    id: 'differential',
    kind: 'MENTOR_RULE',
    rule: 'O diferencial é dez anos de restaurante mais pesquisa profunda antes de gravar.',
    why: 'É o eixo de todo o conteúdo — usado quando cria uma história melhor, nunca repetido em todo vídeo.',
  },
  {
    id: 'three_functions',
    kind: 'MENTOR_RULE',
    rule: 'Rodar as três funções ao mesmo tempo: atrair, educar, converter.',
    why: 'Só atrair não vende; só converter cansa; só educar vira perfil para creators.',
  },
  {
    id: 'four_modes',
    kind: 'MENTOR_RULE',
    rule: 'Equilibrar autoridade, entretenimento, informação e vida pessoal.',
    why: 'Um perfil preso a um modo fica cansativo ou técnico demais. É o mix que mantém interesse e facilita a venda.',
  },
  {
    id: 'three_hooks',
    kind: 'MENTOR_RULE',
    rule: 'Usar os três ganchos quando fizer sentido: visual, escrito e falado.',
    why: 'O cérebro processa o visual antes do texto. Os três juntos prendem nos primeiros segundos.',
  },
  {
    id: 'hero_villain_guide',
    kind: 'MENTOR_RULE',
    rule: 'O herói é quem vê; o vilão é o problema; a guia é ela.',
    why: 'Nunca a concorrência como vilão. O público sente que o vídeo é para ele.',
  },
  {
    id: 'no_copy',
    kind: 'MENTOR_RULE',
    rule: 'Destrinchar conteúdo validado: copiar a lógica, nunca a fala.',
    why: 'Muitos virais são estruturas replicadas. O que se adapta é o mecanismo, com os produtos e o estilo dela.',
  },
  {
    id: 'document_journey',
    kind: 'MENTOR_RULE',
    rule: 'Documentar a jornada: «foi isso que aconteceu comigo», não «é assim que se faz».',
    why: 'Bastidores, prospecção, a primeira marca, ser brasileira construindo negócio em Portugal — identificação e comunidade.',
  },
  {
    id: 'social_proof',
    kind: 'MENTOR_RULE',
    rule: 'Feedback de marca é ativo: vira conteúdo, com permissão.',
    why: 'O elogio da Charabanc à precisão da essência do produto é prova do que a marca valorizou no processo dela.',
  },
  {
    id: 'reels_test_cold',
    kind: 'MENTOR_RULE',
    rule: 'Reels Test só para atração de público frio — nunca conversão nem portfólio.',
    why: 'É a entrega para quem não segue. Conteúdo que exige contexto ou pede orçamento morre lá.',
  },
  {
    id: 'broll_test',
    kind: 'MENTOR_RULE',
    rule: 'B-roll de 5 a 7 segundos + gancho escrito + legenda que entrega a solução.',
    why: 'A pessoa relê o vídeo enquanto lê a legenda. O tempo de tela sobe sem esforço de gravação.',
  },
  {
    id: 'simple_cta',
    kind: 'MENTOR_RULE',
    rule: 'No teste, o remate é simples: seguir, salvar, comentar.',
    why: 'Público frio não está pronto para converter. Link e orçamento afastam.',
  },
  {
    id: 'no_repost',
    kind: 'MENTOR_RULE',
    rule: 'Nunca repostar igual. Variar música, frase ou enquadramento.',
    why: 'O Instagram detecta duplicado e trava a entrega.',
  },
  {
    id: 'promote_plateau',
    kind: 'MENTOR_RULE',
    rule: 'Quando um teste estabiliza acima do normal dela, vai para o feed.',
    why: 'Move-se à mão para entrar no algoritmo dos seguidores. O sistema avisa; a ação é dela.',
  },
  {
    id: 'frequency',
    kind: 'MENTOR_EXPERIMENT',
    rule: 'Três a cinco Reels Test por dia, espaçados.',
    why: 'É o volume que a mentora recomenda para o algoritmo aprender. Vale como estratégia experimental — a capacidade real dela manda.',
  },
  {
    id: 'weak_test',
    kind: 'MENTOR_HEURISTIC',
    rule: 'Um teste fraco fica entre 100 e 300 views.',
    why: 'Observado pela mentora. A linha de base da Carol ganha assim que existir.',
  },
  {
    id: 'analyse_2000',
    kind: 'MENTOR_HEURISTIC',
    rule: 'Acima de 2000 views vale isolar o que funcionou: música, gancho ou tema.',
    why: 'E replicar esse elemento em testes novos. Comparado sempre com o normal dela, não com o número absoluto.',
  },
  {
    id: 'english',
    kind: 'MENTOR_EXPERIMENT',
    rule: 'Testar conteúdo em inglês.',
    why: 'Para marcas internacionais e para treinar. Uma experiência medida, não o feed inteiro.',
  },
  {
    id: 'technical_content',
    kind: 'MENTOR_RULE',
    rule: 'Conteúdo técnico gera saves e atrai marcas — como prova de ofício, nunca como aula.',
    why: 'A mentora pediu tutoriais de gravação, luz e CapCut; a auditoria do perfil mostra que virar professora atrai a audiência errada. A resolução é educar mostrando o processo: «quase descartei esse take pela luz; foi isto que mudei».',
  },
  {
    id: 'personal_life',
    kind: 'MENTOR_RULE',
    rule: 'Rotina, namorado, humor e Portugal dão respiro ao perfil.',
    why: 'Momentos reais em que o público se reconhece geram partilha e salvamento. Ele é cenário; ela é o produto.',
  },
  {
    id: 'brand_conversion',
    kind: 'MENTOR_RULE',
    rule: 'O pilar de conversão prova capacidade estratégica, não só estética.',
    why: 'Exemplos reais e casos mostram que a criação entrega valor à marca — é a vitrine para quem contrata.',
  },
  {
    id: 'gallery',
    kind: 'MENTOR_RULE',
    rule: 'Ter uma pasta de takes do cotidiano: trabalhando, digitando, maquiando.',
    why: 'É a matéria-prima do Reels Test. Sem ela, cada teste pede gravação nova.',
  },
  {
    id: 'tech_niche',
    kind: 'CANONICAL_BUSINESS_POLICY',
    rule: 'Tecnologia para o lar é o nicho comercial; o conteúdo orgânico é a vida dela.',
    why: 'Confirmado na mentoria e no briefing Tech-first. Tech manda na prospecção; no feed entra quando é episódio da vida dela.',
  },
  {
    id: 'skincare_out',
    kind: 'CANONICAL_BUSINESS_POLICY',
    rule: 'Skincare fica fora como nicho.',
    why: 'Arquivado na mentoria por falta de identificação, e já excluído em código na prospecção. Pele real (rosácea) continua como história pessoal, não como rotina de beleza.',
  },
  {
    id: 'aesthetic_experimental',
    kind: 'MENTOR_EXPERIMENT',
    rule: 'Maquiagem e moda: território orgânico experimental.',
    why: 'Ela se sente mais confortável aí do que em skincare. Testa-se; não vira prioridade comercial sozinho.',
  },
];

export const ruleById = (id: string): PlaybookRule | undefined => PLAYBOOK_RULES.find((r) => r.id === id);

/* ── O que veio depois da reunião ─────────────────────────────────────────── */

export const SOURCE_REFERENCES: readonly { label: string; note: string }[] = [
  { label: 'Documento da sessão', note: 'Google Doc partilhado pela Carol a 02/09/2026, gerado pelo Gemini.' },
  { label: 'Gravação', note: 'Existe no Drive da mentora; não foi lida.' },
  { label: 'Rafael Ferrari', note: 'Creator que a Carol cita como referência de roteiro por sensação.' },
  { label: 'Programa Pioneer do CapCut', note: 'A mentora ia indicar a Carol a um contacto do CapCut. É uma oportunidade, não uma nota.' },
];

/* ── O playbook inteiro, para salvar e para ler ───────────────────────────── */

export const MENTOR_PLAYBOOK = {
  id: MENTOR_SOURCE.id,
  version: PLAYBOOK_VERSION,
  source: MENTOR_SOURCE,
  effectiveAt: MENTOR_SOURCE.effectiveAt,
  strategicLens: 'Estou mostrando o que está por trás do meu trabalho?',
  functionalPillars: FUNCTION_SPEC,
  editorialModes: MODE_SPEC,
  hookFrameworks: { channels: HOOK_CHANNEL_LABEL, writtenTypes: WRITTEN_HOOK_LABEL },
  storytellingFrameworks: { roles: STORY_ROLES, sections: STORY_SECTION_LABEL },
  reelsTestPolicy: REELS_TEST_POLICY,
  performanceHeuristics: PERFORMANCE_HEURISTICS,
  seriesConcepts: [BRAGA_REAL],
  recommendedExperiments: EXPERIMENT_SPEC,
  rules: PLAYBOOK_RULES,
  sourceReferences: SOURCE_REFERENCES,
} as const;

/* ── Classificação de uma frase ───────────────────────────────────────────── */

/** Que tipo de conhecimento é uma frase da mentoria.
 *
 *  Existe para o dia em que alguém colar uma anotação nova: um número é uma
 *  heurística, uma frequência é uma experiência, o resto é regra. */
export function knowledgeKindOf(statement: string): KnowledgeKind {
  const t = statement.toLowerCase();
  if (/\b\d+\s*(a|-|–|até)\s*\d+\s*(por|\/)\s*(dia|semana)\b|\bpor dia\b|\bpor semana\b|\btestar\b/.test(t)) {
    return 'MENTOR_EXPERIMENT';
  }
  if (/\b\d[\d.,]*\s*(views|visualiza|seguidores|%|mil)\b/.test(t)) return 'MENTOR_HEURISTIC';
  return 'MENTOR_RULE';
}

/* ── O playbook dito ao modelo ────────────────────────────────────────────── */

/** Curto de propósito. O modelo aplica; não recita. */
export function describePlaybook(): string {
  const regras = PLAYBOOK_RULES.filter((r) => r.kind === 'MENTOR_RULE' || r.kind === 'CANONICAL_BUSINESS_POLICY');
  return [
    `A LENTE DA MENTORA: «${MENTOR_PLAYBOOK.strategicLens}» Existe processo, raciocínio, escolha, bastidor, competência demonstrável? Se não, a ideia de autoridade ou conversão vale menos.`,
    '',
    'DUAS CLASSIFICAÇÕES, DOIS EIXOS (não são a mesma coisa):',
    `- FUNÇÃO: ${CONTENT_FUNCTIONS.map((f) => `${f} (${FUNCTION_SPEC[f].label.toLowerCase()})`).join(', ')}.`,
    `- MODO: ${EDITORIAL_MODES.map((m) => `${m} (${MODE_SPEC[m].label.toLowerCase()})`).join(', ')}. Uma ideia tem uma função e um ou dois modos.`,
    '',
    'TRÊS GANCHOS quando o formato pedir: visual (o que prende o olho no primeiro segundo), escrito (o texto na tela), falado (a primeira frase). Os três dizem coisas diferentes e trabalham juntos. Um B-roll mudo não tem gancho falado — e isso é uma escolha, não uma falha.',
    `Tipos de gancho escrito: ${WRITTEN_HOOK_TYPES.map((t) => WRITTEN_HOOK_LABEL[t]).join(', ')}.`,
    '',
    'HISTÓRIA: herói = quem vê (tem o problema); vilão = o problema, NUNCA a concorrência; guia = ela ou o produto. No roteiro isto vira gancho → problema → desenvolvimento → prova → payoff → remate.',
    '',
    'REELS TEST: atração de público frio. Universal, curto, sem contexto prévio, remate simples (seguir, salvar, comentar). Nunca conversão, portfólio ou «pede orçamento». Formato preferido: B-roll de 5 a 7 s + gancho escrito + legenda que entrega a solução — e B-roll que JÁ EXISTE antes de pedir gravação nova.',
    '',
    'EDUCAR É PROVA DE OFÍCIO, NÃO AULA: «quase descartei esse take pela luz — foi isto que mudei», bruto → ajuste → final. Nunca «5 dicas de iluminação».',
    '',
    'REGRAS:',
    ...regras.map((r) => `- ${r.rule}`),
  ].join('\n');
}

/** As três listas da tela de estratégia. */
export function playbookForScreen(): {
  following: PlaybookRule[];
  testing: { kind: ExperimentKind; label: string; hypothesis: string }[];
  heuristics: PlaybookRule[];
} {
  return {
    following: PLAYBOOK_RULES.filter((r) => r.kind === 'MENTOR_RULE' || r.kind === 'CANONICAL_BUSINESS_POLICY'),
    testing: EXPERIMENT_KINDS.map((k) => ({ kind: k, label: EXPERIMENT_SPEC[k].label, hypothesis: EXPERIMENT_SPEC[k].hypothesis })),
    heuristics: PLAYBOOK_RULES.filter((r) => r.kind === 'MENTOR_HEURISTIC' || r.kind === 'MENTOR_EXPERIMENT'),
  };
}
