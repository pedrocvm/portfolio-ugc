/** Lentes: a porta de entrada para a memória dela.
 *
 *  Entre o pilar e a história real faltava um degrau. «Esta semana estamos
 *  trabalhando Atração, me conte uma situação real» é verdadeiro e é inútil:
 *  ela não sabe onde procurar. A pergunta certa não é «que história você quer
 *  contar?» — é «que tipo de situação da minha vida eu devo procurar?».
 *
 *  Uma lente NÃO é uma ideia, NÃO é uma história, e NÃO contém acontecimento
 *  nenhum. É uma direção de busca dentro da memória dela:
 *
 *    PILAR → LENTE → PERGUNTAS DE MEMÓRIA → O QUE ELA VIVEU → creator_story
 *
 *  A regra que separa isto de um gerador: as perguntas nunca afirmam que uma
 *  coisa aconteceu. «Quando uma marca recusou a tua proposta, o que sentiste?»
 *  pressupõe a recusa. «Alguma marca respondeu de um jeito diferente do que
 *  esperavas?» não pressupõe nada — e é por isso que a resposta «não, nada»
 *  é uma resposta legítima que troca de lente em vez de inventar.
 *
 *  Definição estável em código, versionada. O que é por-utilizador — uso,
 *  preferência, rejeição — vive na base. Guardar quarenta textos fixos numa
 *  tabela seria mover regra de produto para um sítio sem versão nem teste.
 *
 *  Puro. */

import { FUNCTIONAL_PILLARS, type FunctionalPillar } from './pillars';

export const LENS_LIBRARY_VERSION = 'CAROL_STORY_LENSES_V1';

/** O que a lente procura provocar. Serve ao ranking e à explicação. */
export const LENS_INTENTS = [
  'recognition',   // fazer alguém dizer «isso acontece comigo»
  'craft',         // mostrar decisão de produção
  'proof',         // provar que ela pensa e executa
  'closeness',     // aproximar da pessoa
] as const;
export type LensIntent = (typeof LENS_INTENTS)[number];

export type StoryLens = {
  id: string;
  pillar: FunctionalPillar;
  label: string;
  /** Uma frase que diz o que é esta direção, na linguagem dela. */
  description: string;
  /** O que ela deve procurar na memória. Categorias, nunca acontecimentos. */
  whatToLookFor: string;
  /** Gatilhos de memória. Nenhum afirma que alguma coisa aconteceu. */
  memoryPrompts: readonly string[];
  /** Depois de ela lembrar. Uma de cada vez, na conversa. */
  followUpPrompts: readonly string[];
  /** Formas abstratas. Nunca preenchidas com fatos fictícios dela. */
  abstractStructures: readonly string[];
  compatibleFormats: readonly string[];
  intent: LensIntent;
};

const FALANDO = ['talking_head', 'talking_broll'] as const;
const HUMOR = ['humor_pov', 'talking_head'] as const;
const CRAFT = ['talking_broll', 'bts', 'demo'] as const;
const VIDA = ['vlog', 'humor_pov', 'talking_head', 'aesthetic'] as const;

/* ── Atração ──────────────────────────────────────────────────────────────── */

