/** A arquitetura editorial decidida em `CarolOS_Content_Strategy_Source_of_Truth_v1`
 *  (baseline congelada, 28/09/2026).
 *
 *  O erro que este ficheiro existe para não deixar acontecer é o de misturar
 *  eixos. Pilar é território, objetivo é função, lente é dimensão da pessoa,
 *  formato é recipiente da plataforma e modalidade é tipo de trabalho
 *  comercial. São cinco perguntas diferentes, e colapsá-las em «pilar» torna
 *  «que formato funciona para provar competência» impossível de responder.
 *
 *  Os quatro pilares funcionais de `pillars.ts` eram objetivos disfarçados.
 *  Continuam lá, para o histórico; aqui nascem os três territórios reais.
 *
 *  Puro. */

/* ── Pilares ──────────────────────────────────────────────────────────────── */

export const PILLARS = ['ugc_income', 'experiences', 'home'] as const;
export type Pillar = (typeof PILLARS)[number];

export const isPillar = (v: unknown): v is Pillar =>
  typeof v === 'string' && (PILLARS as readonly string[]).includes(v);

export type PillarSpec = {
  label: string;
  purpose: string;
  guardrails: readonly string[];
};

export const PILLAR: Record<Pillar, PillarSpec> = {
  ugc_income: {
    label: 'Transformando UGC em fonte de renda',
    purpose:
      'Documentar a construção real da carreira: experiência, processo, marcas, acertos, erros e evolução.',
    guardrails: [
      'documentar, não ensinar',
      'bastidor e processo não viram tutorial automático',
      'não se posicionar como professora de creators',
    ],
  },
  experiences: {
    label: 'Experiências',
    purpose:
      'O olhar da Carol sobre serviço, hospitalidade, preço e experiência real — incluindo o quadro Braga a Fundo.',
    guardrails: [
      'não virar lista genérica de lugares',
      'a força vem da percepção dela, não da descrição do sítio',
    ],
  },
  home: {
    label: 'Casa',
    purpose:
      'A vida em casa: rotina com sete bichos, tecnologia doméstica, relacionamento e o humor que nasce daí.',
    guardrails: [
      'rotina neutra sem ponto editorial não é conteúdo',
      'exposição de terceiros exige autorização',
    ],
  },
};

export const PILLAR_LABEL: Record<Pillar, string> = {
  ugc_income: PILLAR.ugc_income.label,
  experiences: PILLAR.experiences.label,
  home: PILLAR.home.label,
};

/** Curto, para caber num cartão de telemóvel. */
export const PILLAR_SHORT: Record<Pillar, string> = {
  ugc_income: 'UGC como renda',
  experiences: 'Experiências',
  home: 'Casa',
};

/* ── Foco comercial ───────────────────────────────────────────────────────── */

/** O mercado-alvo. Não é um pilar editorial e não pode virar um: o software é
 *  o cliente desejado, o negócio local é apenas o contexto que ele atende.
 *
 *  Os contextos abaixo são exemplos abertos. Nenhum deles autoriza o motor a
 *  concluir que a Carol quer produzir UGC tradicional para restaurantes. */
export const COMMERCIAL_FOCUS = {
  market: 'SaaS e aplicativos que atendem negócios locais',
  contexts: [
    'restaurantes', 'salões', 'clínicas', 'hospedagem',
    'fitness', 'imobiliário', 'comércio local', 'serviços',
  ],
} as const;

/* ── Modalidades comerciais ───────────────────────────────────────────────── */

export const MODALITIES = ['tech_ugc', 'canvas_ugc', 'none'] as const;
export type Modality = (typeof MODALITIES)[number];

export const isModality = (v: unknown): v is Modality =>
  typeof v === 'string' && (MODALITIES as readonly string[]).includes(v);

export const MODALITY_LABEL: Record<Modality, string> = {
  tech_ugc: 'Tech UGC',
  canvas_ugc: 'Canvas UGC',
  none: 'Não comercial',
};

