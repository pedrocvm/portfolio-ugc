/** Qualidade de comunidade.
 *
 *  A Carol disse, com todas as letras, que o sinal que mais lhe importa é a
 *  comunidade interagir por identificação, curiosidade, vontade de tirar
 *  dúvidas e vontade de participar da conversa. Contar comentários não mede
 *  isso: quarenta «arrasou» e quatro «isso aconteceu comigo» dão quarenta e
 *  quatro, e são coisas diferentes.
 *
 *  Duas regras que este ficheiro existe para cumprir:
 *
 *  1. **A classificação é probabilística e agregada.** Nunca se afirma o que
 *     uma pessoa quis dizer. O que se lê é o conjunto.
 *  2. **Amostra pequena diz-se em voz alta.** Nove comentários não descrevem
 *     uma comunidade, e a frase tem de o admitir em vez de arredondar.
 *
 *  Puro. */

export const INTENTS = [
  'identification', 'curiosity', 'question', 'own_experience', 'conversation',
  'tag_share', 'generic_praise', 'purchase_intent',
  // Herdados do classificador que já existia. Continuam válidos e mapeiam
  // para o mesmo eixo: são interação com intenção, não elogio solto.
  'professional', 'creator_to_creator', 'brand', 'other',
] as const;
export type Intent = (typeof INTENTS)[number];

export const isIntent = (v: unknown): v is Intent =>
  typeof v === 'string' && (INTENTS as readonly string[]).includes(v);

export const INTENT_LABEL: Record<Intent, string> = {
  identification: 'Identificação',
  curiosity: 'Curiosidade',
  question: 'Pergunta',
  own_experience: 'História pessoal',
  conversation: 'Conversa',
  tag_share: 'Marcação',
  generic_praise: 'Elogio',
  purchase_intent: 'Interesse comercial',
  professional: 'Conversa sobre o trabalho',
  creator_to_creator: 'Outra creator',
  brand: 'Marca',
  other: 'Outro',
};

export const INTENT_MEANS: Record<Intent, string> = {
  identification: 'A pessoa se reconheceu na experiência.',
  curiosity: 'O conteúdo abriu um loop e ela quis a continuação.',
  question: 'Há interesse real ou necessidade de aprofundar.',
  own_experience: 'A pessoa respondeu contando a própria história.',
  conversation: 'Virou troca, não só reação.',
  tag_share: 'Achou relevante para outra pessoa.',
  generic_praise: 'Positivo, mas diz pouco sobre vínculo.',
  purchase_intent: 'Alguém demonstrou intenção comercial.',
  professional: 'Conversa sobre como você trabalha.',
  creator_to_creator: 'Outra creator falando com você.',
  brand: 'Uma marca apareceu nos comentários.',
  other: 'Não deu para classificar.',
};

/** Vínculo real, no sentido que ela descreveu. Elogio solto fica de fora de
 *  propósito: é positivo e é pouco informativo. */
export const BOND_INTENTS: readonly Intent[] = [
  'identification', 'curiosity', 'question', 'own_experience', 'conversation',
];

/** Sinal comercial. Alimenta o objetivo Provar e Converter. */
export const COMMERCIAL_INTENTS: readonly Intent[] = ['purchase_intent', 'brand', 'professional'];

export type CommentInput = {
  id: string;
  intent: Intent | null;
  confidence: 'low' | 'medium' | 'high' | null;
};

export type CommunityAggregate = {
  total: number;
  classified: number;
  unclassified: number;
  counts: Record<Intent, number>;
  bond: number;
  commercial: number;
  praiseOnly: number;
  /** Verdadeiro quando a amostra não sustenta leitura nenhuma. */
  tooSmall: boolean;
  reading: string;
};

/** Abaixo disto não se lê nada. Policy conservadora: com três posts por
 *  semana e uma conta em crescimento, dez comentários é um post normal. */
export const MIN_COMMENTS_FOR_READING = 10;

const emptyCounts = (): Record<Intent, number> =>
  Object.fromEntries(INTENTS.map((i) => [i, 0])) as Record<Intent, number>;

/** A leitura agregada de um conjunto de comentários.
 *
 *  Classificação de confiança baixa conta para o total mas não para a leitura:
 *  é isso que impede um «acho que isto é identificação» de virar sinal. */
export function aggregateIntents(
  comments: readonly CommentInput[],
  minSample = MIN_COMMENTS_FOR_READING,
): CommunityAggregate {
  const counts = emptyCounts();
  let classified = 0;

  for (const c of comments) {
    if (!c.intent || c.confidence === 'low') continue;
    counts[c.intent] += 1;
    classified += 1;
  }

  const total = comments.length;
  const bond = BOND_INTENTS.reduce((a, i) => a + counts[i], 0);
  const commercial = COMMERCIAL_INTENTS.reduce((a, i) => a + counts[i], 0);
  const tooSmall = total < minSample;

  return {
    total,
    classified,
    unclassified: total - classified,
    counts,
    bond,
    commercial,
    praiseOnly: counts.generic_praise,
    tooSmall,
    reading: reading({ total, classified, counts, bond, commercial, tooSmall }),
  };
}

function reading(a: {
  total: number;
  classified: number;
  counts: Record<Intent, number>;
  bond: number;
  commercial: number;
  tooSmall: boolean;
}): string {
  if (a.total === 0) return 'Ainda não há comentários para ler.';

  const top = (Object.entries(a.counts) as [Intent, number][])
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 2)
    .map(([i, n]) => `${n} de ${INTENT_LABEL[i].toLowerCase()}`);

  const corpo = top.length
    ? `${a.total} ${a.total === 1 ? 'comentário' : 'comentários'}, ${top.join(' e ')}.`
    : `${a.total} ${a.total === 1 ? 'comentário' : 'comentários'}, nenhum classificado com confiança.`;

  if (a.tooSmall) return `${corpo} Poucos para dizer que é padrão.`;
  if (a.classified === 0) return `${corpo} Sem leitura de intenção.`;

  if (a.bond > a.counts.generic_praise) {
    return `${corpo} A maior parte é vínculo, não elogio solto.`;
  }
  if (a.counts.generic_praise > a.bond * 2) {
    return `${corpo} É quase tudo elogio: bom de ver, pouco de aprender.`;
  }
  if (a.commercial > 0) {
    return `${corpo} Apareceu interesse comercial.`;
  }
  return corpo;
}

/** Compara duas leituras. Serve à Auditoria: «esse formato teve menos alcance
 *  mas gerou muito mais perguntas e histórias pessoais».
 *
 *  Devolve `null` quando qualquer um dos lados é pequeno demais — comparar
 *  duas amostras fracas produz uma conclusão forte e falsa. */
export function compareCommunity(
  a: CommunityAggregate,
  b: CommunityAggregate,
): { direction: 'better' | 'worse' | 'similar'; because: string } | null {
  if (a.tooSmall || b.tooSmall) return null;
  const ra = a.classified ? a.bond / a.classified : 0;
  const rb = b.classified ? b.bond / b.classified : 0;
  const delta = ra - rb;
  if (Math.abs(delta) < 0.15) {
    return { direction: 'similar', because: 'A proporção de vínculo ficou parecida.' };
  }
  return delta > 0
    ? { direction: 'better', because: 'Proporcionalmente, gerou mais identificação, perguntas e histórias.' }
    : { direction: 'worse', because: 'Proporcionalmente, gerou mais elogio e menos conversa.' };
}