const ATRACAO: StoryLens[] = [
  {
    id: 'first_time',
    pillar: 'attraction_journey',
    label: 'Primeira vez',
    description: 'Uma coisa que você fez pela primeira vez e ainda lembra de como foi.',
    whatToLookFor: 'estreias: primeira entrega, primeira recusa, primeira vez a fazer alguma coisa sozinha',
    memoryPrompts: [
      'Teve alguma coisa nas últimas semanas que você fez pela primeira vez?',
      'Alguma coisa que você sempre adiou e finalmente encarou?',
      'Alguma primeira vez que foi bem diferente do que você imaginava?',
    ],
    followUpPrompts: [
      'O que passou na sua cabeça antes de começar?',
      'O que te surpreendeu quando aconteceu de verdade?',
      'Você faria diferente na próxima?',
    ],
    abstractStructures: [
      'Nunca tinha feito X → fiz → foi assim',
      'Achava que ia ser de um jeito → foi de outro',
    ],
    compatibleFormats: [...FALANDO, 'vlog'],
    intent: 'recognition',
  },
  {
    id: 'failure',
    pillar: 'attraction_journey',
    label: 'Algo que deu errado',
    description: 'Uma coisa que não saiu como você queria. Não precisa ser grave.',
    whatToLookFor: 'gravações que não funcionaram, decisões que complicaram, planos que não deram certo',
    memoryPrompts: [
      'Teve alguma gravação que não saiu como você queria?',
      'Alguma coisa tomou muito mais tempo do que você esperava?',
      'Alguma decisão que depois você percebeu que complicou tudo?',
      'Alguma abordagem que você achava que ia funcionar e não funcionou?',
    ],
    followUpPrompts: [
      'Em que momento você percebeu que não estava dando certo?',
      'O que você fez depois disso?',
      'Se acontecesse de novo, o que mudava?',
    ],
    abstractStructures: [
      'Tentei X → deu errado → fiz Y',
      'Achei que o problema era X → era outra coisa',
    ],
    compatibleFormats: [...FALANDO, 'humor_pov'],
    intent: 'recognition',
  },
  {
    id: 'expectation_vs_reality',
    pillar: 'attraction_journey',
    label: 'Expectativa x realidade',
    description: 'Uma coisa que você achava que ia ser de um jeito e foi de outro.',
    whatToLookFor: 'previsões que não bateram, coisas mais fáceis ou mais difíceis do que pareciam',
    memoryPrompts: [
      'Teve alguma coisa que você achou que seria simples e deu muito mais trabalho?',
      'Alguma parte do trabalho que você temia e acabou sendo tranquila?',
      'Alguma coisa que te disseram que seria de um jeito e foi diferente?',
    ],
    followUpPrompts: [
      'O que você imaginava que ia acontecer?',
      'O que aconteceu de verdade?',
      'Qual foi a parte que acabou sendo mais difícil?',
    ],
    abstractStructures: [
      'Eu achava X → aconteceu Y → percebi Z',
      'Todo mundo diz que X é o difícil → para mim foi Y',
    ],
    compatibleFormats: [...FALANDO, 'humor_pov'],
    intent: 'recognition',
  },
  {
    id: 'small_win',
    pillar: 'attraction_journey',
    label: 'Pequena vitória',
    description: 'Uma coisa boa que aconteceu e que talvez você nem tenha contado a ninguém.',
    whatToLookFor: 'avanços pequenos, coisas que funcionaram, reconhecimento inesperado',
    memoryPrompts: [
      'Teve alguma coisa pequena que deu certo e te deixou contente?',
      'Alguém te disse alguma coisa que ficou com você?',
      'Alguma coisa que antes era difícil e agora você faz sem pensar?',
    ],
    followUpPrompts: [
      'Por que é que isso importou para você?',
      'Há quanto tempo você estava tentando?',
      'Quem mais notou?',
    ],
    abstractStructures: [
      'Isto era difícil → agora não é',
      'Aconteceu X → e para mim significou Y',
    ],
    compatibleFormats: [...FALANDO],
    intent: 'recognition',
  },
  {
    id: 'surprise',
    pillar: 'attraction_journey',
    label: 'Algo inesperado',
    description: 'Uma coisa que te pegou de surpresa, boa ou má.',
    whatToLookFor: 'reviravoltas, coisas que apareceram do nada, reações que você não previu',
    memoryPrompts: [
      'Teve alguma coisa nas últimas semanas que te pegou completamente de surpresa?',
      'Alguém reagiu de um jeito que você não esperava?',
      'Alguma coisa apareceu do nada e mudou o seu dia?',
    ],
    followUpPrompts: [
      'Qual foi a sua primeira reação?',
      'O que você estava esperando em vez disso?',
      'Mudou alguma coisa depois?',
    ],
    abstractStructures: ['Estava tudo normal → aconteceu X → e aí'],
    compatibleFormats: [...FALANDO, 'humor_pov'],
    intent: 'recognition',
  },
  {
    id: 'change',
    pillar: 'attraction_journey',
    label: 'Mudança',
    description: 'Uma coisa que mudou na sua cabeça ou na sua rotina.',
    whatToLookFor: 'opiniões que mudaram, hábitos novos, jeitos de trabalhar diferentes',
    memoryPrompts: [
      'Você mudou de ideia sobre alguma coisa ultimamente?',
      'Tem alguma coisa que você fazia e deixou de fazer?',
      'Alguma coisa na sua rotina que hoje é diferente de há uns meses?',
    ],
    followUpPrompts: [
      'O que te fez mudar?',
      'Como era antes?',
      'Alguém reparou?',
    ],
    abstractStructures: ['Antes eu fazia X → hoje faço Y', 'Eu achava X → hoje acho Y'],
    compatibleFormats: [...FALANDO, 'vlog'],
    intent: 'recognition',
  },
  {
    id: 'universal_identification',
    pillar: 'attraction_journey',
    label: 'Isso acontece com todo mundo',
    description: 'Uma coisa sua que outras pessoas também vivem, mesmo sem te conhecer.',
    whatToLookFor: 'situações comuns a quem trabalha, a quem mora fora, a quem está começando',
    memoryPrompts: [
      'Teve alguma coisa que aconteceu com você que você acha que acontece com muita gente?',
      'Alguma situação que você contou para alguém e a pessoa disse «comigo também»?',
      'Alguma manha sua que você acha que não é só sua?',
    ],
    followUpPrompts: [
      'Que parte disso você acha que outras pessoas também vivem?',
      'Como é que você lida com isso?',
    ],
    abstractStructures: ['Acontece X → e eu sei que não sou só eu'],
    compatibleFormats: [...FALANDO, 'humor_pov'],
    intent: 'recognition',
  },
  {
    id: 'funny_situation',
    pillar: 'attraction_journey',
    label: 'Situação engraçada',
    description: 'Uma coisa que aconteceu e te fez rir.',
    whatToLookFor: 'imprevistos, mal-entendidos, coisas absurdas do dia',
    memoryPrompts: [
      'Teve alguma coisa nas últimas semanas que te fez rir?',
      'Algum imprevisto no meio de uma gravação?',
      'Alguma conversa ou mal-entendido que rendeu?',
    ],
    followUpPrompts: [
      'Como é que você reagiu na hora?',
      'Quem estava junto?',
      'O que você disse depois?',
    ],
    abstractStructures: ['Estava a fazer X → aconteceu Y → reação'],
    compatibleFormats: [...HUMOR],
    intent: 'recognition',
  },
  {
    id: 'conflict',
    pillar: 'attraction_journey',
    label: 'Queria uma coisa e algo ficou no caminho',
    description: 'Você tentou fazer alguma coisa e apareceu um obstáculo.',
    whatToLookFor: 'atritos, coisas que atrapalharam, tensões pequenas',
    memoryPrompts: [
      'Teve alguma coisa que você queria fazer e não conseguiu por causa de outra?',
      'Alguma coisa te atrapalhou no meio de um trabalho?',
      'Você teve que escolher entre duas coisas e ficou incomodada?',
    ],
    followUpPrompts: [
      'O que estava no caminho?',
      'Como é que você resolveu?',
      'Ficou resolvido mesmo?',
    ],
    abstractStructures: ['Queria X → apareceu Y → tive que Z'],
    compatibleFormats: [...FALANDO, 'humor_pov'],
    intent: 'recognition',
  },
  {
    id: 'progress',
    pillar: 'attraction_journey',
    label: 'De onde eu estava para onde estou',
    description: 'Uma distância que você percorreu e talvez nem tenha reparado.',
    whatToLookFor: 'comparações com meses atrás, coisas que hoje são fáceis',
    memoryPrompts: [
      'Tem alguma coisa que hoje você faz sem pensar e há uns meses era difícil?',
      'Se você olhasse para você de seis meses atrás, o que diria?',
      'Alguma coisa no seu trabalho que melhorou e você só reparou depois?',
    ],
    followUpPrompts: [
      'Como era antes, em concreto?',
      'O que mudou no meio do caminho?',
    ],
    abstractStructures: ['Há X tempo era assim → hoje é assim'],
    compatibleFormats: [...FALANDO, 'vlog'],
    intent: 'recognition',
  },
  {
    id: 'frustration',
    pillar: 'attraction_journey',
    label: 'Algo que está te irritando',
    description: 'Uma coisa que cansa ou incomoda, mesmo que pequena.',
    whatToLookFor: 'chatices repetidas, partes do trabalho que ninguém gosta',
    memoryPrompts: [
      'Tem alguma parte do trabalho que te cansa mais do que devia?',
      'Alguma coisa que se repete e te irrita?',
      'Alguma coisa que você adia sempre?',
    ],
    followUpPrompts: [
      'O que exatamente incomoda nisso?',
      'Já tentou fazer diferente?',
    ],
    abstractStructures: ['Toda vez que X → acontece Y → e isso cansa'],
    compatibleFormats: [...FALANDO, 'humor_pov'],
    intent: 'recognition',
  },
];

