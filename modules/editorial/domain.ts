export const PILLAR_KEYS = ['ugc_income', 'experiences', 'home'] as const;
export type EditorialPillarKey = (typeof PILLAR_KEYS)[number];

export const TOPIC_STATES = ['now', 'next', 'later', 'paused'] as const;
export type TopicState = (typeof TOPIC_STATES)[number];

export const EDITORIAL_OBJECTIVES = ['attract', 'retain', 'prove', 'convert'] as const;
export type EditorialObjective = (typeof EDITORIAL_OBJECTIVES)[number];

export const CONTENT_LENSES = ['who_i_am', 'how_i_think', 'what_i_do'] as const;
export type ContentLens = (typeof CONTENT_LENSES)[number];

export const PLATFORM_FORMATS = ['reel', 'carousel', 'photo_sequence'] as const;
export type PlatformFormat = (typeof PLATFORM_FORMATS)[number];

export const COMMERCIAL_MODALITIES = ['tech_ugc', 'canvas_ugc', 'non_commercial'] as const;
export type CommercialModality = (typeof COMMERCIAL_MODALITIES)[number];

export type TopicCandidate = {
  id: string;
  key: string;
  name: string;
  pillar: EditorialPillarKey;
  state: TopicState;
  focusWeight: number;
};

export type RecentPiece = {
  topicId: string | null;
  pillar: EditorialPillarKey;
  objective: EditorialObjective;
  lens: ContentLens;
};

export type WeekSeed = {
  topic: TopicCandidate;
  objective: EditorialObjective;
  deterministicReason: string;
};

const TARGET_OBJECTIVES: Record<Exclude<EditorialObjective, 'convert'>, number> = {
  attract: 2,
  retain: 2,
  prove: 2,
};

const PILLAR_LABEL: Record<EditorialPillarKey, string> = {
  ugc_income: 'Transformando UGC em fonte de renda',
  experiences: 'Experiências',
  home: 'Casa',
};

/** Seleciona matéria-prima para uma semana de 3 posts.
 *
 * O motor não escreve conteúdo. Ele só reduz as opções com regras que podem
 * ser reproduzidas sem IA. A IA entra depois para propor ângulo, formato e
 * explicação a partir destas três escolhas. */
export function selectWeekSeeds(
  topics: readonly TopicCandidate[],
  recent: readonly RecentPiece[],
): WeekSeed[] {
  const candidates = topics.filter((t) => t.state === 'now');
  if (candidates.length < 3) return [];

  const recentSix = recent.slice(0, 6);
  const pillarCount = countBy(recentSix, (p) => p.pillar);
  const topicCount = countBy(recentSix.filter((p) => p.topicId), (p) => p.topicId as string);
  const objectives = nextObjectives(recentSix);

  const scored = candidates
    .map((topic) => {
      const repeatedTopic = topicCount.get(topic.id) ?? 0;
      const repeatedPillar = pillarCount.get(topic.pillar) ?? 0;
      const score = 20 + topic.focusWeight * 3 - repeatedTopic * 16 - repeatedPillar * 3;
      return { topic, score, repeatedTopic, repeatedPillar };
    })
    .sort((a, b) => b.score - a.score || a.topic.name.localeCompare(b.topic.name, 'pt-BR'));

  const chosen: typeof scored = [];
  const usedTopics = new Set<string>();

  // Primeiro, tenta representar os três pilares. Isso protege o perfil pessoal
  // no cold start e evita que o foco comercial transforme tudo em UGC.
  for (const pillar of orderedPillars(pillarCount)) {
    const pick = scored.find((x) => x.topic.pillar === pillar && !usedTopics.has(x.topic.id));
    if (!pick) continue;
    chosen.push(pick);
    usedTopics.add(pick.topic.id);
    if (chosen.length === 3) break;
  }

  // Se algum pilar não tiver assunto AGORA, completa pela melhor alternativa,
  // com teto de dois conteúdos do mesmo pilar.
  for (const pick of scored) {
    if (chosen.length === 3) break;
    if (usedTopics.has(pick.topic.id)) continue;
    const same = chosen.filter((x) => x.topic.pillar === pick.topic.pillar).length;
    if (same >= 2) continue;
    chosen.push(pick);
    usedTopics.add(pick.topic.id);
  }

  // Hard rule de personalidade. Uma semana inteira de trabalho não passa.
  if (chosen.length === 3 && chosen.every((x) => x.topic.pillar === 'ugc_income')) return [];

  return chosen.slice(0, 3).map((pick, i) => ({
    topic: pick.topic,
    objective: objectives[i] ?? 'retain',
    deterministicReason: reasonFor(pick.topic, pick.repeatedTopic, pick.repeatedPillar),
  }));
}

