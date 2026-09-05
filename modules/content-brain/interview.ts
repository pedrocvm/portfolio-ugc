/** A entrevista editorial: uma pergunta de cada vez, e nenhuma que traga a
 *  resposta desejada.
 *
 *  A habilidade central da feature é entrevistar bem. Uma pergunta como «e se
 *  você dissesse que quase desistiu?» produz uma história melhor e falsa — é
 *  por isso que este módulo separa o tipo de pergunta e recusa as indutoras.
 *
 *  Puro. */

import { PILLAR_SPEC, type FunctionalPillar } from './pillars';

export const QUESTION_KINDS = [
  'fact',
  'reaction',
  'contrast',
  'meaning',
  'identification',
  'privacy',
  'continuity',
  'visual',
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const QUESTION_PURPOSE: Record<QuestionKind, string> = {
  fact: 'completar a sequência do que aconteceu',
  reaction: 'capturar a linguagem e a emoção reais',
  contrast: 'encontrar a virada verdadeira',
  meaning: 'saber se aquilo teve importância',
  identification: 'encontrar a ponte com quem assiste',
  privacy: 'saber o limite antes de estruturar',
  continuity: 'perceber se é isolado ou continua',
  visual: 'planear prova visual sem reencenar',
};

export type Question = { kind: QuestionKind; text: string; help?: string };

/** Perguntas de arranque por pilar, tiradas da Source of Truth. Categorias de
 *  situação, nunca ideias de conteúdo. */
export function openingQuestions(pillar: FunctionalPillar): Question[] {
  return PILLAR_SPEC[pillar].discovery.map((text) => ({ kind: 'fact' as const, text }));
}

export function pillarIntro(pillar: FunctionalPillar): { title: string; purpose: string; looking: readonly string[] } {
  const spec = PILLAR_SPEC[pillar];
  return { title: spec.label, purpose: spec.purpose, looking: spec.rawMaterial };
}

/* ── Ritmo ────────────────────────────────────────────────────────────────── */

/** Uma pergunta importante por vez, e resumir a cada duas a quatro respostas.
 *  Sem isto a entrevista vira interrogatório e ela abandona a meio. */
export const MAX_QUESTIONS_PER_TURN = 1;
export const SUMMARIZE_AFTER_ANSWERS = 3;

export type InterviewState = {
  answers: number;
  hasFacts: boolean;
  hasMeaning: boolean;
  hasPrivacyAnswer: boolean;
  hasContinuityAnswer: boolean;
};

export type NextStep =
  | { step: 'ask'; kind: QuestionKind }
  | { step: 'summarize' }
  | { step: 'ready' };

/** O que fazer a seguir na entrevista.
 *
 *  Resumir tem prioridade sobre continuar a perguntar: o Product Briefing pede
 *  progresso visível a cada duas a quatro respostas, e é isso que faz a sessão
 *  parecer conversa. */
export function nextStep(state: InterviewState): NextStep {
  if (!state.hasFacts) return { step: 'ask', kind: 'fact' };
  if (state.answers > 0 && state.answers % SUMMARIZE_AFTER_ANSWERS === 0) return { step: 'summarize' };
  if (!state.hasMeaning) return { step: 'ask', kind: 'meaning' };
  if (!state.hasPrivacyAnswer) return { step: 'ask', kind: 'privacy' };
  if (!state.hasContinuityAnswer) return { step: 'ask', kind: 'continuity' };
  return { step: 'ready' };
}

/* ── Perguntas proibidas ──────────────────────────────────────────────────── */

const LEADING = [
  /\be se (você|voce|tu) dissesse\b/i,
  /\bpodemos fingir\b/i,
  /\bvamos dizer que\b/i,
  /\bvocê não acha que isso prova\b/i,
  /\bvoce nao acha que isso prova\b/i,
  /\bimagina que\b/i,
  /\bnão seria melhor dizer\b/i,
  /\bpara ficar mais engraçad/i,
  /\bpara ficar mais dramátic/i,
];

export type QuestionCheck = { ok: boolean; reason: string | null };

/** Recusa perguntas que induzem a resposta ou pedem ficção.
 *
 *  Vive aqui e não no prompt porque é o portão que impede a feature inteira de
 *  se tornar um ghostwriter da vida dela. */
export function checkQuestion(text: string): QuestionCheck {
  if (LEADING.some((re) => re.test(text))) {
    return { ok: false, reason: 'A pergunta sugere a resposta ou pede uma coisa que não aconteceu.' };
  }
  const perguntas = (text.match(/\?/g) ?? []).length;
  if (perguntas > 1) {
    return { ok: false, reason: 'Uma pergunta de cada vez.' };
  }
  return { ok: true, reason: null };
}

/** Filtra uma lista de perguntas propostas pelo modelo, devolvendo as que
 *  passam e as que foram recusadas com o motivo. */
export function filterQuestions(questions: readonly Question[]): {
  accepted: Question[];
  rejected: { question: Question; reason: string }[];
} {
  const accepted: Question[] = [];
  const rejected: { question: Question; reason: string }[] = [];
  for (const q of questions) {
    const check = checkQuestion(q.text);
    if (check.ok) accepted.push(q);
    else rejected.push({ question: q, reason: check.reason ?? 'recusada' });
  }
  return { accepted, rejected };
}

/* ── Enquadramento ────────────────────────────────────────────────────────── */

export type FrameOption = {
  id: string;
  label: string;
  /** Porque é que este enquadramento é possível — sempre a partir dos fatos. */
  because: string;
  /** Índices dos fatos que sustentam esta leitura. */
  factIndexes: number[];
};

/** Um enquadramento só é legítimo se se apoiar em fatos que existem.
 *
 *  É este portão que impede opções do tipo «você quase desistiu» quando ela
 *  nunca disse isso. */
export function validFrames(
  options: readonly FrameOption[],
  factCount: number,
): { accepted: FrameOption[]; rejected: FrameOption[] } {
  const accepted: FrameOption[] = [];
  const rejected: FrameOption[] = [];
  for (const o of options) {
    const ok =
      o.factIndexes.length > 0 && o.factIndexes.every((i) => Number.isInteger(i) && i >= 0 && i < factCount);
    (ok ? accepted : rejected).push(o);
  }
  return { accepted, rejected };
}

/* ── Estrutura ────────────────────────────────────────────────────────────── */

export const BEAT_PURPOSES = ['open', 'context', 'event', 'turn', 'reaction', 'proof', 'close'] as const;
export type BeatPurpose = (typeof BEAT_PURPOSES)[number];

export const BEAT_LABEL: Record<BeatPurpose, string> = {
  open: 'Abertura',
  context: 'Contexto',
  event: 'Acontecimento',
  turn: 'Virada',
  reaction: 'Reação',
  proof: 'Prova',
  close: 'Fecho',
};

export type Beat = {
  order: number;
  purpose: BeatPurpose;
  /** A intenção do momento, não a fala. A fala é dela. */
  intent: string;
  /** Índices dos fatos que este momento usa. Vazio significa sugestão pura. */
  factIndexes: number[];
};

export type StoryStructure = {
  centralPoint: string;
  frameId: string;
  beats: Beat[];
  visualSupport: { beat: number; kind: 'existing_broll' | 'record_new' | 'optional'; description: string }[];
  mustNotInvent: string[];
  sourceVersion: string;
};

/** Cada momento tem de apontar para um fato ou declarar-se sugestão.
 *
 *  Devolve os momentos sem apoio para o serviço os poder marcar como sugestão
 *  na tela em vez de os deixar passar por fato. */
export function unsupportedBeats(structure: { beats: readonly Beat[] }, factCount: number): Beat[] {
  return structure.beats.filter(
    (b) => b.factIndexes.length === 0 || b.factIndexes.some((i) => i < 0 || i >= factCount),
  );
}