export const MODALITY_NOTE: Record<Modality, string> = {
  tech_ugc:
    'Conteúdo para apps, software e SaaS. Fala direta, explicação simples do produto, pouca edição, prioridade para entendimento e persuasão.',
  canvas_ugc:
    'Vídeos curtos e rápidos, orientados por formatos que já circulam, adaptados para marcas tech. Produção leve, lógica de volume.',
  none: 'Conteúdo próprio, sem marca envolvida.',
};

/** As duas modalidades comerciais começam empatadas. Nenhuma função deste
 *  módulo devolve uma «vencedora»: quem decide isso é o Laboratório, com
 *  peças comparadas. */
export const COMMERCIAL_MODALITIES: readonly Modality[] = ['tech_ugc', 'canvas_ugc'];

/** UGC tradicional (produto/lifestyle estético) está fora da prioridade atual.
 *  Não existe como valor de `Modality` de propósito: o que não é representável
 *  não é proposto por engano. */
export const TRADITIONAL_UGC_OUT_OF_SCOPE =
  'UGC tradicional está fora da prioridade atual. Carol decidiu focar Tech UGC e Canvas UGC.';

/* ── Formatos e estruturas ────────────────────────────────────────────────── */

export const FORMATS = ['reel', 'carousel', 'photo_sequence', 'story'] as const;
export type Format = (typeof FORMATS)[number];

export const isFormat = (v: unknown): v is Format =>
  typeof v === 'string' && (FORMATS as readonly string[]).includes(v);

export const FORMAT_LABEL: Record<Format, string> = {
  reel: 'Reel',
  carousel: 'Carrossel',
  photo_sequence: 'Sequência de fotos',
  story: 'Stories',
};

export const STRUCTURES = [
  'talking_head', 'voice_over', 'pov', 'dialogue', 'screen_recording', 'montage',
] as const;
export type Structure = (typeof STRUCTURES)[number];

export const isStructure = (v: unknown): v is Structure =>
  typeof v === 'string' && (STRUCTURES as readonly string[]).includes(v);

export const STRUCTURE_LABEL: Record<Structure, string> = {
  talking_head: 'Falando para a câmera',
  voice_over: 'Narração por cima',
  pov: 'POV',
  dialogue: 'Diálogo',
  screen_recording: 'Gravação de tela',
  montage: 'Montagem',
};

/* ── Objetivos editoriais ─────────────────────────────────────────────────── */

export const OBJECTIVES = ['attract', 'retain', 'prove', 'convert'] as const;
export type Objective = (typeof OBJECTIVES)[number];

export const isObjective = (v: unknown): v is Objective =>
  typeof v === 'string' && (OBJECTIVES as readonly string[]).includes(v);

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  attract: 'Atrair',
  retain: 'Reter',
  prove: 'Provar',
  convert: 'Converter',
};

export const OBJECTIVE_QUESTION: Record<Objective, string> = {
  attract: 'Como fazer pessoas novas encontrarem a Carol?',
  retain: 'Como fazer quem chegou querer continuar acompanhando?',
  prove: 'Como tornar visível que a Carol sabe pensar e executar?',
  convert: 'Como facilitar que uma marca dê o próximo passo?',
};

/** Os sinais que julgam uma peça. Uma peça é avaliada primeiro contra o
 *  objetivo para o qual foi planeada — não existe métrica universal de
 *  vencedor. A ordem importa: o primeiro é o sinal principal. */
export const OBJECTIVE_SIGNALS: Record<Objective, readonly string[]> = {
  attract: ['reach', 'non_follower_reach', 'shares', 'follows'],
  retain: ['qualified_interaction', 'identification', 'questions', 'saves', 'recurring_conversation'],
  prove: ['profile_visits', 'saves', 'work_conversation', 'dms', 'brand_interest'],
  convert: ['brand_contact', 'quote_request', 'portfolio_request', 'commercial_action'],
};