function orderedPillars(counts: Map<EditorialPillarKey, number>): EditorialPillarKey[] {
  // UGC recebe um pequeno desempate porque é o foco profissional atual, mas
  // os pilares pouco usados ganham antes se o histórico mostrar desequilíbrio.
  const focusTiebreak: Record<EditorialPillarKey, number> = {
    ugc_income: 1,
    experiences: 0,
    home: 0,
  };
  return [...PILLAR_KEYS].sort(
    (a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || focusTiebreak[b] - focusTiebreak[a],
  );
}

function nextObjectives(recent: readonly RecentPiece[]): EditorialObjective[] {
  const counts = countBy(
    recent.filter((p) => p.objective !== 'convert'),
    (p) => p.objective as Exclude<EditorialObjective, 'convert'>,
  );

  const base = (Object.keys(TARGET_OBJECTIVES) as Array<Exclude<EditorialObjective, 'convert'>>)
    .map((objective) => ({
      objective,
      deficit: TARGET_OBJECTIVES[objective] - (counts.get(objective) ?? 0),
    }))
    .sort((a, b) => b.deficit - a.deficit || objectiveOrder(a.objective) - objectiveOrder(b.objective));

  // Na fase atual, conversão não ganha quota obrigatória. Se no futuro entrar
  // por uma recomendação comercial, será uma decisão explícita do motor.
  return base.slice(0, 3).map((x) => x.objective);
}

function objectiveOrder(objective: Exclude<EditorialObjective, 'convert'>) {
  return objective === 'attract' ? 0 : objective === 'retain' ? 1 : 2;
}

function reasonFor(topic: TopicCandidate, repeatedTopic: number, repeatedPillar: number) {
  if (repeatedTopic > 0) {
    return `O assunto «${topic.name}» apareceu recentemente; a proposta precisa trazer uma leitura realmente nova.`;
  }
  if (repeatedPillar === 0) {
    return `${PILLAR_LABEL[topic.pillar]} está ausente da janela recente e precisa voltar a aparecer sem forçar um calendário rígido.`;
  }
  if (topic.focusWeight >= 2) {
    return 'O assunto está alinhado ao foco profissional atual e ainda cabe no equilíbrio da marca pessoal.';
  }
  return 'O assunto está em AGORA e ajuda a manter o mapa editorial equilibrado.';
}

function countBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, number> {
  const map = new Map<K, number>();
  for (const item of items) {
    const k = key(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

const TEACHER_PATTERNS = [
  /se\s+voc[eê]\s+(?:é|e)\s+creator/iu,
  /voc[eê]\s+precisa\s+(?:fazer|parar|começar|entender)/iu,
  /(?:criadores?|creators?)\s+precisam/iu,
  /\b\d+\s+(?:erros?|dicas?|passos?)\s+(?:que|para)\s+(?:creator|ugc)/iu,
  /est[aá]\s+fazendo\s+(?:isso|ugc)\s+errado/iu,
];

export function teacherToneProblems(text: string): string[] {
  return TEACHER_PATTERNS.filter((p) => p.test(text)).map(
    () => 'A formulação coloca Carol no papel de professora de creators; reescreva como experiência pessoal.',
  );
}

export function forbiddenTopicProblems(text: string): string[] {
  const normalized = text.toLocaleLowerCase('pt-BR');
  const out: string[] = [];
  if (normalized.includes('como é morar em portugal') || normalized.includes('como e morar em portugal')) {
    out.push('Portugal é contexto pessoal, não pauta editorial prioritária.');
  }
  if (normalized.includes('ugc tradicional') && !normalized.includes('não')) {
    out.push('UGC tradicional está fora da prioridade atual.');
  }
  return out;
}
