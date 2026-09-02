/** A estratégia de conteúdo da Carol, como estrutura — não como parágrafo de
 *  prompt.
 *
 *  Fonte: `AUDITORIA-INSTAGRAM-carolxqueiroz.md`, 2 de Setembro de 2026. É a
 *  primeira vez que alguém olhou para o perfil real dela em vez de inferir o
 *  que uma «UGC creator» costuma ser, e o que se viu contradiz o que estava
 *  construído aqui.
 *
 *  Duas correções que este arquivo existe para gravar:
 *
 *  1. **Os pilares anteriores estavam errados.** Eram os de um creator
 *     genérico — autoridade em UGC, estratégia criativa, ensinar creators. A
 *     auditoria mostra que isso é «FORÇADO e errado para este perfil»: quinze
 *     posts, zero autoridade de ensino, e a audiência que esse conteúdo atrai
 *     (creators) é a que afasta as marcas de dermocosmética e de casa.
 *
 *  2. **O maior activo dela não estava em lado nenhum.** Dez anos de sala — do
 *     restaurante dos pais ao fine dining no Porto — é a credencial que
 *     nenhuma das outras dez mil criadoras de UGC em Portugal tem, e tinha zero
 *     vídeos. Está na bio e nunca virou conteúdo.
 *
 *  Regra que governa tudo o que vem daqui: **autoridade sim, professora não.**
 *  Mostrar competência, nunca afirmá-la.
 *
 *  Puro, e versionado de propósito: uma ideia salva tem de continuar a saber
 *  que estratégia a produziu. */

export const STRATEGY_VERSION = 'CAROL_CONTENT_STRATEGY_V1';

export const STRATEGY_SOURCE = {
  name: 'Auditoria estratégica — @carolxqueiroz',
  kind: 'social-audit',
  observedAt: '2026-09-02',
  /** Alta para identidade e conteúdo observado; nula para métricas. A auditoria
   *  diz explicitamente que o Instagram bloqueou o feed autenticado e que views
   *  e retenção **não foram verificadas**. Nada aqui pode virar fato numérico. */
  authority: 'high for creator identity and observed content, none for metrics',
} as const;

/* ── Pilares ──────────────────────────────────────────────────────────────── */

export const PILLARS = [
  'A_SALA',
  'TESTEI',
  'CASA_A_DOIS',
  'CORPO',
  'LARGUEI_O_TURNO',
] as const;

export type Pillar = (typeof PILLARS)[number];

export const isPillar = (v: string): v is Pillar => (PILLARS as readonly string[]).includes(v);

export const PILLAR_LABEL: Record<Pillar, string> = {
  A_SALA: 'A sala',
  TESTEI: 'Testei de verdade',
  CASA_A_DOIS: 'Casa a dois',
  CORPO: 'Corpo no lugar',
  LARGUEI_O_TURNO: 'Larguei o turno',
};

export type PillarSpec = {
  label: string;
  /** Peso alvo. Baseline da auditoria — aprende-se com o desempenho real, não
   *  fica gravado a ferro. */
  weight: number;
  what: string;
  objective: string;
  audience: string;
  format: string;
  commercial: string;
};

export const PILLAR_SPEC: Record<Pillar, PillarSpec> = {
  A_SALA: {
    label: 'A sala',
    weight: 0.3,
    what: 'Hospitalidade, pedidos, gente, serviço. Restaurante dos pais, fine dining no Porto, dez anos a ler mesas.',
    objective: 'Identidade inimitável. É a única coisa que nenhuma outra criadora de UGC em Portugal tem.',
    audience: 'Ex-restauração, donos de negócio local, brasileiras 22-30 no norte de Portugal.',
    format: 'Talking head 20-35s, concreto e com um caso.',
    commercial: 'SaaS de operações locais, restauração, hotelaria.',
  },
  TESTEI: {
    label: 'Testei de verdade',
    weight: 0.25,
    what: 'Um produto ou serviço posto à prova com ceticismo real, como cliente chata.',
    objective: 'O motor de UGC orgânico. Demonstra o ofício sem parecer um anúncio.',
    audience: 'Consumidoras e marcas ao mesmo tempo.',
    format: 'Storytime com prova no plano: tela, produto na mão, antes/depois.',
    commercial: 'Tudo o que ela já grava.',
  },
  CASA_A_DOIS: {
    label: 'Casa a dois',
    weight: 0.2,
    what: 'A casa virando casa, rituais, móveis, a vida no norte de Portugal com o namorado.',
    objective: 'Aspiração próxima, não catálogo.',
    audience: 'Casais montando casa.',
    format: 'Vlog curto COM VOZ. Montagem muda é o formato que mata.',
    commercial: 'Decoração, aroma, imobiliário.',
  },
  CORPO: {
    label: 'Corpo no lugar',
    weight: 0.15,
    what: 'Pele com rosácea, cabelo estragado, treino de quem está começando. Problemas reais, não rotina de beleza.',
    objective: 'Identificação física imediata.',
    audience: 'Mulheres 20-32.',
    format: 'Antes/depois, 20-30s, com a metáfora dela.',
    commercial: 'Dermocosmética, cabelo, apps de treino para iniciar.',
  },
  LARGUEI_O_TURNO: {
    label: 'Larguei o turno',
    weight: 0.1,
    what: 'A mudança da restauração para o digital: o corpo, o horário, o dinheiro, o silêncio.',
    objective: 'Arco longo. Lealdade, não alcance.',
    audience: 'Quem quer mudar de vida.',
    format: 'Mini-vlog falado, com uma tese na primeira frase.',
    commercial: 'Baixo no imediato, alto em lealdade.',
  },
};

