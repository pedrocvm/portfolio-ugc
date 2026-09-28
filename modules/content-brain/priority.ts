/** O Motor de Prioridades.
 *
 *  A feature central, e a que mais facilmente se estraga: a tentação é gerar
 *  vinte ideias e deixar a Carol escolher. O trabalho é o contrário — reduzir
 *  a três propostas que merecem validação agora, e conseguir dizer porquê.
 *
 *  Duas regras de engenharia governam o ficheiro inteiro:
 *
 *  1. **Contar é do código.** Frequência, janela móvel, repetição, défice,
 *     datas e estados calculam-se aqui, de forma determinística. Duas corridas
 *     com os mesmos dados dão exactamente as mesmas três propostas.
 *  2. **«Por que agora» monta-se de evidências, não de prosa.** Cada proposta
 *     leva a lista de razões estruturadas que a escolheram. A frase é derivada
 *     delas; se a frase desaparecer, a razão continua lá.
 *
 *  Um modelo pode depois reescrever o ângulo com as palavras dela. Não pode
 *  escolher a proposta, nem inventar a razão.
 *
 *  Puro. */

import {
  DEFAULT_SETTINGS,
  FOCUS_TOPIC_AFFINITY,
  FORMAT_LABEL,
  LENS_LABEL,
  OBJECTIVES,
  OBJECTIVE_LABEL,
  PILLAR_SHORT,
  inferLens,
  isEligibleForWeek,
  lensBalance,
  objectiveBalance,
  pillarBalance,
  rollingWindow,
  strategySummary,
  teacherFraming,
  underrepresented,
  type FocusItem,
  type Format,
  type Lens,
  type Modality,
  type Objective,
  type Pillar,
  type SettingsShape,
  type Structure,
  type TopicState,
} from './editorial';

/* ── Entradas ─────────────────────────────────────────────────────────────── */

export type TopicInput = {
  id: string;
  slug: string;
  pillar: Pillar;
  label: string;
  howToTreat: string;
  state: TopicState;
  /** Última vez que uma peça deste assunto foi publicada. */
  lastUsedAt: string | null;
  useCount: number;
};

/** Uma peça já publicada. É daqui que sai todo o equilíbrio. */
export type PublishedPiece = {
  id: string;
  publishedAt: string;
  pillar: Pillar | null;
  objective: Objective | null;
  lens: Lens | null;
  topicSlug: string | null;
  format: Format | null;
  modality: Modality;
};

/** Matéria-prima real já registada: uma história confirmada, um candidato
 *  aberto vindo de um email de marca, um trabalho entregue. O motor prefere
 *  propor sobre o que aconteceu de verdade. */
export type RealEvent = {
  id: string;
  kind: 'story' | 'candidate' | 'brand_work' | 'experience';
  /** O fato, em uma linha. Nunca escrito pelo motor: vem de quem o registou. */
  fact: string;
  occurredAt: string;
  topicSlug: string | null;
  pillar: Pillar | null;
  /** Já confirmado pela Carol. Só isto pode virar roteiro depois. */
  confirmed: boolean;
};

export type ActiveLearning = {
  id: string;
  statement: string;
  /** Só o validado pesa; sinal e hipótese sugerem. */
  influence: 'weight' | 'suggest';
  /** A que dimensão se aplica, quando se sabe. */
  format: Format | null;
  objective: Objective | null;
  lens: Lens | null;
};

export type FormatGap = {
  format: Format;
  state: 'untested' | 'testing' | 'early_signal' | 'consistent_pattern' | 'conditional' | 'no_advantage';
};

export type ReferenceHypothesis = {
  id: string;
  /** A estrutura observada, não o assunto da creator. */
  structure: string;
  format: Format | null;
  question: string;
};

export type PriorityInput = {
  weekStart: string;
  now: string;
  focus: readonly FocusItem[];
  topics: readonly TopicInput[];
  published: readonly PublishedPiece[];
  events: readonly RealEvent[];
  learnings: readonly ActiveLearning[];
  formatGaps: readonly FormatGap[];
  references: readonly ReferenceHypothesis[];
  /** Testes já a correr. Com três posts por semana, normalmente um chega. */
  runningExperiments: number;
  settings?: SettingsShape;
};

