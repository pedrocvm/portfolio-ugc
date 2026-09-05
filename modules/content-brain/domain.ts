/** O Content Brain, em regras puras.
 *
 *  Reexporta os módulos do contexto para que um consumidor importe de um sítio
 *  só, e guarda a composição que atravessa vários deles.
 *
 *  A ordem canônica, e o que cada passo exige antes de acontecer:
 *
 *    FUNÇÃO → FATO REAL → SIGNIFICADO → FORMA → PUBLICAÇÃO → APRENDIZADO
 *
 *  Saltar de FUNÇÃO para FORMA é o comportamento de um gerador genérico de
 *  ideias. `canStructure` é o portão que o impede.
 *
 *  Puro. Sem base de dados, sem modelo. */

export * from './pillars';
export * from './story';
export * from './metrics';
export * from './learning';
export * from './series';
export * from './planner';
export * from './taste';
export * from './events';
export * from './interview';

import { MIN_STORIES_FOR_WEEK, PILLAR_LABEL, type FunctionalPillar, type PillarCoverage } from './pillars';
import type { StoryFactState } from './story';
import { canStructure } from './story';

export const CONTENT_BRAIN_VERSION = 'CAROL_CONTENT_BRAIN_V1';

/* ── A decisão de conteúdo do dia ─────────────────────────────────────────── */

export const CONTENT_ACTION_TYPES = [
  'content_map_story',
  'content_develop_story',
  'content_record_ready',
  'content_confirm_trial',
  'content_save_event',
  'content_review_signal',
  'content_link_media',
] as const;

export type ContentActionType = (typeof CONTENT_ACTION_TYPES)[number];

export const CONTENT_ACTION_CTA: Record<ContentActionType, string> = {
  content_map_story: 'Contar uma situação',
  content_develop_story: 'Continuar história',
  content_record_ready: 'Gravar',
  content_confirm_trial: 'Confirmar',
  content_save_event: 'Ver o que aconteceu',
  content_review_signal: 'Revisar sinal',
  content_link_media: 'Confirmar',
};

export type ContentDecisionInput = {
  primaryPillar: FunctionalPillar;
  coverage: readonly PillarCoverage[];
  /** Histórias confirmadas à espera de enquadramento ou estrutura. */
  developing: number;
  /** Peças estruturadas e prontas para gravar. */
  readyToRecord: number;
  /** Mídia detectada sem vínculo claro. */
  unlinkedMedia: number;
  /** Reels em que o estado de teste é desconhecido e ainda não perguntámos. */
  trialUnknown: number;
  /** Candidatos proativos por responder. */
  openCandidates: number;
  /** Sinais que pedem decisão de novo teste. */
  signalsNeedingDecision: number;
  /** A semana já está abastecida. */
  weekCovered: boolean;
};

export type ContentDecision = {
  type: ContentActionType;
  headline: string;
  because: string;
  cta: string;
  covers: number;
  href: string;
};

/** A decisão de conteúdo que o Hoje mostra — no máximo uma.
 *
 *  A ordem não é estética: primeiro o que já está pronto e tem o custo mais
 *  baixo, depois o que precisa da cabeça dela, e o mapeamento só quando não há
 *  material. Um dia com sete sugestões é um dia em que ela não faz nenhuma.
 *
 *  Devolve `null` quando não há decisão real. O Hoje não cria tarefa só para
 *  parecer ativo. */