export const OBJECTIVE_SIGNAL_LABEL: Record<string, string> = {
  reach: 'alcance',
  non_follower_reach: 'alcance em não seguidores',
  shares: 'compartilhamentos',
  follows: 'novos seguidores',
  qualified_interaction: 'interação qualificada',
  identification: 'identificação',
  questions: 'perguntas',
  saves: 'salvamentos',
  recurring_conversation: 'conversa recorrente',
  profile_visits: 'visitas ao perfil',
  work_conversation: 'conversa sobre o trabalho',
  dms: 'mensagens diretas',
  brand_interest: 'interesse de marca',
  brand_contact: 'contato de marca',
  quote_request: 'pedido de orçamento',
  portfolio_request: 'pedido de portfólio',
  commercial_action: 'ação comercial',
};

/* ── Lentes ───────────────────────────────────────────────────────────────── */

export const LENSES = ['who_i_am', 'how_i_think', 'what_i_do'] as const;
export type Lens = (typeof LENSES)[number];

export const isLens = (v: unknown): v is Lens =>
  typeof v === 'string' && (LENSES as readonly string[]).includes(v);

export const LENS_LABEL: Record<Lens, string> = {
  who_i_am: 'Quem sou',
  how_i_think: 'Como penso',
  what_i_do: 'O que faço',
};

export const LENS_KEEPS: Record<Lens, string> = {
  who_i_am: 'História, rotina, valores, humor, relacionamentos, gostos, fase de vida.',
  how_i_think: 'Critérios, observações, raciocínio, percepção de experiência, decisões criativas.',
  what_i_do: 'Processo, trabalho, comunicação, UGC, execução, evolução profissional.',
};

/* ── Estados do Mapa ──────────────────────────────────────────────────────── */

export const TOPIC_STATES = ['now', 'next', 'later', 'paused'] as const;
export type TopicState = (typeof TOPIC_STATES)[number];

export const isTopicState = (v: unknown): v is TopicState =>
  typeof v === 'string' && (TOPIC_STATES as readonly string[]).includes(v);

export const TOPIC_STATE_LABEL: Record<TopicState, string> = {
  now: 'Agora',
  next: 'Próximos',
  later: 'Depois',
  paused: 'Pausado',
};

export const TOPIC_STATE_NOTE: Record<TopicState, string> = {
  now: 'Alinhado à fase atual. Pode ser escolhido esta semana.',
  next: 'Relevante, mas não precisa disputar os próximos posts.',
  later: 'Guardado no mapa, sem peso agora.',
  paused: 'Não sugerir até você reativar.',
};

/** Só «Agora» disputa a semana. «Pausado» nunca é proposto — e um assunto
 *  pausado continua existindo, que é a diferença entre pausar e apagar. */
export const isEligibleForWeek = (state: TopicState) => state === 'now';

/* ── Assuntos confirmados ─────────────────────────────────────────────────── */

export type TopicSeed = {
  slug: string;
  pillar: Pillar;
  label: string;
  howToTreat: string;
  /** Estado inicial. Só entram em «Agora» os que a fase atual pede. */
  state: TopicState;
};

/** Os assuntos que o PDF confirma, com o tratamento que ele define. Definição
 *  versionada em código; o estado vive na base, como as lentes de busca. */