/* ── Públicos ─────────────────────────────────────────────────────────────── */

export const AUDIENCES = ['identification', 'brand_buyer', 'creator'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_SPEC: Record<Audience, { label: string; priority: number; note: string }> = {
  identification: {
    label: 'Quem se identifica com ela',
    priority: 1,
    note: 'Brasileiras 22-30 no norte de Portugal: casa, mudança de carreira, pele, treino, namoro. É a audiência natural e a que o perfil ainda não serve.',
  },
  brand_buyer: {
    label: 'Quem compra UGC',
    priority: 2,
    note: 'Não precisa de seguir. Precisa de, ao visitar, entender presença, narrativa e bom senso comercial. Compra o arquivo, não o follow — e o lugar para isso é o site.',
  },
  creator: {
    label: 'Creators a começar',
    priority: 3,
    note: 'Pode crescer sozinho com o tempo. NÃO optimizar o perfil para eles agora: marcas de copo e de cabelo não querem essa audiência.',
  },
};

/** Quando um conteúdo agrada a creators e prejudica a percepção por marcas, a
 *  prioridade cai. Não é uma preferência: é a auditoria a mostrar que o
 *  Discover a encher-se de creators afasta o cliente que paga. */
export const AUDIENCE_PRIORITY: readonly Audience[] = ['identification', 'brand_buyer', 'creator'];

/* ── ADN ──────────────────────────────────────────────────────────────────── */

/** Os dez pontos, verbatim da auditoria. Vão para o prompt e para o teste. */
export const CONTENT_DNA: readonly string[] = [
  'Carol não ensina de cima. Ela testa e só admite quando funciona.',
  'Carol veio da sala. Se o vídeo podia ter sido feito por quem nunca serviu uma mesa, é fraco demais.',
  'Carol fala como amiga emburrada, não como especialista nem como vendedora.',
  'A casa e o namorado são cenário, não o produto. Ela é o produto.',
  'Problema visível no segundo 1: pele, cabelo, pedido, sala vazia.',
  'Prova no plano, não no slogan.',
  'O português dela — brasileiro misturado com português europeu — fica. Inglês de stock sai.',
  'O site é para marcas. O Instagram é para pessoas.',
  'UGC entra no feed só quando também é episódio da vida.',
  'Nunca mandar a audiência embora no CTA. O follow fica nela.',
];

export const POSITIONING = 'A menina da sala que agora grava. Lifestyle com ofício.';

/** A frase que a auditoria diz que devia orientar tudo. */
export const NORTH_STAR = 'Se eu não serviria isto a uma mesa, não ponho no Reels.';

/* ── O que parar ──────────────────────────────────────────────────────────── */

export const ANTI_PATTERNS: readonly string[] = [
  'Criativo de cliente que não é episódio da vida dela — listar features, montagem muda de casa.',
  'Inglês de stock na tela: Home, Rituals, Welcome To My, sem ironia.',
  'Conteúdo para creators: dicas de UGC, ferramentas, «como consegui X».',
  'Anúncios de 60 segundos com lapela à vista.',
  'Montagem muda como formato por omissão.',
  'Mandar a audiência para outro perfil no CTA.',
  'Tutorial ou aula: ela não é professora.',
];

export const PREFERRED_FORMATS: readonly string[] = [
  'talking head com história',
  'storytelling com prova',
  'reação e ceticismo',
  'antes/depois',
  'voice-over pessoal por cima de imagem',
  'mini-vlog falado com uma tese',
  'opinião',
];

export const WEAK_FORMATS: readonly string[] = [
  'montagem estética muda',
  'lista de funcionalidades',
  'tutorial',
  'trend com lip sync',
  'GRWM de maquilhagem',
];

/* ── Territórios e séries ─────────────────────────────────────────────────── */

export type SeriesCandidate = { name: string; premise: string; mechanism: string; pillar: Pillar };

/** Franquias, não ideias soltas. Cada uma dá dezenas de vídeos.
 *
 *  O Series Engine escolhe uma a três para testar — nunca todas ao mesmo
 *  tempo, que é como uma série deixa de ser série. */
export const SERIES_CANDIDATES: readonly SeriesCandidate[] = [
  {
    name: 'Testei sem facilitar',
    premise: 'Põe um produto ou serviço à prova como cliente chata, e só admite quando funciona.',
    mechanism: 'contexto → ceticismo → teste real → prova no plano → opinião',
    pillar: 'TESTEI',
  },
  {
    name: 'Coisas que 10 anos de sala ensinam',
    premise: 'Micro-histórias de atendimento que explicam gente, serviço e negócio.',
    mechanism: 'um caso concreto → o que ele ensina → onde isso se aplica hoje',
    pillar: 'A_SALA',
  },
  {
    name: 'A casa virando casa',
    premise: 'Cada cômodo nascendo, com voz — não catálogo.',
    mechanism: 'o que faltava → o que mudou → porque importa',
    pillar: 'CASA_A_DOIS',
  },
  {
    name: 'Larguei o turno',
    premise: 'O que muda no corpo, no horário e no silêncio quando se sai da restauração.',
    mechanism: 'antes do turno → agora → o que ainda dói',
    pillar: 'LARGUEI_O_TURNO',
  },
  {
    name: 'O brief pedia vs o que gravei',
    premise: 'Bastidores do trabalho de UGC como ofício, nunca como curso.',
    mechanism: 'o pedido → a decisão dela → o take que ficou',
    pillar: 'TESTEI',
  },
  {
    name: 'Meio PB, meio Porto',
    premise: 'Choques de língua, serviço, frio e saudade entre a Paraíba e o norte de Portugal.',
    mechanism: 'a diferença → o mal-entendido → o que ela aprendeu',
    pillar: 'LARGUEI_O_TURNO',
  },
  {
    name: 'Ele constrói, eu testo',
    premise: 'O namorado constrói, ela testa sem facilitar — e ela fica o centro, não o produto dele.',
    mechanism: 'ceticismo → teste à bruta → veredicto',
    pillar: 'TESTEI',
  },
  {
    name: 'Pele a arder, pele calma',
    premise: 'Diário de rosácea no clima português.',
    mechanism: 'o gatilho → o que fez → o estado hoje',
    pillar: 'CORPO',
  },
];

/** Onde procurar referências e tendências.
 *
 *  Não é «UGC creators». A auditoria é explícita: os mecanismos que servem a
 *  Carol vêm de hospitalidade, mudança de carreira, brasileiras em Portugal,
 *  casa e casal, pele real, treino de iniciante, storytelling e edição. */
export const RESEARCH_TERRITORIES: readonly string[] = [
  'creators de hospitalidade e restaurante contando histórias de atendimento',
  'mudança de carreira contada em vídeo curto',
  'brasileiras morando em Portugal',
  'casais montando casa, com voz e não montagem muda',
  'pele reativa e rosácea contada por quem tem',
  'treino para quem está começando, sem tom de atleta',
  'storytelling curto com conflito no primeiro segundo',
  'edição que serve a história: bruto para final, breakdown de timeline',
  'creators pequenos com mecanismo forte',
];

/** De onde vêm as referências e as tendências.
 *
 *  Brasileiras. A Carol é brasileira, escreve e fala em português do Brasil, e
 *  uma referência de um creator europeu ensina um ritmo e um humor que não são
 *  os dela — copiar o mecanismo de outra cultura é como o conteúdo sai
 *  correto e soa a tradução.
 *
 *  Isto vai literalmente para dentro das buscas: sem o dizer, o motor devolve
 *  o que há mais na web, que é conteúdo em inglês. */
export const RESEARCH_MARKET = {
  primary: 'Brasil',
  language: 'português do Brasil',
  instruction:
    'Procura SÓ criadores brasileiros, falando português do Brasil. Instagram e TikTok do Brasil. ' +
    'Não devolvas creators portugueses, europeus nem americanos: o ritmo, o humor e as expressões ' +
    'são outros, e ela não os consegue reproduzir sem soar a tradução. ' +
    'Brasileiras que vivem em Portugal contam como brasileiras.',
} as const;

/* ── Hipóteses do plano de 30 dias ────────────────────────────────────────── */

export type Hypothesis = {
  id: string;
  claim: string;
  test: string;
  metric: string;
  /** Nunca `true` sem dados. A auditoria não conseguiu medir nada disto. */
  status: 'untested';
};

export const HYPOTHESES: readonly Hypothesis[] = [
  { id: 'H1', claim: 'Talking head cético prende mais do que montagem muda.', test: '4 peças faladas contra 2 mudas.', metric: 'comentários e retenção a 3s', status: 'untested' },
  { id: 'H2', claim: 'Hospitalidade identifica mais do que falar de UGC.', test: '4 peças do pilar A sala.', metric: 'comentários que contam histórias de ofício', status: 'untested' },
  { id: 'H3', claim: 'CTA para o próprio perfil vale mais do que CTA para o namorado.', test: 'republicar a tese do Cenlo sem mencionar o outro perfil.', metric: 'seguidores ganhos', status: 'untested' },
  { id: 'H4', claim: 'Pele real alcança mais não-seguidores do que casa bonita.', test: '3 peças de rosácea.', metric: 'alcance de contas não seguidoras', status: 'untested' },
  { id: 'H5', claim: 'Mini-vlog com tese termina mais do que mini-vlog estético.', test: '3 vlogs de 20-30s com uma frase no segundo 1.', metric: 'conclusão contra abandono', status: 'untested' },
  { id: 'H6', claim: 'Inglês na tela piora a identificação em Portugal.', test: 'o mesmo ritual de casa, um em inglês e outro falado em português.', metric: 'comentários escritos contra emoji', status: 'untested' },
];

/* ── Como se mede o sucesso ───────────────────────────────────────────────── */

/** Não é views. Cada objetivo tem o seu sinal, e confundi-los é como um perfil
 *  optimiza para a métrica errada durante meses. */
export const SUCCESS_SIGNALS: Record<string, { label: string; signals: readonly string[] }> = {
  authority: { label: 'Autoridade', signals: ['saves', 'profileVisits', 'inboundLeads'] },
  community: { label: 'Comunidade', signals: ['comments', 'shares'] },
  discovery: { label: 'Descoberta', signals: ['nonFollowerReach', 'views'] },
  business: { label: 'Negócio', signals: ['inboundLeads', 'profileVisits'] },
};

/* ── A estratégia inteira, para salvar e para ler ────────────────────────── */

export type CreatorContentStrategy = {
  version: string;
  source: typeof STRATEGY_SOURCE;
  positioning: string;
  northStar: string;
  contentDNA: readonly string[];
  pillars: Record<Pillar, PillarSpec>;
  audiencePriority: readonly Audience[];
  antiPatterns: readonly string[];
  preferredFormats: readonly string[];
  weakFormats: readonly string[];
  seriesCandidates: readonly SeriesCandidate[];
  researchTerritories: readonly string[];
  hypotheses: readonly Hypothesis[];
};

export const STRATEGY: CreatorContentStrategy = {
  version: STRATEGY_VERSION,
  source: STRATEGY_SOURCE,
  positioning: POSITIONING,
  northStar: NORTH_STAR,
  contentDNA: CONTENT_DNA,
  pillars: PILLAR_SPEC,
  audiencePriority: AUDIENCE_PRIORITY,
  antiPatterns: ANTI_PATTERNS,
  preferredFormats: PREFERRED_FORMATS,
  weakFormats: WEAK_FORMATS,
  seriesCandidates: SERIES_CANDIDATES,
  researchTerritories: RESEARCH_TERRITORIES,
  hypotheses: HYPOTHESES,
};

/** A estratégia dita ao modelo. Uma vez, no prompt, em vez de espalhada por
 *  frases soltas que se desencontram na revisão seguinte. */
export function describeStrategy(): string {
  return [
    `POSICIONAMENTO: ${POSITIONING}`,
    `A frase que decide tudo: «${NORTH_STAR}»`,
    '',
    'ADN — não negociável:',
    ...CONTENT_DNA.map((d, i) => `${i + 1}. ${d}`),
    '',
    'PILARES, com o peso alvo:',
    ...PILLARS.map((p) => {
      const s = PILLAR_SPEC[p];
      return `- ${p} · ${s.label} (${Math.round(s.weight * 100)}%): ${s.what}\n  objetivo: ${s.objective}\n  Formato: ${s.format}`;
    }),
    '',
    'AUDIÊNCIA, por prioridade:',
    ...AUDIENCE_PRIORITY.map((a, i) => `${i + 1}. ${AUDIENCE_SPEC[a].label} — ${AUDIENCE_SPEC[a].note}`),
    '',
    'PARAR:',
    ...ANTI_PATTERNS.map((a) => `- ${a}`),
    '',
    `FORMATOS QUE RESULTAM: ${PREFERRED_FORMATS.join('; ')}.`,
    `FORMATOS FRACOS: ${WEAK_FORMATS.join('; ')}.`,
  ].join('\n');
}