export function contentDecision(input: ContentDecisionInput): ContentDecision | null {
  // Vinculação e confirmação de Trial primeiro: são perguntas de um clique e,
  // se ficarem para trás, os snapshots começam sem contexto.
  if (input.unlinkedMedia > 0) {
    return {
      type: 'content_link_media',
      headline:
        input.unlinkedMedia === 1
          ? 'Encontrei um conteúdo novo no seu Instagram.'
          : `Encontrei ${input.unlinkedMedia} conteúdos novos no seu Instagram.`,
      because: 'Quero ligar cada um à história certa antes de começar a medir.',
      cta: CONTENT_ACTION_CTA.content_link_media,
      covers: input.unlinkedMedia,
      href: '/dashboard/content?tab=published&confirm=link',
    };
  }

  if (input.trialUnknown > 0) {
    return {
      type: 'content_confirm_trial',
      headline:
        input.trialUnknown === 1
          ? 'Um Reel precisa de uma confirmação sua.'
          : `${input.trialUnknown} Reels precisam de uma confirmação sua.`,
      because: 'O Instagram não me diz se foi publicado como Reel Test, e isso muda a comparação.',
      cta: CONTENT_ACTION_CTA.content_confirm_trial,
      covers: input.trialUnknown,
      href: '/dashboard/content?tab=tests&confirm=trial',
    };
  }

  if (input.openCandidates > 0) {
    return {
      type: 'content_save_event',
      headline:
        input.openCandidates === 1
          ? 'Aconteceu uma coisa que talvez valha guardar.'
          : `Aconteceram ${input.openCandidates} coisas que talvez valham guardar.`,
      because: 'Só você sabe se teve significado. Guardo ou deixo passar.',
      cta: CONTENT_ACTION_CTA.content_save_event,
      covers: input.openCandidates,
      href: '/dashboard/content?tab=bank&candidates=open',
    };
  }

  if (input.readyToRecord > 0) {
    return {
      type: 'content_record_ready',
      headline:
        input.readyToRecord === 1
          ? 'Tem uma história pronta para gravar.'
          : `Tem ${input.readyToRecord} histórias prontas para gravar.`,
      because: 'Já tem estrutura e ponto definidos. Não falta decisão editorial nenhuma.',
      cta: CONTENT_ACTION_CTA.content_record_ready,
      covers: input.readyToRecord,
      href: '/dashboard/content?tab=record',
    };
  }

  if (input.developing > 0) {
    return {
      type: 'content_develop_story',
      headline:
        input.developing === 1
          ? 'Tem uma história sua à espera de continuar.'
          : `Tem ${input.developing} histórias suas à espera de continuar.`,
      because: `Esta semana o foco é ${PILLAR_LABEL[input.primaryPillar]}. Falta escolher o ponto e montar a estrutura.`,
      cta: CONTENT_ACTION_CTA.content_develop_story,
      covers: input.developing,
      href: '/dashboard/content?tab=record',
    };
  }

  if (input.signalsNeedingDecision > 0) {
    return {
      type: 'content_review_signal',
      headline: 'Um sinal do seu perfil vale um novo teste.',
      because: 'Repetir o mecanismo em outra história real é o que transforma sinal em aprendizado.',
      cta: CONTENT_ACTION_CTA.content_review_signal,
      covers: input.signalsNeedingDecision,
      href: '/dashboard/content?tab=tests',
    };
  }

  const foco = input.coverage.find((c) => c.pillar === input.primaryPillar);
  if (foco && foco.available < MIN_STORIES_FOR_WEEK) {
    return {
      type: 'content_map_story',
      headline: `Esta semana o foco é ${PILLAR_LABEL[input.primaryPillar]}.`,
      because:
        foco.available === 0
          ? 'Preciso de uma situação real que tenha identificação, conflito, mudança, humor ou surpresa. Você viveu alguma coisa assim?'
          : `Você tem ${foco.available} ${foco.available === 1 ? 'situação guardada' : 'situações guardadas'} nesse pilar. Uma sessão curta abastece a semana.`,
      cta: CONTENT_ACTION_CTA.content_map_story,
      covers: 1,
      href: `/dashboard/content?tab=strategy&map=${input.primaryPillar}`,
    };
  }

  return null;
}

/* ── Resposta a «me dá uma ideia» ─────────────────────────────────────────── */

export type IdeaRequestAnswer =
  | { kind: 'existing_stories'; stories: readonly { id: string; title: string }[]; message: string }
  | { kind: 'ask_for_material'; pillar: FunctionalPillar; message: string; questions: readonly string[] };

/** O que responder quando ela pede uma ideia.
 *
 *  Nunca inventa. Ou aponta para o que ela já contou, ou conduz à captura de
 *  matéria-prima. Esta função existe para o teste que garante que o caminho
 *  «inventar» não existe em lado nenhum. */
export function answerIdeaRequest(input: {
  pillar: FunctionalPillar;
  availableStories: readonly { id: string; title: string }[];
  discoveryQuestions: readonly string[];
}): IdeaRequestAnswer {
  if (input.availableStories.length > 0) {
    return {
      kind: 'existing_stories',
      stories: input.availableStories.slice(0, 5),
      message:
        input.availableStories.length === 1
          ? 'Você tem uma história real guardada que ainda não usou. Quer desenvolver essa?'
          : `Você tem ${input.availableStories.length} histórias reais guardadas que ainda não usou. Quer continuar uma delas?`,
    };
  }
  return {
    kind: 'ask_for_material',
    pillar: input.pillar,
    message: `Esta semana estamos trabalhando ${PILLAR_LABEL[input.pillar]}. Preciso de uma situação real que tenha identificação, conflito, mudança, humor ou surpresa. Você viveu alguma coisa assim recentemente?`,
    questions: input.discoveryQuestions.slice(0, 2),
  };
}

/* ── Composição ───────────────────────────────────────────────────────────── */

export type ComposeStage = 'function' | 'raw_material' | 'meaning' | 'frame' | 'structure' | 'format' | 'record';

export const STAGE_LABEL: Record<ComposeStage, string> = {
  function: 'Função',
  raw_material: 'O que aconteceu',
  meaning: 'O que significou',
  frame: 'O ponto da história',
  structure: 'Estrutura',
  format: 'Formato',
  record: 'Gravação',
};

/** Em que etapa está uma história, e qual é a seguinte.
 *
 *  A UI usa isto para nunca mostrar «gerar roteiro» antes de tempo — a
 *  proibição está no domínio, e a tela só reflete o que ele diz. */
export function composeStage(story: StoryFactState & { hasMeaning: boolean; hasStructure: boolean }): {
  current: ComposeStage;
  next: ComposeStage | null;
  blocked: string | null;
} {
  const gate = canStructure(story);
  if (!gate.ok) {
    return { current: 'raw_material', next: 'meaning', blocked: gate.reason };
  }
  if (!story.hasMeaning) return { current: 'raw_material', next: 'meaning', blocked: null };
  if (!story.pillar) return { current: 'meaning', next: 'function', blocked: null };
  if (!story.frameId) return { current: 'function', next: 'frame', blocked: null };
  if (!story.hasStructure) return { current: 'frame', next: 'structure', blocked: null };
  return { current: 'structure', next: 'record', blocked: null };
}