export const SOT_TOPICS: readonly TopicSeed[] = [
  {
    slug: 'my_experience_so_far', pillar: 'ugc_income', state: 'now',
    label: 'Minha experiência até aqui',
    howToTreat: 'Relato e perspectiva pessoal.',
  },
  {
    slug: 'what_i_did_how', pillar: 'ugc_income', state: 'now',
    label: 'O que fiz e como fiz',
    howToTreat: 'Bastidor e processo, sem virar tutorial.',
  },
  {
    slug: 'what_worked_what_failed', pillar: 'ugc_income', state: 'now',
    label: 'O que deu certo e o que deu errado',
    howToTreat: 'Aprendizado vivido, com contexto.',
  },
  {
    slug: 'what_im_going_through', pillar: 'ugc_income', state: 'now',
    label: 'O que estou passando agora',
    howToTreat: 'Jornada atual, inclusive incerteza e adaptação.',
  },
  {
    slug: 'brand_experiences', pillar: 'ugc_income', state: 'now',
    label: 'Experiências com marcas',
    howToTreat: 'Como aconteceu, como você percebeu, o que aprendeu.',
  },
  {
    slug: 'tech_ugc', pillar: 'ugc_income', state: 'now',
    label: 'Tech UGC',
    howToTreat: 'Evolução profissional, trabalhos, peças, processo e experimentação.',
  },
  {
    slug: 'canvas_ugc', pillar: 'ugc_income', state: 'now',
    label: 'Canvas UGC',
    howToTreat: 'Evolução profissional e experimentação de formatos curtos para tech.',
  },

  {
    slug: 'braga_a_fundo', pillar: 'experiences', state: 'now',
    label: 'Braga a Fundo',
    howToTreat: 'O quadro. Um lugar de cada vez, com o olhar dela no centro.',
  },
  {
    slug: 'restaurants', pillar: 'experiences', state: 'now',
    label: 'Restaurantes',
    howToTreat: 'Serviço, sala, detalhe. Nunca lista genérica de lugares.',
  },
  {
    slug: 'hotels_stays', pillar: 'experiences', state: 'next',
    label: 'Hotéis e hospedagem',
    howToTreat: 'A experiência de ficar, não o tour do quarto.',
  },
  {
    slug: 'service', pillar: 'experiences', state: 'next',
    label: 'Atendimento',
    howToTreat: 'Dez anos de sala dão critério. É percepção, não regra.',
  },
  {
    slug: 'price', pillar: 'experiences', state: 'next',
    label: 'Preço',
    howToTreat: 'Valeu ou não valeu, e porquê.',
  },
  {
    slug: 'real_experience', pillar: 'experiences', state: 'now',
    label: 'Experiência real',
    howToTreat: 'A sensação de estar lá. POV funciona bem aqui.',
  },
  {
    slug: 'hospitality', pillar: 'experiences', state: 'next',
    label: 'Hospitalidade',
    howToTreat: 'O que faz alguém se sentir recebido.',
  },

  {
    slug: 'routine', pillar: 'home', state: 'now',
    label: 'Rotina',
    howToTreat: 'A vida como ela é, com um ponto editorial.',
  },
  {
    slug: 'seven_pets', pillar: 'home', state: 'now',
    label: 'Sete bichos',
    howToTreat: 'A casa cheia. Humor de situação real.',
  },
  {
    slug: 'relationship', pillar: 'home', state: 'next',
    label: 'Relacionamento',
    howToTreat: 'A dois, com o cuidado de quem expõe outra pessoa.',
  },
  {
    slug: 'home_tech', pillar: 'home', state: 'now',
    label: 'Tecnologia doméstica',
    howToTreat: 'Os aparelhos e como ajudam no cotidiano.',
  },
  {
    slug: 'home_robots', pillar: 'home', state: 'next',
    label: 'Robôs e automações',
    howToTreat: 'O que a máquina resolve e o que não resolve.',
  },
  {
    slug: 'home_memes', pillar: 'home', state: 'next',
    label: 'Memes da casa',
    howToTreat: 'O que nasce desse universo e faz rir.',
  },
];

/** «Como é morar em Portugal» foi explicitamente rejeitado como pauta. Portugal
 *  aparece como contexto natural da vida dela; não disputa prioridade.
 *
 *  A função existe para que a recusa seja código com teste, e não uma frase
 *  dentro de um prompt que sobrevive até alguém reescrever o prompt. */
const PORTUGAL_AS_TOPIC = [
  'como e morar em portugal', 'como e viver em portugal', 'morar em portugal',
  'viver em portugal', 'vida em portugal', 'mudar para portugal',
  'brasileira em portugal',
];