/* ── Informação e craft ───────────────────────────────────────────────────── */

const CRAFT_LENSES: StoryLens[] = [
  {
    id: 'decision_behind_work',
    pillar: 'information_retention',
    label: 'Uma decisão que você tomou',
    description: 'Uma escolha concreta de produção e o motivo dela.',
    whatToLookFor: 'escolhas de luz, ângulo, cenário, ordem, duração',
    memoryPrompts: [
      'Teve alguma decisão de gravação que você tomou e que mudou o resultado?',
      'Você escolheu alguma coisa de propósito num take recente?',
      'Alguma coisa que você fez diferente do que costuma fazer?',
    ],
    followUpPrompts: [
      'Por que você escolheu esse caminho?',
      'O que aconteceria se tivesse feito do outro jeito?',
    ],
    abstractStructures: ['Tinha duas opções → escolhi X → porque Y'],
    compatibleFormats: [...CRAFT],
    intent: 'craft',
  },
  {
    id: 'problem_solution',
    pillar: 'information_retention',
    label: 'Não funcionava e você resolveu',
    description: 'Um problema concreto de produção que você teve de contornar.',
    whatToLookFor: 'luz ruim, som ruim, espaço pequeno, produto difícil de filmar',
    memoryPrompts: [
      'Teve alguma coisa que não estava funcionando numa gravação?',
      'Você precisou improvisar por causa de espaço, luz ou material?',
      'Alguma limitação te obrigou a fazer diferente?',
    ],
    followUpPrompts: [
      'Qual era o problema, em concreto?',
      'O que você tentou primeiro?',
      'O que acabou resolvendo?',
    ],
    abstractStructures: ['X não funcionava → tentei Y → resolvi com Z'],
    compatibleFormats: [...CRAFT],
    intent: 'craft',
  },
  {
    id: 'error_learning',
    pillar: 'information_retention',
    label: 'Um erro que mudou o seu jeito',
    description: 'Uma coisa que deu errado e passou a ser regra sua.',
    whatToLookFor: 'erros que viraram hábito de conferir, coisas que você já não faz',
    memoryPrompts: [
      'Teve algum erro que te fez mudar o jeito de trabalhar?',
      'Alguma coisa que você hoje confere sempre por causa de uma vez que deu errado?',
      'Algum trabalho que você refez do zero?',
    ],
    followUpPrompts: [
      'O que aconteceu exatamente?',
      'O que você faz diferente desde então?',
    ],
    abstractStructures: ['Aconteceu X → desde aí eu sempre faço Y'],
    compatibleFormats: [...CRAFT, 'talking_head'],
    intent: 'craft',
  },
  {
    id: 'test_and_result',
    pillar: 'information_retention',
    label: 'Uma coisa que você testou',
    description: 'Você experimentou alguma coisa para ver o que acontecia.',
    whatToLookFor: 'formatos novos, ferramentas novas, jeitos diferentes de gravar',
    memoryPrompts: [
      'Você testou alguma coisa nova nas últimas semanas?',
      'Alguma ferramenta ou app novo que você experimentou?',
      'Algum formato que você quis ver se funcionava?',
    ],
    followUpPrompts: [
      'O que você queria descobrir?',
      'O que aconteceu?',
      'Vale repetir?',
    ],
    abstractStructures: ['Queria saber se X → testei → o que vi foi Y'],
    compatibleFormats: [...CRAFT],
    intent: 'craft',
  },
  {
    id: 'invisible_process',
    pillar: 'information_retention',
    label: 'A parte que não aparece',
    description: 'O trabalho que existe e que ninguém vê no vídeo final.',
    whatToLookFor: 'preparação, repetições, arrumação, tempo entre takes',
    memoryPrompts: [
      'Quanto tempo levou uma coisa que no vídeo final parece rápida?',
      'Teve alguma preparação que ninguém imagina que existe?',
      'Quantas vezes você repetiu alguma coisa recentemente?',
    ],
    followUpPrompts: [
      'O que é que dá mais trabalho nessa parte?',
      'As pessoas costumam imaginar que é rápido?',
    ],
    abstractStructures: ['No vídeo parece X → na verdade foi Y'],
    compatibleFormats: [...CRAFT],
    intent: 'craft',
  },
  {
    id: 'reference_adaptation',
    pillar: 'information_retention',
    label: 'Peguei uma referência e transformei',
    description: 'Você viu alguma coisa e usou o mecanismo, não a cópia.',
    whatToLookFor: 'coisas que você viu e adaptou, ideias que puxaram outras',
    memoryPrompts: [
      'Você viu alguma coisa recentemente que te deu vontade de testar um jeito?',
      'Alguma referência que você adaptou em vez de copiar?',
      'Alguma coisa que funcionou para outra pessoa e você fez à sua maneira?',
    ],
    followUpPrompts: [
      'O que você aproveitou, exatamente?',
      'O que você mudou porque não era a sua cara?',
    ],
    abstractStructures: ['Vi X → o que serve é o mecanismo Y → apliquei em Z'],
    compatibleFormats: [...CRAFT],
    intent: 'craft',
  },
  {
    id: 'raw_to_final',
    pillar: 'information_retention',
    label: 'Do bruto ao resultado',
    description: 'O caminho entre o material cru e o vídeo que saiu.',
    whatToLookFor: 'material bruto que você ainda tem, antes e depois de edição',
    memoryPrompts: [
      'Você tem o material bruto de alguma coisa que ficou boa no fim?',
      'Alguma edição que mudou bastante o resultado?',
      'Algum take que sozinho não dizia nada e no conjunto funcionou?',
    ],
    followUpPrompts: [
      'O que o bruto tinha que o final não tem?',
      'Qual foi a decisão de edição que mais mudou?',
    ],
    abstractStructures: ['Bruto → o que fiz → resultado'],
    compatibleFormats: [...CRAFT],
    intent: 'craft',
  },
  {
    id: 'strategic_reasoning',
    pillar: 'information_retention',
    label: 'Por que você escolheu assim',
    description: 'O raciocínio por trás de um gancho, take, cenário ou linguagem.',
    whatToLookFor: 'escolhas que tinham alternativa, decisões pensadas',
    memoryPrompts: [
      'Teve alguma abertura que você mudou antes de gravar?',
      'Você escolheu um cenário ou uma linguagem de propósito?',
      'Alguma coisa que você decidiu por causa de quem ia ver?',
    ],
    followUpPrompts: [
      'Qual era a outra opção?',
      'O que te fez escolher essa?',
    ],
    abstractStructures: ['Podia abrir com X → escolhi Y → porque Z'],
    compatibleFormats: [...CRAFT, 'talking_head'],
    intent: 'craft',
  },
  {
    id: 'editing_choice',
    pillar: 'information_retention',
    label: 'Uma decisão de edição',
    description: 'Um corte, um ritmo, um texto na tela que mudou a peça.',
    whatToLookFor: 'cortes, ritmo, texto na tela, som',
    memoryPrompts: [
      'Teve algum corte que mudou o ritmo de um vídeo?',
      'Você tirou alguma coisa que gostava porque não cabia?',
      'Algum texto na tela que resolveu uma parte que a fala não resolvia?',
    ],
    followUpPrompts: [
      'Como estava antes dessa decisão?',
      'O que melhorou?',
    ],
    abstractStructures: ['Estava assim → cortei/mudei X → ficou assim'],
    compatibleFormats: [...CRAFT],
    intent: 'craft',
  },
  {
    id: 'recording_choice',
    pillar: 'information_retention',
    label: 'Uma decisão de gravação',
    description: 'Ângulo, luz, distância, ordem das tomadas.',
    whatToLookFor: 'escolhas de câmara e de espaço',
    memoryPrompts: [
      'Teve algum ângulo que você mudou e melhorou a tomada?',
      'Você gravou alguma coisa numa ordem diferente de propósito?',
      'Alguma escolha de luz que fez diferença?',
    ],
    followUpPrompts: [
      'O que não estava funcionando antes?',
      'Como é que você percebeu?',
    ],
    abstractStructures: ['Gravei de X → não funcionou → mudei para Y'],
    compatibleFormats: [...CRAFT],
    intent: 'craft',
  },
];