/* ── Saída ────────────────────────────────────────────────────────────────── */

export const EVIDENCE_KINDS = [
  'pillar_absent', 'objective_under', 'lens_absent', 'topic_in_focus',
  'topic_rotation', 'recent_event', 'learning', 'format_untested',
  'reference_hypothesis', 'commercial_value', 'avoid_repetition',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export type Evidence = {
  kind: EvidenceKind;
  /** A razão em português, já com os números dentro. Vai para a tela. */
  detail: string;
  /** O id da coisa que sustenta a razão, quando existe uma. */
  refId?: string;
};

export type ProposalDraft = {
  position: number;
  topicId: string;
  topicSlug: string;
  topicLabel: string;
  pillar: Pillar;
  angle: string;
  /** De onde nasceu o ângulo. `event` é o melhor caso: aconteceu. */
  angleSource: 'event' | 'topic' | 'reference';
  lens: Lens;
  objective: Objective;
  format: Format;
  structure: Structure | null;
  modality: Modality;
  whyNow: string;
  evidence: Evidence[];
  /** Só uma peça por semana carrega hipótese experimental explícita. */
  experimental: null | { question: string; variable: string; referenceId?: string };
  reelTest: null | { recommended: true; because: string };
  storyId: string | null;
};

export type WeekProposal = {
  weekStart: string;
  capacity: number;
  summary: string;
  proposals: ProposalDraft[];
  /** O que o motor não conseguiu cobrir, dito por palavras. Nunca silêncio. */
  notes: string[];
  engineVersion: string;
};

export const PRIORITY_ENGINE_VERSION = 'CAROL_PRIORITY_V1';

/* ── Pesos ────────────────────────────────────────────────────────────────── */

/** Policy, não ciência. Estão juntos para se afinarem sem tocar na lógica, e
 *  são inteiros para a ordenação ser reproduzível sem depender de vírgula
 *  flutuante. */
export const PRIORITY_WEIGHTS = {
  pillarDeficit: 30,
  objectiveDeficit: 25,
  lensDeficit: 20,
  realEvent: 40,
  confirmedEvent: 15,
  inFocus: 12,
  neverUsed: 10,
  staleTopic: 8,
  learningWeight: 18,
  learningSuggest: 6,
  commercial: 10,
  repetitionPenalty: -45,
  recentTopicPenalty: -25,
} as const;

/** Dias abaixo dos quais repetir o mesmo assunto é repetição. */
export const TOPIC_COOLDOWN_DAYS = 21;

const DAY = 24 * 60 * 60 * 1000;

const daysBetween = (a: string, b: string) =>
  Math.floor((new Date(a).getTime() - new Date(b).getTime()) / DAY);

/* ── Esforço ──────────────────────────────────────────────────────────────── */

export const FORMAT_EFFORT: Record<Format, 'low' | 'medium' | 'high'> = {
  reel: 'medium',
  carousel: 'medium',
  photo_sequence: 'low',
  story: 'low',
};

/** Sair de casa é o custo que mais adia uma gravação. Fica explícito para o
 *  Modo Sessão poder agrupar, e para a semana não pedir três saídas. */
export const pillarNeedsOuting = (pillar: Pillar) => pillar === 'experiences';

/* ── Formato ──────────────────────────────────────────────────────────────── */

/** Que formato serve este objetivo, por ordem de adequação.
 *
 *  Reel não está primeiro em tudo de propósito: o diagnóstico de 90 dias mediu
 *  11 publicações, todas Reels, e isso é baseline de uso — não comparação. */
const FORMAT_FIT: Record<Objective, readonly Format[]> = {
  attract: ['reel', 'photo_sequence', 'carousel', 'story'],
  retain: ['story', 'reel', 'carousel', 'photo_sequence'],
  prove: ['carousel', 'reel', 'photo_sequence', 'story'],
  convert: ['carousel', 'reel', 'story', 'photo_sequence'],
};

const STRUCTURE_FIT: Partial<Record<Pillar, Structure>> = {
  experiences: 'pov',
  ugc_income: 'talking_head',
};

/* ── Motor ────────────────────────────────────────────────────────────────── */

type Candidate = {
  topic: TopicInput;
  objective: Objective;
  score: number;
  evidence: Evidence[];
  event: RealEvent | null;
};

/** Monta a semana.
 *
 *  Não devolve mais do que a capacidade, e devolve menos quando não há razão
 *  honesta para mais. Uma semana com duas propostas é melhor do que três com
 *  uma inventada. */
export function buildWeek(input: PriorityInput): WeekProposal {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const capacity = Math.max(1, Math.min(settings.weeklyCapacity, 7));
  const notes: string[] = [];

  const recent = rollingWindow(
    [...input.published].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    settings.balanceWindow,
  );

  const pillarGap = underrepresented(pillarBalance(recent.map((p) => p.pillar), settings.balanceWindow));
  const objectiveGap = underrepresented(objectiveBalance(recent.map((p) => p.objective), settings.objectiveTarget));
  const lensGap = underrepresented(lensBalance(recent.map((p) => p.lens), settings.balanceWindow));

  const eligible = input.topics.filter((t) => isEligibleForWeek(t.state));
  if (eligible.length === 0) {
    return {
      weekStart: input.weekStart,
      capacity,
      summary: 'Nenhum assunto está em «Agora». O Mapa decide o que pode entrar na semana.',
      proposals: [],
      notes: ['Todos os assuntos estão em Próximos, Depois ou Pausado.'],
      engineVersion: PRIORITY_ENGINE_VERSION,
    };
  }

  const focusTopics = new Set(input.focus.flatMap((f) => FOCUS_TOPIC_AFFINITY[f] ?? []));
  const eventsByTopic = new Map<string, RealEvent[]>();
  for (const e of input.events) {
    if (!e.topicSlug) continue;
    const list = eventsByTopic.get(e.topicSlug) ?? [];
    list.push(e);
    eventsByTopic.set(e.topicSlug, list);
  }

  const candidates: Candidate[] = [];
  for (const topic of eligible) {
    for (const objective of OBJECTIVES) {
      const c = scoreCandidate({
        topic, objective, input, settings, focusTopics,
        pillarGap, objectiveGap, lensGap, eventsByTopic,
      });
      if (c) candidates.push(c);
    }
  }

  candidates.sort((a, b) =>
    b.score - a.score
    || a.topic.slug.localeCompare(b.topic.slug)
    || OBJECTIVES.indexOf(a.objective) - OBJECTIVES.indexOf(b.objective));

  const chosen = select(candidates, capacity);

  // Uma peça, no máximo, carrega a hipótese experimental. Só quando existe
  // pergunta real: um formato por testar, ou uma referência salva.
  const experimentSlot = pickExperiment(input, settings, chosen);

  const proposals = chosen.map((c, i) =>
    toDraft(c, i, input, experimentSlot?.index === i ? experimentSlot : null));

  if (proposals.length < capacity) {
    notes.push(
      `Consegui ${proposals.length} de ${capacity}. Sem razão nova para a terceira, propor por propor só aumenta a lista.`,
    );
  }

  return {
    weekStart: input.weekStart,
    capacity,
    summary: strategySummary({
      objectives: proposals.map((p) => p.objective),
      experiment: proposals.some((p) => p.experimental)
        ? 'Também temos um teste de formato nesta semana.'
        : null,
    }),
    proposals,
    notes,
    engineVersion: PRIORITY_ENGINE_VERSION,
  };
}

function scoreCandidate(ctx: {
  topic: TopicInput;
  objective: Objective;
  input: PriorityInput;
  settings: SettingsShape;
  focusTopics: ReadonlySet<string>;
  pillarGap: readonly { key: Pillar; deficit: number }[];
  objectiveGap: readonly { key: Objective; deficit: number }[];
  lensGap: readonly { key: Lens; deficit: number }[];
  eventsByTopic: ReadonlyMap<string, RealEvent[]>;
}): Candidate | null {
  const { topic, objective, input } = ctx;
  const evidence: Evidence[] = [];
  let score = 0;

  const pGap = ctx.pillarGap.find((g) => g.key === topic.pillar);
  if (pGap) {
    score += PRIORITY_WEIGHTS.pillarDeficit * pGap.deficit;
    evidence.push({
      kind: 'pillar_absent',
      detail: `${PILLAR_SHORT[topic.pillar]} apareceu pouco nas últimas ${ctx.settings.balanceWindow} publicações.`,
    });
  }

  const oGap = ctx.objectiveGap.find((g) => g.key === objective);
  if (oGap) {
    score += PRIORITY_WEIGHTS.objectiveDeficit * oGap.deficit;
    evidence.push({
      kind: 'objective_under',
      detail: `Faltou ${OBJECTIVE_LABEL[objective].toLowerCase()} nas últimas publicações.`,
    });
  } else if (objective === 'convert') {
    // Converter não tem slot semanal obrigatório. Sem défice declarado, não
    // disputa — um perfil cheio de conversão fica comercial demais.
    return null;
  }

  const eventos = (ctx.eventsByTopic.get(topic.slug) ?? [])
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const event = eventos[0] ?? null;
  if (event) {
    score += PRIORITY_WEIGHTS.realEvent;
    if (event.confirmed) score += PRIORITY_WEIGHTS.confirmedEvent;
    evidence.push({
      kind: 'recent_event',
      detail: `Aconteceu: ${event.fact}`,
      refId: event.id,
    });
  }

  if (ctx.focusTopics.has(topic.slug)) {
    score += PRIORITY_WEIGHTS.inFocus;
    evidence.push({ kind: 'topic_in_focus', detail: 'O assunto está no seu foco atual.' });
  }

  if (!topic.lastUsedAt) {
    score += PRIORITY_WEIGHTS.neverUsed;
    evidence.push({ kind: 'topic_rotation', detail: 'Você ainda não falou disso.' });
  } else {
    const dias = daysBetween(input.now, topic.lastUsedAt);
    if (dias < TOPIC_COOLDOWN_DAYS) {
      score += PRIORITY_WEIGHTS.recentTopicPenalty;
      evidence.push({
        kind: 'avoid_repetition',
        detail: `Você falou disso há ${dias} ${dias === 1 ? 'dia' : 'dias'}.`,
      });
    } else {
      score += PRIORITY_WEIGHTS.staleTopic;
      evidence.push({
        kind: 'topic_rotation',
        detail: `Faz ${dias} dias desde a última vez.`,
      });
    }
  }

  for (const l of input.learnings) {
    if (l.objective && l.objective !== objective) continue;
    if (!l.objective && !l.lens && !l.format) continue;
    score += l.influence === 'weight' ? PRIORITY_WEIGHTS.learningWeight : PRIORITY_WEIGHTS.learningSuggest;
    evidence.push({ kind: 'learning', detail: l.statement, refId: l.id });
  }

  // Valor comercial: provar competência sobre software é o que faz uma marca
  // de SaaS olhar. Não cria um pilar; empurra o objetivo Provar dentro do
  // território que já existe.
  if (objective === 'prove' && (topic.slug === 'tech_ugc' || topic.slug === 'brand_experiences')) {
    score += PRIORITY_WEIGHTS.commercial;
    evidence.push({
      kind: 'commercial_value',
      detail: 'Serve ao foco comercial: SaaS e apps para negócios locais.',
    });
  }

  const lens = inferLens({ pillar: topic.pillar, angle: `${topic.label} ${topic.howToTreat}`, topicSlug: topic.slug });
  const lGap = lens ? ctx.lensGap.find((g) => g.key === lens.lens) : undefined;
  if (lGap) {
    score += PRIORITY_WEIGHTS.lensDeficit * lGap.deficit;
    evidence.push({
      kind: 'lens_absent',
      detail: `«${LENS_LABEL[lGap.key]}» sumiu das últimas publicações.`,
    });
  }

  if (evidence.length === 0) return null;
  return { topic, objective, score, evidence, event };
}

/** Escolhe as propostas respeitando os guardrails que o PDF nomeia.
 *
 *  Três passagens, e a ordem é a feature. Na primeira, um assunto, um pilar e
 *  um objetivo cada — é assim que sai «1 para atrair, 1 para reter, 1 para
 *  provar» sem que ninguém escreva essa fórmula em lado nenhum. As passagens
 *  seguintes só relaxam o que não foi possível cumprir, e nessa ordem: repetir
 *  território dói menos do que repetir função.
 *
 *  O limite que nunca relaxa é o do trabalho: no máximo dois terços da semana
 *  vêm do pilar de UGC. O perfil precisa continuar pessoal. */
function select(candidates: readonly Candidate[], capacity: number): Candidate[] {
  const chosen: Candidate[] = [];
  const topics = new Set<string>();
  const byObjective = new Map<Objective, number>();
  const byPillar = new Map<Pillar, number>();
  const maxWork = Math.max(1, Math.ceil((capacity * 2) / 3));

  const pass = (objectiveCap: number, pillarCap: number) => {
    for (const c of candidates) {
      if (chosen.length >= capacity) return;
      if (topics.has(c.topic.slug)) continue;
      if (c.topic.pillar === 'ugc_income'
          && chosen.filter((x) => x.topic.pillar === 'ugc_income').length >= maxWork) continue;
      if ((byObjective.get(c.objective) ?? 0) >= objectiveCap) continue;
      if ((byPillar.get(c.topic.pillar) ?? 0) >= pillarCap) continue;

      chosen.push(c);
      topics.add(c.topic.slug);
      byObjective.set(c.objective, (byObjective.get(c.objective) ?? 0) + 1);
      byPillar.set(c.topic.pillar, (byPillar.get(c.topic.pillar) ?? 0) + 1);
    }
  };

  pass(1, 1);
  if (chosen.length < capacity) pass(1, capacity);
  if (chosen.length < capacity) pass(capacity, capacity);

  return chosen;
}

/** Só existe experimento quando existe pergunta. Um formato nunca testado é
 *  uma pergunta; uma referência salva é uma pergunta. «Ainda não testámos» não
 *  é razão para testar três coisas na mesma semana. */
function pickExperiment(
  input: PriorityInput,
  settings: SettingsShape,
  chosen: readonly Candidate[],
): { index: number; question: string; variable: string; referenceId?: string; format: Format } | null {
  if (input.runningExperiments >= settings.maxRunningExperiments) return null;
  if (chosen.length === 0) return null;

  const untested = input.formatGaps.find((g) => g.state === 'untested');
  if (untested) {
    return {
      index: chosen.length - 1,
      question: `${FORMAT_LABEL[untested.format]} funciona para a Carol?`,
      variable: 'formato',
      format: untested.format,
    };
  }

  const ref = input.references[0];
  if (ref?.format) {
    return {
      index: chosen.length - 1,
      question: ref.question,
      variable: 'estrutura',
      referenceId: ref.id,
      format: ref.format,
    };
  }

  return null;
}

function toDraft(
  c: Candidate,
  position: number,
  input: PriorityInput,
  experiment: { question: string; variable: string; referenceId?: string; format: Format } | null,
): ProposalDraft {
  const lens = inferLens({
    pillar: c.topic.pillar,
    angle: c.event?.fact ?? `${c.topic.label} ${c.topic.howToTreat}`,
    topicSlug: c.topic.slug,
  });

  const format = experiment?.format ?? chooseFormat(c, input);
  const angle = buildAngle(c);
  const modality: Modality =
    c.topic.slug === 'tech_ugc' ? 'tech_ugc' : c.topic.slug === 'canvas_ugc' ? 'canvas_ugc' : 'none';

  const evidence = [...c.evidence];
  if (experiment) {
    evidence.push({
      kind: experiment.referenceId ? 'reference_hypothesis' : 'format_untested',
      detail: experiment.question,
      refId: experiment.referenceId,
    });
  }

  return {
    position,
    topicId: c.topic.id,
    topicSlug: c.topic.slug,
    topicLabel: c.topic.label,
    pillar: c.topic.pillar,
    angle: angle.text,
    angleSource: angle.source,
    lens: lens?.lens ?? 'who_i_am',
    objective: c.objective,
    format,
    structure: STRUCTURE_FIT[c.topic.pillar] ?? null,
    modality,
    whyNow: whyNow(evidence),
    evidence,
    experimental: experiment
      ? { question: experiment.question, variable: experiment.variable, referenceId: experiment.referenceId }
      : null,
    // «Reel Test recomendado», nunca obrigatório: só quando o teste é sobre um
    // Reel e há pergunta estrutural a responder.
    reelTest:
      experiment && format === 'reel'
        ? { recommended: true, because: `Há uma pergunta a responder: ${experiment.question}` }
        : null,
    storyId: c.event?.kind === 'story' && c.event.confirmed ? c.event.id : null,
  };
}

/** O ângulo. Quando existe um acontecimento real, o ângulo é esse
 *  acontecimento — o motor não inventa vida. Sem acontecimento, o ângulo é o
 *  tratamento que o Mapa já define para o assunto, virado para o objetivo.
 *
 *  Um modelo pode reescrever isto com as palavras dela. Não pode substituir a
 *  escolha. */
function buildAngle(c: Candidate): { text: string; source: 'event' | 'topic' } {
  if (c.event) return { text: c.event.fact, source: 'event' };
  const virada: Record<Objective, string> = {
    attract: 'de um jeito que faça quem não te conhece reconhecer a situação',
    retain: 'de um jeito que dê vontade de continuar acompanhando',
    prove: 'mostrando o critério por trás da decisão',
    convert: 'deixando claro como uma marca dá o próximo passo',
  };
  return { text: `${c.topic.howToTreat} ${virada[c.objective]}.`, source: 'topic' };
}

function chooseFormat(c: Candidate, input: PriorityInput): Format {
  const fit = FORMAT_FIT[c.objective];
  // Um formato com padrão consistente ganha ao seguinte da lista; um sem
  // vantagem demonstrada perde. Ausência de dados não muda nada — que é
  // precisamente o que impede «Reel funciona melhor» por falta de alternativa.
  const estado = new Map(input.formatGaps.map((g) => [g.format, g.state]));
  return (
    fit.find((f) => estado.get(f) === 'consistent_pattern')
    ?? fit.find((f) => estado.get(f) !== 'no_advantage')
    ?? fit[0]
  );
}

/** «Por que agora», montado das evidências por ordem de força. No máximo três
 *  razões: a quarta já não muda a decisão dela. */
function whyNow(evidence: readonly Evidence[]): string {
  const ordem: EvidenceKind[] = [
    'recent_event', 'learning', 'pillar_absent', 'objective_under', 'lens_absent',
    'format_untested', 'reference_hypothesis', 'topic_in_focus', 'commercial_value',
    'topic_rotation', 'avoid_repetition',
  ];
  const escolhidas = [...evidence]
    .sort((a, b) => ordem.indexOf(a.kind) - ordem.indexOf(b.kind))
    .slice(0, 3);
  return escolhidas.map((e) => e.detail).join(' ');
}

/* ── Guardrails verificáveis ──────────────────────────────────────────────── */

export type GuardrailBreach = { rule: string; because: string; position: number };

/** Corre sobre a saída do motor e devolve o que violaria a estratégia.
 *
 *  Existe separado da geração de propósito: um guardrail que só vive dentro do
 *  algoritmo que ele governa não protege contra o algoritmo seguinte. O
 *  serviço chama isto antes de gravar, e o teste chama-o com propostas
 *  fabricadas à mão. */
export function guardrailBreaches(proposals: readonly ProposalDraft[]): GuardrailBreach[] {
  const out: GuardrailBreach[] = [];

  proposals.forEach((p, i) => {
    const tom = teacherFraming(`${p.angle} ${p.whyNow}`);
    if (tom.flagged) {
      out.push({ rule: 'documentar_nao_ensinar', because: tom.because, position: i });
    }
    if (p.evidence.length === 0) {
      out.push({ rule: 'evidencia_obrigatoria', because: 'Proposta sem nenhuma razão rastreável.', position: i });
    }
  });

  const trabalho = proposals.filter((p) => p.pillar === 'ugc_income').length;
  if (proposals.length >= 3 && trabalho === proposals.length) {
    out.push({
      rule: 'perfil_nao_e_so_trabalho',
      because: 'A semana inteira ficou no pilar de trabalho. Casa e Experiências precisam de espaço.',
      position: -1,
    });
  }

  const experimentos = proposals.filter((p) => p.experimental).length;
  if (experimentos > 1) {
    out.push({
      rule: 'um_experimento_por_vez',
      because: `${experimentos} peças carregam hipótese experimental. Com três posts, uma chega.`,
      position: -1,
    });
  }

  const trials = proposals.filter((p) => p.reelTest).length;
  if (trials > 1) {
    out.push({
      rule: 'reel_test_nao_e_default',
      because: 'Reel Test é ferramenta de experimento, não o destino de todo Reel.',
      position: -1,
    });
  }

  return out;
}
