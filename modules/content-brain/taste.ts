/** Creator Taste Profile v1: calibração, não identidade fixa.
 *
 *  O que a Carol confirmou em 05/09/2026, guardado como estrutura versionada
 *  em vez de parágrafo de prompt. Serve para formular opções melhores — «mais
 *  pela reação ou mais pela progressão?» — nunca para dizer «faça como a
 *  Aloana».
 *
 *  Das referências guarda-se o **mecanismo**. Frase, série, personagem, piada
 *  e direção de arte são delas.
 *
 *  Puro. */

export const TASTE_VERSION = 'CAROL_CREATIVE_TASTE_V1';
export const SOT_VERSION = 'CAROL_CONTENT_SOT_3.0';

export type TasteStrength = 'confirmed' | 'observed' | 'hypothesis';

export type TasteDimension = {
  id: string;
  label: string;
  /** Como ela disse, em substância. Sem adjetivo que ela não usou. */
  preference: string;
  strength: TasteStrength;
  /** De onde veio. Uma preferência sem origem não se defende quando ela
   *  discorda. */
  evidence: string;
};

export const TASTE_DIMENSIONS: readonly TasteDimension[] = [
  { id: 'personality', label: 'Personalidade', preference: 'Prefere mostrar personalidade quando a história comporta.', strength: 'confirmed', evidence: 'Respostas diretas, 05/09/2026' },
  { id: 'humor', label: 'Humor', preference: 'Humor de reação, exagero e opinião. Situacional, não piada escrita.', strength: 'confirmed', evidence: 'Escolheu o humor da Aloana como o mais próximo dela' },
  { id: 'storytelling', label: 'Storytelling', preference: 'Gosta de processo, perguntas reais e histórias que continuam.', strength: 'confirmed', evidence: 'Respostas diretas, 05/09/2026' },
  { id: 'seriality', label: 'Serialidade', preference: 'Gosta de séries que contam uma história com continuação.', strength: 'confirmed', evidence: 'Citou as séries da Cecília: «isso prende as pessoas»' },
  { id: 'craft', label: 'Craft visual', preference: 'Valoriza ângulo, dinâmica, close-up e edição quando sustentam a mensagem.', strength: 'confirmed', evidence: 'Respostas diretas, 05/09/2026' },
  { id: 'aesthetic', label: 'Estético', preference: 'Gosta de produzir conteúdo estético e não quer abandoná-lo.', strength: 'confirmed', evidence: 'Citou o difusor entre os trabalhos de que mais gostou' },
  { id: 'broll_proof', label: 'B-roll como prova', preference: 'Close-up e B-roll são mais fortes quando provam o que está sendo dito.', strength: 'confirmed', evidence: 'O que chama a atenção dela na Tina' },
  { id: 'bts', label: 'Bastidores', preference: 'Quer testar os três: imperfeição, raciocínio e processo visual.', strength: 'hypothesis', evidence: 'Respondeu «todos»; ainda não é hábito consolidado' },
  { id: 'duration', label: 'Duração', preference: 'Prefere espaço para personalidade, aceita curto quando a função pede.', strength: 'confirmed', evidence: 'Respostas diretas, 05/09/2026' },
  { id: 'branded', label: 'Conteúdo de marca', preference: 'Considera naturais os três: produto na situação real, humor contextual e prova visual.', strength: 'confirmed', evidence: 'Respondeu «todos»' },
  { id: 'effort', label: 'Tempo por peça', preference: 'Aceita gastar cerca de duas horas ou mais numa peça neste estágio.', strength: 'confirmed', evidence: 'Respostas diretas, 05/09/2026' },
] as const;

/** O que ela aceita mostrar. Ausência de proibição não é autorização: qualquer
 *  área nova continua a ser decisão dela. */
export const ALLOWED_PERSONAL_AREAS: readonly string[] = [
  'rotina de treino',
  'momentos leves com o namorado',
  'os animais da casa',
  'bastidores de gravação',
  'processo de ideias',
  'como aborda marcas',
  'como pensa antes de oferecer serviço a uma marca',
  'jornada profissional, incluindo o que deu errado',
  'maquiagem',
  'vida em Portugal',
];

export const EXCLUDED_AREAS: readonly string[] = ['skincare', 'haircare'];

/* ── Referências ──────────────────────────────────────────────────────────── */

export const ADAPTATION = ['safe_to_adapt', 'adapt_carefully', 'too_creator_specific'] as const;
export type Adaptation = (typeof ADAPTATION)[number];