/* ── Prova e autoridade ───────────────────────────────────────────────────── */

const PROVA: StoryLens[] = [
  {
    id: 'brief_to_result',
    pillar: 'authority_conversion',
    label: 'Do briefing ao resultado',
    description: 'O que a marca pediu, o que você decidiu, o que saiu.',
    whatToLookFor: 'trabalhos com briefing, pedidos que precisaram de tradução',
    memoryPrompts: [
      'Teve algum briefing recente que precisou de interpretação?',
      'Alguma marca pediu uma coisa e você entendeu que precisava de outra?',
      'Algum pedido que era vago e você teve que decidir?',
    ],
    followUpPrompts: [
      'O que o briefing pedia, em concreto?',
      'Que decisão foi sua?',
      'A marca notou a diferença?',
    ],
    abstractStructures: ['Pediram X → decidi Y → entreguei Z'],
    compatibleFormats: [...CRAFT, 'talking_head'],
    intent: 'proof',
  },
  {
    id: 'product_problem',
    pillar: 'authority_conversion',
    label: 'O produto era difícil de mostrar',
    description: 'Uma dificuldade concreta de comunicar um produto.',
    whatToLookFor: 'produtos sem apelo visual, benefícios invisíveis, coisas difíceis de filmar',
    memoryPrompts: [
      'Teve algum produto difícil de mostrar em vídeo?',
      'Alguma coisa cujo benefício não se vê?',
      'Algum produto que não fica bonito na câmara?',
    ],
    followUpPrompts: [
      'Qual era a dificuldade exatamente?',
      'Como você resolveu?',
    ],
    abstractStructures: ['O produto tinha o problema X → resolvi mostrando Y'],
    compatibleFormats: [...CRAFT, 'demo'],
    intent: 'proof',
  },
  {
    id: 'research_before_recording',
    pillar: 'authority_conversion',
    label: 'O que você pesquisou antes',
    description: 'O trabalho que existe antes de ligar a câmara.',
    whatToLookFor: 'pesquisa de marca, leitura de comentários, estudo do público',
    memoryPrompts: [
      'O que você foi ver antes de gravar para alguma marca?',
      'Você leu comentários ou avaliações de algum produto?',
      'Alguma coisa que você descobriu pesquisando e mudou o vídeo?',
    ],
    followUpPrompts: [
      'O que você descobriu que não sabia?',
      'Isso mudou alguma coisa no que você gravou?',
    ],
    abstractStructures: ['Antes de gravar fui ver X → descobri Y → mudei Z'],
    compatibleFormats: [...CRAFT, 'talking_head'],
    intent: 'proof',
  },
  {
    id: 'creative_solution',
    pillar: 'authority_conversion',
    label: 'Como você resolveu criativamente',
    description: 'Uma necessidade que exigiu uma ideia, não só execução.',
    whatToLookFor: 'restrições que viraram solução, ideias que resolveram um pedido',
    memoryPrompts: [
      'Teve alguma necessidade que você resolveu com uma ideia e não com mais trabalho?',
      'Alguma restrição que acabou melhorando o resultado?',
      'Alguma coisa que você inventou no meio da produção?',
    ],
    followUpPrompts: [
      'Qual era a necessidade?',
      'Como é que a ideia apareceu?',
    ],
    abstractStructures: ['Precisava de X → não dava para Y → fiz Z'],
    compatibleFormats: [...CRAFT],
    intent: 'proof',
  },
  {
    id: 'visual_proof',
    pillar: 'authority_conversion',
    label: 'Como você provou visualmente',
    description: 'Uma promessa que a imagem confirmou em vez de o texto afirmar.',
    whatToLookFor: 'close-ups que provam, antes e depois, demonstrações',
    memoryPrompts: [
      'Teve alguma coisa que você mostrou em vez de dizer?',
      'Algum close-up que provou o que a fala afirmava?',
      'Algum antes e depois que dispensou explicação?',
    ],
    followUpPrompts: [
      'O que a imagem mostrava?',
      'Por que é que dizer não bastava?',
    ],
    abstractStructures: ['A promessa era X → em vez de dizer, mostrei Y'],
    compatibleFormats: ['demo', 'talking_broll', 'aesthetic'],
    intent: 'proof',
  },
  {
    id: 'professional_process',
    pillar: 'authority_conversion',
    label: 'O que uma marca devia saber do seu processo',
    description: 'Uma parte do seu método que reduz o risco de contratar você.',
    whatToLookFor: 'organização, prazos, revisões, entregas',
    memoryPrompts: [
      'Tem alguma parte do seu processo que as marcas não imaginam que existe?',
      'Alguma coisa que você faz sempre e que evita problema?',
      'Como é que você organiza uma entrega?',
    ],
    followUpPrompts: [
      'Por que você passou a fazer assim?',
      'Já evitou algum problema concreto?',
    ],
    abstractStructures: ['Antes de entregar eu sempre faço X → porque Y'],
    compatibleFormats: [...CRAFT, 'talking_head'],
    intent: 'proof',
  },
  {
    id: 'brand_feedback',
    pillar: 'authority_conversion',
    label: 'Algo específico que uma marca disse',
    description: 'Um retorno concreto que você recebeu.',
    whatToLookFor: 'comentários de marcas, pedidos de repetição, elogios específicos',
    memoryPrompts: [
      'Alguma marca disse alguma coisa específica sobre o teu trabalho?',
      'Algum retorno que te surpreendeu?',
      'Alguém pediu para repetir alguma coisa que você fez?',
    ],
    followUpPrompts: [
      'O que exatamente disseram?',
      'Você pode usar isso publicamente?',
    ],
    abstractStructures: ['Entreguei X → disseram Y'],
    compatibleFormats: ['talking_head', 'talking_broll'],
    intent: 'proof',
  },
  {
    id: 'product_in_real_life',
    pillar: 'authority_conversion',
    label: 'O produto entrou numa situação real',
    description: 'Um produto que apareceu naturalmente numa coisa que você já fazia.',
    whatToLookFor: 'produtos que você usa de verdade, momentos em que faziam falta',
    memoryPrompts: [
      'Teve algum produto de marca que entrou numa coisa que você já estava a fazer?',
      'Alguma coisa que você usou sem ser para gravar?',
      'Algum produto que resolveu um problema real seu?',
    ],
    followUpPrompts: [
      'Qual era a situação, antes do produto entrar?',
      'O que mudou de facto?',
    ],
    abstractStructures: ['Estava a fazer X → precisava de Y → usei Z'],
    compatibleFormats: ['vlog', 'demo', 'talking_broll'],
    intent: 'proof',
  },
  {
    id: 'before_after_creative',
    pillar: 'authority_conversion',
    label: 'Como o criativo evoluiu',
    description: 'A primeira versão e a que ficou.',
    whatToLookFor: 'primeiras versões guardadas, mudanças de conceito',
    memoryPrompts: [
      'Teve alguma peça que mudou muito da primeira versão para a final?',
      'Alguma ideia que você descartou no meio?',
      'Algum conceito que virou outro?',
    ],
    followUpPrompts: [
      'Como era a primeira versão?',
      'O que fez mudar?',
    ],
    abstractStructures: ['Primeira versão era X → virou Y → porque Z'],
    compatibleFormats: [...CRAFT],
    intent: 'proof',
  },
  {
    id: 'business_decision',
    pillar: 'authority_conversion',
    label: 'Uma decisão pensando no objetivo da marca',
    description: 'Uma escolha que você tomou pensando no que a marca precisava vender.',
    whatToLookFor: 'escolhas ligadas ao público da marca, não ao seu gosto',
    memoryPrompts: [
      'Teve alguma decisão que você tomou pensando em quem compra o produto?',
      'Alguma coisa que você faria diferente se fosse para o teu perfil?',
      'Algum caminho que você recusou porque não servia à marca?',
    ],
    followUpPrompts: [
      'Quem é que a marca queria alcançar?',
      'O que você mudou por causa disso?',
    ],
    abstractStructures: ['Para o meu perfil faria X → para a marca fiz Y → porque Z'],
    compatibleFormats: ['talking_head', 'talking_broll'],
    intent: 'proof',
  },
];