export const PORTUGAL_IS_CONTEXT =
  'Portugal aparece como contexto da sua vida, não como pauta. «Como é morar em Portugal» foi rejeitado explicitamente.';

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Recusa um assunto que o PDF rejeitou. Devolve o motivo, nunca um booleano:
 *  «Portugal é contexto» explica-se, `false` não. */
export function rejectedTopic(label: string): string | null {
  const t = fold(label);
  if (PORTUGAL_AS_TOPIC.some((p) => t.includes(fold(p)))) return PORTUGAL_IS_CONTEXT;
  return null;
}

/* ── Foco Atual ───────────────────────────────────────────────────────────── */

export const FOCUS_ITEMS = [
  'career_building', 'tech_ugc', 'canvas_ugc', 'saas_local_business',
  'audience_growth', 'community', 'format_discovery', 'personal_brand',
] as const;
export type FocusItem = (typeof FOCUS_ITEMS)[number];

export const isFocusItem = (v: unknown): v is FocusItem =>
  typeof v === 'string' && (FOCUS_ITEMS as readonly string[]).includes(v);

export const FOCUS_ITEM_LABEL: Record<FocusItem, string> = {
  career_building: 'Construção de carreira',
  tech_ugc: 'Tech UGC',
  canvas_ugc: 'Canvas UGC',
  saas_local_business: 'SaaS e apps para negócios locais',
  audience_growth: 'Crescimento de audiência',
  community: 'Criação de comunidade',
  format_discovery: 'Descoberta de formatos',
  personal_brand: 'Manutenção da marca pessoal',
};

/** O foco conhecido em 28/09/2026. Muda mensalmente sem reescrever os pilares:
 *  é essa separação que a existência deste objeto serve. */
export const DEFAULT_FOCUS: readonly FocusItem[] = [
  'career_building', 'tech_ugc', 'canvas_ugc', 'saas_local_business',
  'audience_growth', 'community', 'format_discovery', 'personal_brand',
];

/** Que assuntos o foco atual empurra. Não é um filtro: um assunto fora desta
 *  lista continua elegível se estiver em «Agora». É um empurrão. */
export const FOCUS_TOPIC_AFFINITY: Partial<Record<FocusItem, readonly string[]>> = {
  tech_ugc: ['tech_ugc', 'brand_experiences', 'what_i_did_how'],
  canvas_ugc: ['canvas_ugc', 'what_i_did_how'],
  saas_local_business: ['tech_ugc', 'brand_experiences'],
  career_building: ['my_experience_so_far', 'what_im_going_through', 'what_worked_what_failed'],
  format_discovery: ['canvas_ugc', 'tech_ugc'],
  community: ['what_im_going_through', 'routine', 'seven_pets'],
  personal_brand: ['routine', 'seven_pets', 'home_tech', 'real_experience'],
  audience_growth: ['real_experience', 'braga_a_fundo', 'seven_pets'],
};

/* ── Documentar, não ensinar ──────────────────────────────────────────────── */

type Marker = { re: RegExp; kind: 'hard' | 'soft'; what: string };

/** Enquadramentos que transformam a Carol em professora de creators.
 *
 *  `hard` é o que o PDF nomeia: falar com creators e dar veredito sobre o que
 *  elas fazem. `soft` é prescrição genérica — só sinaliza quando não existe
 *  âncora pessoal, porque «eu decidi sempre fazer X» é experiência, não aula. */