export const ADAPTATION_LABEL: Record<Adaptation, string> = {
  safe_to_adapt: 'Dá para usar',
  adapt_carefully: 'Usar com cuidado',
  too_creator_specific: 'Não copiar',
};

export type ReferenceMechanism = {
  handle: string;
  mechanism: string;
  transferable: string;
  adaptation: Adaptation;
};

/** Mecanismos, não conteúdo. Cada linha é uma técnica que se aplica a
 *  matéria-prima da Carol; nenhuma é uma ideia para ela gravar. */
export const REFERENCE_MECHANISMS: readonly ReferenceMechanism[] = [
  { handle: '@cecilhaverso', mechanism: 'Transformar burocracia e trabalho de creator em história.', transferable: 'Pegar uma tarefa chata real e contá-la com tensão.', adaptation: 'safe_to_adapt' },
  { handle: '@cecilhaverso', mechanism: 'Usar perguntas reais do processo como abertura.', transferable: 'A dúvida que ela mesma teve abre o vídeo.', adaptation: 'safe_to_adapt' },
  { handle: '@cecilhaverso', mechanism: 'Dinâmica de ângulos e corte a servir o ritmo.', transferable: 'Mudança de plano onde a fala muda de assunto.', adaptation: 'safe_to_adapt' },
  { handle: '@cecilhaverso', mechanism: 'Séries de sidequests com continuidade de carreira.', transferable: 'Acompanhar uma transição real por capítulos.', adaptation: 'adapt_carefully' },
  { handle: '@cecilhaverso', mechanism: 'Analogias próprias para traduzir assunto técnico.', transferable: 'A analogia tem de ser dela; a técnica é a transferível.', adaptation: 'too_creator_specific' },
  { handle: '@aloanaferreira', mechanism: 'Entrar numa situação reconhecível já a meio.', transferable: 'Abrir no conflito e explicar o contexto depois.', adaptation: 'safe_to_adapt' },
  { handle: '@aloanaferreira', mechanism: 'Opinião forte com reação e exagero expressivo.', transferable: 'A opinião tem de ser real; o exagero amplifica o que já existe.', adaptation: 'safe_to_adapt' },
  { handle: '@aloanaferreira', mechanism: 'Transformar situação pessoal em algo em que muita gente se reconhece.', transferable: 'A ponte é a identificação, não a exposição.', adaptation: 'safe_to_adapt' },
  { handle: '@aloanaferreira', mechanism: 'Universos recorrentes de relacionamento e sequências de N dias.', transferable: 'Restrição visível; o formato é adaptável, o universo dela não.', adaptation: 'adapt_carefully' },
  { handle: '@bytinamuller', mechanism: 'Jornada de quem está a começar, em episódios.', transferable: 'Progresso público com capítulos de aprendizado.', adaptation: 'safe_to_adapt' },
  { handle: '@bytinamuller', mechanism: 'Mostrar como grava produtos para marcas.', transferable: 'Processo de produção como prova para a marca.', adaptation: 'safe_to_adapt' },
  { handle: '@bytinamuller', mechanism: 'Close-up e B-roll a confirmar visualmente a afirmação.', transferable: 'A imagem prova a frase em vez de decorar.', adaptation: 'safe_to_adapt' },
  { handle: '@bytinamuller', mechanism: 'Dias numerados a partir do zero.', transferable: 'Só se existir contagem real; senão é cenário.', adaptation: 'adapt_carefully' },
];

export const DO_NOT_COPY: readonly string[] = [
  'catchphrases, nomes de série, personagens e piadas específicas',
  'histórias pessoais, relacionamento e biografia de terceiros',
  'direção de arte proprietária reproduzida literalmente',
  'vocabulário e memes que não fazem parte da linguagem natural dela',
  'formato repetido só porque performou na conta de outra pessoa',
];

/* ── Voz ──────────────────────────────────────────────────────────────────── */

/** Precedência da voz. O número é a ordem, e o que está em cima ganha sempre.
 *  A IA é o último recurso e só para estrutura. */
export const VOICE_PRECEDENCE: readonly { rank: number; source: string; use: string }[] = [
  { rank: 1, source: 'Fala real da Carol', use: 'áudio, transcrição, citação literal' },
  { rank: 2, source: 'Texto real aprovado por ela', use: 'legendas, mensagens, respostas que ela escreveu' },
  { rank: 3, source: 'Conteúdo publicado', use: 'como ela já falou em vídeo' },
  { rank: 4, source: 'Preferências declaradas', use: 'Creative Taste v1' },
  { rank: 5, source: 'Padrões observados', use: 'o que o desempenho mostrou no perfil dela' },
  { rank: 6, source: 'Mentoria', use: 'método e mecanismo, nunca fato' },
  { rank: 7, source: 'Referências', use: 'mecanismo, nunca conteúdo' },
  { rank: 8, source: 'IA', use: 'estrutura e organização; nunca acontecimento, reação ou opinião' },
];