/* ── Conexão ──────────────────────────────────────────────────────────────── */

const CONEXAO: StoryLens[] = [
  {
    id: 'relationship',
    pillar: 'connection_personal',
    label: 'Uma situação com o namorado',
    description: 'Um momento de casal do dia a dia.',
    whatToLookFor: 'conversas, hábitos, discussões pequenas, coisas engraçadas',
    memoryPrompts: [
      'Teve alguma conversa em casa que rendeu?',
      'Alguma coisa que ele faz e que você acha engraçada ou irritante?',
      'Alguma combinação entre vocês que dá história?',
    ],
    followUpPrompts: [
      'O que você respondeu?',
      'Isso acontece com frequência?',
      'Tem alguma parte disso que você não quer contar?',
    ],
    abstractStructures: ['Ele fez X → eu reagi Y'],
    compatibleFormats: [...HUMOR],
    intent: 'closeness',
  },
  {
    id: 'pets',
    pillar: 'connection_personal',
    label: 'Uma situação com os animais',
    description: 'Alguma coisa que um dos bichos fez.',
    whatToLookFor: 'interrupções, manias, rotina com eles',
    memoryPrompts: [
      'Algum dos animais aprontou alguma nas últimas semanas?',
      'Alguma coisa que eles fazem sempre na hora errada?',
      'Alguma interrupção no meio de uma gravação?',
    ],
    followUpPrompts: [
      'O que você fez?',
      'Isso é comum ou foi uma vez?',
    ],
    abstractStructures: ['Estava a fazer X → apareceu Y → e aí'],
    compatibleFormats: [...HUMOR, 'vlog'],
    intent: 'closeness',
  },
  {
    id: 'training',
    pillar: 'connection_personal',
    label: 'Uma situação no treino',
    description: 'Alguma coisa do treino: dificuldade, progresso, rotina.',
    whatToLookFor: 'dias difíceis, avanços, comparação com o começo',
    memoryPrompts: [
      'Teve algum treino que foi mais difícil do que o normal?',
      'Alguma coisa que você hoje consegue e não conseguia?',
      'Algum dia em que você quase não foi e foi?',
    ],
    followUpPrompts: [
      'O que passou na tua cabeça?',
      'Como é que estava há uns meses?',
    ],
    abstractStructures: ['Antes era X → hoje é Y', 'Não queria ir → fui → foi assim'],
    compatibleFormats: [...VIDA],
    intent: 'closeness',
  },
  {
    id: 'brazil_portugal',
    pillar: 'connection_personal',
    label: 'Diferença entre Brasil e Portugal',
    description: 'Uma coisa concreta do dia a dia que é diferente.',
    whatToLookFor: 'palavras, hábitos, serviços, mal-entendidos',
    memoryPrompts: [
      'Teve alguma palavra ou expressão que gerou confusão?',
      'Alguma coisa do dia a dia que ainda te estranha?',
      'Alguma situação em que você percebeu que é de fora?',
    ],
    followUpPrompts: [
      'O que aconteceu exatamente?',
      'Como é que é no Brasil?',
    ],
    abstractStructures: ['Aqui é X → lá era Y → e eu percebi na hora Z'],
    compatibleFormats: [...HUMOR, 'talking_head'],
    intent: 'closeness',
  },
  {
    id: 'home',
    pillar: 'connection_personal',
    label: 'Casa e rotina',
    description: 'Alguma coisa da casa: arrumação, mudança, hábito.',
    whatToLookFor: 'cantos da casa, coisas novas, rotinas domésticas',
    memoryPrompts: [
      'Mudou alguma coisa na casa ultimamente?',
      'Tem algum canto que você arrumou e ficou contente?',
      'Alguma rotina de casa que mudou?',
    ],
    followUpPrompts: [
      'Como era antes?',
      'Por que você mudou?',
    ],
    abstractStructures: ['Era assim → mudei → agora é assim'],
    compatibleFormats: [...VIDA],
    intent: 'closeness',
  },
  {
    id: 'everyday_opinion',
    pillar: 'connection_personal',
    label: 'Uma opinião pequena',
    description: 'Uma coisa que você acha, sem ser sobre trabalho.',
    whatToLookFor: 'preferências, chatices, opiniões que você já disse em voz alta',
    memoryPrompts: [
      'Tem alguma coisa pequena que você acha e que quase ninguém concorda?',
      'Alguma coisa que te incomoda e você acha que não devia incomodar ninguém?',
      'Alguma preferência sua que as pessoas acham estranha?',
    ],
    followUpPrompts: [
      'De onde vem isso?',
      'Alguém já discordou de você sobre isso?',
    ],
    abstractStructures: ['Eu acho X → e sei que muita gente acha Y'],
    compatibleFormats: [...HUMOR, 'talking_head'],
    intent: 'closeness',
  },
  {
    id: 'normal_day_with_point',
    pillar: 'connection_personal',
    label: 'Um momento banal que deu o que pensar',
    description: 'Uma coisa comum que puxou um pensamento.',
    whatToLookFor: 'momentos parados, deslocações, esperas',
    memoryPrompts: [
      'Teve algum momento comum nas últimas semanas em que você parou para pensar numa coisa?',
      'Alguma coisa banal que te lembrou de outra?',
      'Algum dia normal que ficou na cabeça por algum motivo?',
    ],
    followUpPrompts: [
      'O que você pensou?',
      'O que estava a acontecer à volta?',
    ],
    abstractStructures: ['Estava a fazer X → e pensei Y'],
    compatibleFormats: [...VIDA],
    intent: 'closeness',
  },
  {
    id: 'personal_change',
    pillar: 'connection_personal',
    label: 'Uma mudança pessoal',
    description: 'Alguma coisa em você que mudou e você reparou.',
    whatToLookFor: 'hábitos, humor, energia, jeito de reagir',
    memoryPrompts: [
      'Tem alguma coisa em você que mudou nos últimos meses?',
      'Alguma coisa que antes te incomodava e hoje não?',
      'Algum hábito novo que pegou sem perceber?',
    ],
    followUpPrompts: [
      'Quando é que você reparou?',
      'O que mudou à volta disso?',
    ],
    abstractStructures: ['Antes eu era assim → hoje sou assim'],
    compatibleFormats: [...FALANDO, 'vlog'],
    intent: 'closeness',
  },
  {
    id: 'work_life',
    pillar: 'connection_personal',
    label: 'O trabalho entrando na vida',
    description: 'Como trabalhar assim mexe com o resto.',
    whatToLookFor: 'horários, fins de semana, casa que virou set',
    memoryPrompts: [
      'Teve alguma vez em que o trabalho entrou onde não devia?',
      'Alguma coisa da casa que mudou por causa do trabalho?',
      'Alguém da tua vida comentou alguma coisa sobre isso?',
    ],
    followUpPrompts: [
      'Como é que você lidou?',
      'Isso te incomoda ou já é normal?',
    ],
    abstractStructures: ['Trabalhar assim faz X → e isso significa Y'],
    compatibleFormats: [...VIDA],
    intent: 'closeness',
  },
  {
    id: 'relatable_moment',
    pillar: 'connection_personal',
    label: 'Um momento simples que muita gente vive',
    description: 'Uma coisa pequena em que outras pessoas se reconhecem.',
    whatToLookFor: 'manhãs, cansaço, adiamentos, pequenas alegrias',
    memoryPrompts: [
      'Teve algum momento simples nas últimas semanas que você acha que muita gente também vive?',
      'Alguma coisa que você faz e imagina que não é só você?',
      'Alguma pequena alegria do dia?',
    ],
    followUpPrompts: [
      'Como é que isso costuma acontecer?',
      'Que parte você acha que outras pessoas reconhecem?',
    ],
    abstractStructures: ['Acontece X → e eu sei que não sou só eu'],
    compatibleFormats: [...VIDA],
    intent: 'closeness',
  },
];