const TEACHER_MARKERS: readonly Marker[] = [
  { re: /\bse (voce|vc|tu) (e|és|e' ) ?(uma )?creator\b/, kind: 'hard', what: 'fala dirigida a creators' },
  { re: /\bpara (voce|vcs|voces) creators?\b/, kind: 'hard', what: 'fala dirigida a creators' },
  { re: /\bcreators? que (fazem|faz|cometem)\b/, kind: 'hard', what: 'veredito sobre creators' },
  { re: /\best(a|ao) fazendo errado\b/, kind: 'hard', what: 'veredito sobre quem assiste' },
  { re: /\b(o )?(maior )?erro que (voce|vc|voces|vcs) (comete|faz|esta cometendo)\b/, kind: 'hard', what: 'veredito sobre quem assiste' },
  { re: /\bpare de\b/, kind: 'hard', what: 'ordem para quem assiste' },
  { re: /\b\d+\s*(dicas|passos|erros|regras|segredos|formas)\b/, kind: 'hard', what: 'formato de aula' },
  { re: /\bpasso a passo para (voce|vc)\b/, kind: 'hard', what: 'formato de aula' },
  { re: /\bcomo (fazer|conseguir|ganhar|cobrar|come(c|ç)ar)\b/, kind: 'soft', what: 'promessa de tutorial' },
  { re: /\b(voce|vc) (deve|tem que|precisa|devia|deveria)\b/, kind: 'soft', what: 'prescrição' },
  { re: /\bnunca fa(c|ç)a\b/, kind: 'soft', what: 'prescrição' },
  { re: /\bsempre fa(c|ç)a\b/, kind: 'soft', what: 'prescrição' },
  { re: /\baprenda a\b/, kind: 'soft', what: 'promessa de aula' },
  { re: /\bo jeito certo de\b/, kind: 'soft', what: 'veredito de método' },
  { re: /\bdica (de ouro|importante)\b/, kind: 'soft', what: 'formato de aula' },
];

/** Marcas de que a frase é experiência da Carol, não regra para os outros. */
const PERSONAL_ANCHORS: readonly RegExp[] = [
  /\beu (fiz|decidi|escolhi|errei|aprendi|percebi|tentei|passei|achei|sinto|acho|fui|estava|tinha)\b/,
  /\b(comigo|na minha|no meu|pra mim|para mim|meu processo|minha experiencia|minha decisao)\b/,
  /\bo que (eu )?(fiz|aprendi|percebi|mudei|decidi)\b/,
  /\bquando (eu )?(fui|fiz|comecei|recebi|gravei|mandei)\b/,
  /\bme (aconteceu|pediram|responderam|disseram)\b/,
  /\bna (primeira|ultima) vez que eu\b/,
];

/** Como reescrever. Não são frases prontas: são os enquadramentos que o PDF
 *  autoriza como substitutos. */
export const PERSONAL_REFRAMES = [
  'experiência pessoal',
  'decisão própria',
  'bastidor',
  'aprendizado vivido',
  'reflexão',
  'situação real',
] as const;

export type TeacherCheck = {
  flagged: boolean;
  /** O que disparou, em português, para a tela poder dizer porquê. */
  markers: string[];
  anchors: number;
  because: string;
  /** Para onde reescrever. Vazio quando não há nada a corrigir. */
  reframes: readonly string[];
};

/** Avalia o enquadramento, não a presença de conselho.
 *
 *  Uma peça pode conter conselho: «eu decidi nunca fazer permuta sem contrato»
 *  é decisão própria. O que a regra impede é a estratégia padrão empurrar a
 *  Carol para o papel de professora de creators. */
export function teacherFraming(text: string): TeacherCheck {
  const t = fold(text);
  const hit = TEACHER_MARKERS.filter((m) => m.re.test(t));
  const anchors = PERSONAL_ANCHORS.filter((re) => re.test(t)).length;

  const hard = hit.filter((m) => m.kind === 'hard');
  const soft = hit.filter((m) => m.kind === 'soft');
  // Prescrição genérica ancorada em experiência própria passa. Fala dirigida a
  // creators não passa nunca — é exatamente o exemplo do PDF.
  const flagged = hard.length > 0 || (soft.length > 0 && anchors === 0);

  const markers = [...new Set((hard.length ? hard : flagged ? soft : []).map((m) => m.what))];

  return {
    flagged,
    markers,
    anchors,
    because: flagged
      ? hard.length
        ? `Isso fala com creators como professora (${markers.join(', ')}). Conte o que aconteceu com você.`
        : `O texto prescreve sem contar de onde veio (${markers.join(', ')}). Ancore numa situação sua.`
      : '',
    reframes: flagged ? PERSONAL_REFRAMES : [],
  };
}

/* ── Inferência de lente ──────────────────────────────────────────────────── */

export type LensGuess = { lens: Lens; confidence: 'low' | 'medium' | 'high'; because: string };

const WHAT_I_DO = /\b(trabalho|cliente|marca|briefing|entrega|gravei|editei|processo|portfolio|proposta|or(c|ç)amento|campanha|roteiro|screen recording|demo)\b/;
const HOW_I_THINK = /\b(por que|porque escolhi|criterio|percep(c|ç)ao|comparando|comparacao|reparei|acho que|na minha leitura|avaliei|preco|atendimento|detalhe|analisei|decidi entre)\b/;
const WHO_I_AM = /\b(rotina|casa|bicho|gato|cachorro|namorado|familia|manha|sabado|domingo|cansada|feliz|humor|vida)\b/;

/** Classifica automaticamente quando dá. Devolve `null` quando não dá — a
 *  Carol não precisa preencher isto peça a peça, mas inventar a lente é pior
 *  do que deixá-la vazia.
 *
 *  A ordem de desempate não é neutra: o pilar é o sinal mais forte porque é a
 *  única coisa que alguém decidiu de propósito. */
export function inferLens(input: {
  pillar: Pillar;
  angle: string;
  topicSlug?: string;
  modality?: Modality;
  structure?: Structure | null;
}): LensGuess | null {
  const t = fold(`${input.angle} ${input.topicSlug ?? ''}`);

  if (input.modality && input.modality !== 'none') {
    return { lens: 'what_i_do', confidence: 'high', because: 'É um trabalho comercial.' };
  }
  if (input.structure === 'screen_recording') {
    return { lens: 'what_i_do', confidence: 'medium', because: 'Tem gravação de tela: é execução.' };
  }

  const scores: Record<Lens, number> = { who_i_am: 0, how_i_think: 0, what_i_do: 0 };
  if (WHAT_I_DO.test(t)) scores.what_i_do += 2;
  if (HOW_I_THINK.test(t)) scores.how_i_think += 2;
  if (WHO_I_AM.test(t)) scores.who_i_am += 2;

  if (input.pillar === 'ugc_income') scores.what_i_do += 1;
  if (input.pillar === 'experiences') scores.how_i_think += 1;
  if (input.pillar === 'home') scores.who_i_am += 1;

  const ranked = (Object.entries(scores) as [Lens, number][]).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  if (top[1] === 0) return null;
  if (top[1] === second[1]) return null;

  return {
    lens: top[0],
    confidence: top[1] - second[1] >= 2 ? 'medium' : 'low',
    because:
      top[0] === 'what_i_do' ? 'O ângulo é sobre execução e trabalho.'
      : top[0] === 'how_i_think' ? 'O ângulo é sobre critério e percepção.'
      : 'O ângulo é sobre a vida dela.',
  };
}

/* ── Equilíbrio em janela móvel ───────────────────────────────────────────── */

/** O tamanho da janela é default experimental, não fórmula. Seis publicações
 *  é o ponto de partida que o PDF sugere para observar equilíbrio. */
export const DEFAULT_BALANCE_WINDOW = 6;

/** Capacidade-base declarada pela Carol. Três. O sistema não volta a operar
 *  com quatro como obrigação, e não existe alerta por não chegar a quatro. */
export const DEFAULT_WEEKLY_CAPACITY = 3;

/** Peças prontas em estoque. Recomendação de produto, ajustável pelo uso. */
export const DEFAULT_STOCK_TARGET = 3;

/** Um experimento relevante por vez, com três posts semanais. */
export const DEFAULT_MAX_RUNNING_EXPERIMENTS = 1;

export type SettingsShape = {
  version: string;
  balanceWindow: number;
  weeklyCapacity: number;
  stockTarget: number;
  maxRunningExperiments: number;
  /** Ponto de partida possível: 2 Atrair, 2 Reter, 2 Provar numa janela de 6.
   *  Converter sem slot obrigatório. Não é regra permanente. */
  objectiveTarget: Record<Objective, number>;
  radarMaxCreators: number;
};

export const DEFAULT_SETTINGS: SettingsShape = {
  version: 'CAROL_CONTENT_SETTINGS_V1',
  balanceWindow: DEFAULT_BALANCE_WINDOW,
  weeklyCapacity: DEFAULT_WEEKLY_CAPACITY,
  stockTarget: DEFAULT_STOCK_TARGET,
  maxRunningExperiments: DEFAULT_MAX_RUNNING_EXPERIMENTS,
  objectiveTarget: { attract: 2, retain: 2, prove: 2, convert: 0 },
  radarMaxCreators: 6,
};

export type BalanceEntry<K extends string> = {
  key: K;
  observed: number;
  target: number;
  /** Positivo quando falta. É por isto que o motor prioriza. */
  deficit: number;
};

function balance<K extends string>(
  keys: readonly K[],
  observed: readonly (K | null | undefined)[],
  target: Record<K, number>,
): BalanceEntry<K>[] {
  return keys.map((key) => {
    const count = observed.filter((o) => o === key).length;
    return { key, observed: count, target: target[key], deficit: target[key] - count };
  });
}

/** A janela móvel das últimas N peças. Não é «esta semana»: uma semana com
 *  dois posts não desequilibra nada sozinha. */
export function rollingWindow<T>(pieces: readonly T[], size = DEFAULT_BALANCE_WINDOW): T[] {
  return pieces.slice(0, Math.max(0, size));
}

export function objectiveBalance(
  recent: readonly (Objective | null)[],
  target: Record<Objective, number> = DEFAULT_SETTINGS.objectiveTarget,
): BalanceEntry<Objective>[] {
  return balance(OBJECTIVES, recent, target);
}

/** Pilares não têm quota: o alvo é o equilíbrio simples da janela. Três
 *  pilares numa janela de seis dá dois cada. Quando a janela não divide, o
 *  resto fica em zero e ninguém é penalizado por arredondamento. */
export function pillarBalance(
  recent: readonly (Pillar | null)[],
  windowSize = DEFAULT_BALANCE_WINDOW,
): BalanceEntry<Pillar>[] {
  const each = Math.floor(windowSize / PILLARS.length);
  return balance(PILLARS, recent, { ugc_income: each, experiences: each, home: each });
}

export function lensBalance(
  recent: readonly (Lens | null)[],
  windowSize = DEFAULT_BALANCE_WINDOW,
): BalanceEntry<Lens>[] {
  const each = Math.floor(windowSize / LENSES.length);
  return balance(LENSES, recent, { who_i_am: each, how_i_think: each, what_i_do: each });
}

/** O que está em falta, do mais em falta para o menos. Empate resolve-se pela
 *  ordem canônica, que é estável — duas corridas com os mesmos dados dão a
 *  mesma resposta. */
export function underrepresented<K extends string>(entries: readonly BalanceEntry<K>[]): BalanceEntry<K>[] {
  return entries.filter((e) => e.deficit > 0).sort((a, b) => b.deficit - a.deficit);
}

/** A frase do resumo estratégico. Sai das decisões reais, não de um modelo.
 *
 *  «1 para atrair, 1 para reter, 1 para provar. Também temos um teste de
 *  formato nesta semana.» */
export function strategySummary(input: {
  objectives: readonly Objective[];
  experiment?: string | null;
}): string {
  const counts = OBJECTIVES.map((o) => ({ o, n: input.objectives.filter((x) => x === o).length })).filter((x) => x.n > 0);
  if (counts.length === 0) return 'Ainda não há proposta para esta semana.';
  const partes = counts.map((c) => `${c.n} para ${OBJECTIVE_LABEL[c.o].toLowerCase()}`);
  const frase = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
  const capitalizada = frase.charAt(0).toUpperCase() + frase.slice(1);
  return input.experiment ? `${capitalizada}. ${input.experiment}` : `${capitalizada}.`;
}