/** Sinais de que o texto não é dela. Vai para o prompt e para o teste:
 *  a frase inventada «O brief pedia sorriso. Eu gravei emburrada.» é
 *  exatamente o tipo de coisa que isto existe para apanhar. */
export const ANTI_PERSONA: readonly string[] = [
  'frases espertinhas ou contrarian criadas só para soar autoral',
  'punchline que não nasceu da situação real',
  'jargão de marketing que ela não usaria numa conversa',
  'pose de guru, professora ou estrategista acima do público',
  'conclusão grandiosa a partir de um acontecimento banal',
  'drama fabricado para aumentar o que está em jogo',
  'falas que qualquer creator de UGC podia dizer sem mudar uma palavra',
  'roteiro que explica demais e deixa de parecer memória ou conversa',
];

export type VoiceCheck = { ok: boolean; flags: string[] };

const SUSPECT_PATTERNS: readonly { re: RegExp; flag: string }[] = [
  { re: /\b(hack|growth|funil de vendas|engajamento|call to action|cta matador)\b/i, flag: 'jargão de marketing' },
  { re: /\b(o segredo (que|para)|ninguém te conta|a verdade que)\b/i, flag: 'gancho de guru' },
  { re: /\b([3-9]|10)\s+(dicas|passos|erros|segredos)\b/i, flag: 'formato de aula' },
  { re: /\b(vai mudar (a )?(tua|sua) vida|nunca mais)\b/i, flag: 'promessa grandiosa' },
  { re: /\b(descobri o método|fórmula|blueprint)\b/i, flag: 'promessa não comprovável' },
];

/** Um texto proposto passa no filtro de voz?
 *
 *  Heurístico de propósito e conservador: só marca padrões que a Source of
 *  Truth nomeia explicitamente. O juiz final é ela — «isso não sou eu» ganha
 *  a qualquer heurística. */
export function checkVoice(text: string): VoiceCheck {
  const flags = SUSPECT_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.flag);
  return { ok: flags.length === 0, flags };
}

/** Uma citação atribuída à Carol tem de existir no material dela.
 *
 *  Normaliza acentos e pontuação porque a transcrição e o roteiro escrevem a
 *  mesma frase de maneiras diferentes. */
export function quoteIsGrounded(quote: string, sources: readonly string[]): boolean {
  const fold = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const q = fold(quote);
  if (q.length < 4) return false;
  return sources.some((s) => fold(s).includes(q));
}

export type TasteProfile = {
  version: string;
  sotVersion: string;
  dimensions: readonly TasteDimension[];
  allowedPersonalAreas: readonly string[];
  excludedTopics: readonly string[];
  referenceMechanisms: readonly ReferenceMechanism[];
  doNotCopy: readonly string[];
  voicePrecedence: readonly { rank: number; source: string; use: string }[];
  antiPersona: readonly string[];
};

export const TASTE_PROFILE_V1: TasteProfile = {
  version: TASTE_VERSION,
  sotVersion: SOT_VERSION,
  dimensions: TASTE_DIMENSIONS,
  allowedPersonalAreas: ALLOWED_PERSONAL_AREAS,
  excludedTopics: EXCLUDED_AREAS,
  referenceMechanisms: REFERENCE_MECHANISMS,
  doNotCopy: DO_NOT_COPY,
  voicePrecedence: VOICE_PRECEDENCE,
  antiPersona: ANTI_PERSONA,
};

/** O taste dito ao modelo, curto. Não vai a Source of Truth inteira para
 *  dentro de um prompt: vai o que calibra a pergunta seguinte. */
export function describeTaste(): string {
  return [
    'GOSTO CONFIRMADO DELA (calibração, não regra de identidade):',
    ...TASTE_DIMENSIONS.map((d) => `- ${d.label}: ${d.preference}`),
    '',
    `FORA: ${EXCLUDED_AREAS.join(', ')}. Maquiagem está dentro e não se confunde com skincare.`,
    '',
    'VOZ, por ordem de precedência:',
    ...VOICE_PRECEDENCE.map((v) => `${v.rank}. ${v.source} — ${v.use}`),
    '',
    'NÃO ESCREVER:',
    ...ANTI_PERSONA.map((a) => `- ${a}`),
  ].join('\n');
}