/* ── A biblioteca ─────────────────────────────────────────────────────────── */

export const LENS_LIBRARY: readonly StoryLens[] = [...ATRACAO, ...CRAFT_LENSES, ...PROVA, ...CONEXAO];

const BY_ID = new Map(LENS_LIBRARY.map((l) => [l.id, l]));

export const isLensId = (v: unknown): v is string => typeof v === 'string' && BY_ID.has(v);
export const lensById = (id: string): StoryLens | null => BY_ID.get(id) ?? null;
export const lensesForPillar = (pillar: FunctionalPillar): StoryLens[] =>
  LENS_LIBRARY.filter((l) => l.pillar === pillar);

/* ── Preferência ──────────────────────────────────────────────────────────── */

export const LENS_PREFERENCES = ['liked', 'not_for_carol', 'later', 'none'] as const;
export type LensPreference = (typeof LENS_PREFERENCES)[number];

export const PREFERENCE_LABEL: Record<LensPreference, string> = {
  liked: 'Gostei desse caminho',
  not_for_carol: 'Não combina comigo',
  later: 'Depois',
  none: '',
};

/* ── Ranking ──────────────────────────────────────────────────────────────── */

export type LensState = {
  lensId: string;
  timesShown: number;
  timesSelected: number;
  storiesFound: number;
  contentDerived: number;
  dismissedCount: number;
  preference: LensPreference;
  lastUsedAt: string | null;
};

export type RankInput = {
  pillar: FunctionalPillar;
  states: readonly LensState[];
  /** Lentes usadas nas últimas sessões, da mais recente para a mais antiga. */
  recentlyUsed?: readonly string[];
  /** Aprendizados VALIDADOS por lente. Só validado entra; um sinal não. */
  validatedLenses?: readonly string[];
  now?: Date;
};

export type RankedLens = {
  lens: StoryLens;
  score: number;
  /** Por que subiu ou desceu. Vai para o teste, não para a tela. */
  because: string[];
};

const DAY = 24 * 60 * 60 * 1000;

/** Quantos dias uma lente fica "fresca" depois de usada. Passado isso, deixa
 *  de ser penalizada — a vida dela repete-se e a lente também pode. */
export const ROTATION_DAYS = 21;

/** A ordem por que as direções aparecem.
 *
 *  Sem dados suficientes, é variedade e adequação ao pilar — não se finge
 *  inteligência estatística sobre uma amostra que não existe. Com dados,
 *  entram três sinais: o que ela disse que gosta, o que produziu histórias a
 *  sério, e o que já saiu há pouco tempo (que desce, para não passar semanas
 *  a perguntar sempre a mesma coisa).
 *
 *  Uma lente marcada «não combina comigo» sai. Não é apagada: continua no
 *  histórico e volta se ela mudar de ideia. */
export function rankLenses(input: RankInput): RankedLens[] {
  const now = input.now ?? new Date();
  const porId = new Map(input.states.map((s) => [s.lensId, s]));
  const recentes = input.recentlyUsed ?? [];
  const validadas = new Set(input.validatedLenses ?? []);

  const ranked = lensesForPillar(input.pillar)
    .filter((lens) => porId.get(lens.id)?.preference !== 'not_for_carol')
    .map((lens) => {
      const s = porId.get(lens.id);
      const because: string[] = [];
      // A base é a ordem canônica da biblioteca: quem escreveu pôs as mais
      // fáceis de responder primeiro. Um empate resolve-se por aí.
      let score = 100 - lensesForPillar(input.pillar).indexOf(lens);

      if (s?.preference === 'liked') {
        score += 40;
        because.push('ela disse que gosta deste caminho');
      }
      if (s?.preference === 'later') {
        score -= 15;
        because.push('ela adiou este caminho');
      }

      // Histórias a sério valem mais do que cliques: uma lente que ela abre e
      // fecha sem se lembrar de nada não é uma lente boa.
      if (s && s.storiesFound > 0) {
        score += Math.min(30, s.storiesFound * 10);
        because.push(`já encontrou ${s.storiesFound} ${s.storiesFound === 1 ? 'história' : 'histórias'}`);
      }
      if (s && s.dismissedCount >= 2 && s.storiesFound === 0) {
        score -= 25;
        because.push('mostrada várias vezes sem dar em nada');
      }

      // Rotação: desce o que saiu há pouco, e desce mais o que saiu há menos.
      if (s?.lastUsedAt) {
        const dias = (now.getTime() - new Date(s.lastUsedAt).getTime()) / DAY;
        if (dias < ROTATION_DAYS) {
          const penalidade = Math.round(35 * (1 - dias / ROTATION_DAYS));
          score -= penalidade;
          because.push(`usada há ${Math.max(0, Math.round(dias))} dias`);
        }
      }
      const posicao = recentes.indexOf(lens.id);
      if (posicao >= 0) {
        score -= 30 - posicao * 5;
        because.push('saiu numa das últimas sessões');
      }

      // Só o aprendizado VALIDADO pesa. Um sinal sugere; não decide.
      if (validadas.has(lens.id)) {
        score += 20;
        because.push('há aprendizado validado neste caminho');
      }

      return { lens, score, because };
    });

  return ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.lens.id.localeCompare(b.lens.id);
  });
}

/** Quantas direções a tela mostra antes de «outras formas de procurar».
 *
 *  Quatro no celular: dez opções ocupando três ecrãs é um catálogo, e um
 *  catálogo faz ela fechar em vez de escolher. */
export const VISIBLE_LENSES_MOBILE = 4;
export const VISIBLE_LENSES_DESKTOP = 6;

/* ── Perguntas que não pressupõem fato ────────────────────────────────────── */

/** Padrões que afirmam que uma coisa aconteceu.
 *
 *  «Quando uma marca recusou a tua proposta…» dá a recusa por adquirida e ela
 *  responde a partir de um fato que pode não existir. É o mesmo erro do
 *  gerador de ideias, disfarçado de pergunta. */
const PRESSUPOE: readonly { re: RegExp; why: string }[] = [
  { re: /\bquando\s+(você|voce|tu)\s+\w+(ou|aste|este|iu)\b/i, why: 'dá o acontecimento como certo' },
  { re: /\bquando\s+(uma|um|a|o)\s+\w+\s+\w+(ou|aram)\b/i, why: 'dá o acontecimento como certo' },
  { re: /\bdepois\s+(que|de)\s+(você|voce|tu)\s+\w+(ou|aste|este|iu)\b/i, why: 'dá o acontecimento como certo' },
  { re: /\bo que (você |voce |tu )?sentiu quando\b/i, why: 'dá o acontecimento e a emoção como certos' },
  { re: /\bcomo (você |voce )?(se sentiu|reagiu) (quando|ao)\b/i, why: 'dá o acontecimento como certo' },
  { re: /\bna vez que\b/i, why: 'dá o acontecimento como certo' },
  { re: /\bnaquela vez\b/i, why: 'dá um acontecimento específico como certo' },
  { re: /\bconta (sobre |d)?(a|o) vez que\b/i, why: 'dá o acontecimento como certo' },
];

export type PromptCheck = { ok: boolean; reason: string | null };

/** Uma pergunta de memória pode pressupor fato?
 *
 *  Não. Devolve o motivo em vez de um booleano porque quem chama tem de o
 *  poder dizer — a um teste, ou a quem escreveu a pergunta. */
export function checkMemoryPrompt(text: string): PromptCheck {
  for (const p of PRESSUPOE) {
    if (p.re.test(text)) return { ok: false, reason: p.why };
  }
  return { ok: true, reason: null };
}

/** Os exemplos abstratos não podem trazer fatos.
 *
 *  «Eu achava X → aconteceu Y» é uma forma. «Fiquei duas horas a mudar o
 *  cenário» é uma história dela e não pertence a uma definição em código. */
const NUMERO = String.raw`\d+|uma?|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|doze|quinze|vinte`;
const QUANTIDADE = new RegExp(String.raw`\b(${NUMERO})\s+(horas?|minutos?|dias?|semanas?|meses|vezes|takes?)\b`, 'i');

export function checkAbstractStructure(text: string): PromptCheck {
  // Uma quantidade concreta dentro de uma estrutura abstrata é sinal de que
  // alguém escreveu um exemplo real em vez de uma forma. Os números por
  // extenso contam: «duas horas» é tão fato como «2 horas».
  if (QUANTIDADE.test(text)) {
    return { ok: false, reason: 'tem uma quantidade concreta, e isso é um fato' };
  }
  return { ok: true, reason: null };
}

/* ── Como isto entra no fluxo ─────────────────────────────────────────────── */

export const LENS_ENTRY_MODES = ['pick_lens', 'already_know', 'no_memory'] as const;
export type LensEntryMode = (typeof LENS_ENTRY_MODES)[number];

/** O texto que abre a escolha, por pilar. Diz o que estamos a procurar antes
 *  de pedir seja o que for. */
export const PILLAR_SEARCH_INTRO: Record<FunctionalPillar, string> = {
  attraction_journey:
    'Vamos procurar uma situação real que alguém entenda mesmo sem conhecer o seu trabalho.',
  information_retention:
    'Vamos procurar uma decisão de produção que você tomou e que dê para mostrar.',
  authority_conversion:
    'Vamos procurar uma coisa do seu processo que faça uma marca perceber que você pensa antes de gravar.',
  connection_personal:
    'Vamos procurar um momento seu — do dia, da casa, do treino — que tenha alguma coisa a dizer.',
};

/** Quando ela não se lembra de nada. Não se inventa; troca-se de porta. */
export function nextLensAfterMiss(ranked: readonly RankedLens[], tried: readonly string[]): StoryLens | null {
  const jaTentadas = new Set(tried);
  return ranked.find((r) => !jaTentadas.has(r.lens.id))?.lens ?? null;
}

export const NO_MEMORY_LINE = 'Tudo bem. Vamos tentar por outro caminho.';
export const NO_LENS_FITS_LINE = 'Quer me contar diretamente o que aconteceu?';

/* ── Sanidade da biblioteca ───────────────────────────────────────────────── */

export type LibraryProblem = { lensId: string; field: string; reason: string };

/** Verifica a biblioteca inteira contra as regras que a governam.
 *
 *  Existe para o teste, e para quem acrescentar uma lente descobrir o problema
 *  antes de o commit sair. */
export function auditLibrary(): LibraryProblem[] {
  const problemas: LibraryProblem[] = [];
  const vistos = new Set<string>();

  for (const lens of LENS_LIBRARY) {
    if (vistos.has(lens.id)) problemas.push({ lensId: lens.id, field: 'id', reason: 'repetido' });
    vistos.add(lens.id);

    if (!FUNCTIONAL_PILLARS.includes(lens.pillar)) {
      problemas.push({ lensId: lens.id, field: 'pillar', reason: 'não é um pilar funcional' });
    }
    if (lens.memoryPrompts.length < 2) {
      problemas.push({ lensId: lens.id, field: 'memoryPrompts', reason: 'precisa de pelo menos duas' });
    }
    for (const p of lens.memoryPrompts) {
      const c = checkMemoryPrompt(p);
      if (!c.ok) problemas.push({ lensId: lens.id, field: 'memoryPrompts', reason: `«${p}» ${c.reason}` });
      if (!p.trim().endsWith('?')) {
        problemas.push({ lensId: lens.id, field: 'memoryPrompts', reason: `«${p}» não é uma pergunta` });
      }
    }
    for (const p of lens.followUpPrompts) {
      const c = checkMemoryPrompt(p);
      if (!c.ok) problemas.push({ lensId: lens.id, field: 'followUpPrompts', reason: `«${p}» ${c.reason}` });
    }
    for (const s of lens.abstractStructures) {
      const c = checkAbstractStructure(s);
      if (!c.ok) problemas.push({ lensId: lens.id, field: 'abstractStructures', reason: `«${s}» ${c.reason}` });
    }
    if (lens.compatibleFormats.length === 0) {
      problemas.push({ lensId: lens.id, field: 'compatibleFormats', reason: 'precisa de pelo menos um' });
    }
  }
  return problemas;
}
