/** A matéria-prima e o invariant que governa tudo o resto.
 *
 *  **Sem história real confirmada não existe conteúdo pessoal estruturado.**
 *  Isto não pode viver num prompt: um prompt é uma sugestão que o modelo
 *  segue quase sempre, e «quase sempre» aplicado à vida de uma pessoa é
 *  ficção publicada com o rosto dela.
 *
 *  Por isso o invariant é uma função pura, testada, chamada pelo serviço, pela
 *  server action e pela ferramenta do assistente — os três caminhos que
 *  conseguem chegar ao domínio.
 *
 *  Três camadas que nunca se misturam:
 *
 *    FACT             o que aconteceu. A IA extrai, a Carol confirma.
 *    CAROL_MEANING    o que aquilo significou. Só ela, ou citação literal.
 *    AI_SUGGESTION    proposta de enquadramento. Sempre marcada como proposta.
 *
 *  Puro. */

import { excludedTopicIn, isFunctionalPillar, type ExcludedTopic, type FunctionalPillar } from './pillars';

/* ── Estados ──────────────────────────────────────────────────────────────── */

export const STORY_STATUSES = [
  'captured',
  'needs_confirmation',
  'confirmed',
  'mapped',
  'structured',
  'ready_to_record',
  'recorded',
  'published',
  'measured',
  'archived',
  'rejected',
] as const;

export type StoryStatus = (typeof STORY_STATUSES)[number];

export const isStoryStatus = (v: unknown): v is StoryStatus =>
  typeof v === 'string' && (STORY_STATUSES as readonly string[]).includes(v);

/** A linguagem que a Carol vê. Nenhum estado aparece na tela pelo nome
 *  interno: «needs_confirmation» não é português. */
export const STORY_STATUS_LABEL: Record<StoryStatus, string> = {
  captured: 'Capturada',
  needs_confirmation: 'Falta confirmar',
  confirmed: 'Confirmada',
  mapped: 'Com função definida',
  structured: 'Estruturada',
  ready_to_record: 'Pronta para gravar',
  recorded: 'Gravada',
  published: 'Publicada',
  measured: 'Em observação',
  archived: 'Arquivada',
  rejected: 'Descartada',
};

/** Transições legítimas. Um mapa explícito em vez de uma cadeia de `if`:
 *  a proibição que interessa — saltar a confirmação — tem de se conseguir ler
 *  desta tabela sem executar nada. */
const TRANSITIONS: Record<StoryStatus, readonly StoryStatus[]> = {
  captured: ['needs_confirmation', 'confirmed', 'archived', 'rejected'],
  needs_confirmation: ['confirmed', 'captured', 'archived', 'rejected'],
  // Voltar a `needs_confirmation` é legítimo: editar um fato reabre a
  // confirmação, e é isso que impede uma correção de passar despercebida.
  confirmed: ['mapped', 'needs_confirmation', 'archived', 'rejected'],
  mapped: ['structured', 'confirmed', 'needs_confirmation', 'archived', 'rejected'],
  structured: ['ready_to_record', 'mapped', 'needs_confirmation', 'archived', 'rejected'],
  ready_to_record: ['recorded', 'structured', 'needs_confirmation', 'archived', 'rejected'],
  recorded: ['published', 'ready_to_record', 'archived'],
  published: ['measured', 'archived'],
  measured: ['archived'],
  archived: ['confirmed', 'captured'],
  rejected: [],
};

/** Estados a partir dos quais a história já é conteúdo em produção. Serve para
 *  decidir o que uma edição de fatos faz: reabrir confirmação. */
export const PRODUCTION_STATUSES: readonly StoryStatus[] = ['structured', 'ready_to_record', 'recorded', 'published', 'measured'];

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export type StoryFactState = {
  status: StoryStatus;
  factStatus: FactStatus;
  factConfirmedAt: string | null;
  privacyLevel: PrivacyLevel;
  allowedForContent: boolean;
  pillar?: string | null;
  frameId?: string | null;
};

export const FACT_STATUSES = ['draft', 'needs_confirmation', 'confirmed', 'rejected'] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export const PRIVACY_LEVELS = ['private', 'restricted', 'content_ok'] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export const PRIVACY_LABEL: Record<PrivacyLevel, string> = {
  private: 'Privada',
  restricted: 'Pedir antes de usar',
  content_ok: 'Pode virar conteúdo',
};

export const SOURCE_TYPES = [
  'user_audio',
  'user_text',
  'gmail_event',
  'opportunity_event',
  'production_event',
  'metric_event',
  'import',
] as const;
export type StorySourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_LABEL: Record<StorySourceType, string> = {
  user_audio: 'Você contou por áudio',
  user_text: 'Você escreveu',
  gmail_event: 'Detectado no email',
  opportunity_event: 'Detectado na prospecção',
  production_event: 'Detectado na produção',
  metric_event: 'Detectado no desempenho',
  import: 'Importado',
};

/* ── O invariant ──────────────────────────────────────────────────────────── */

/** Pode esta história ser estruturada?
 *
 *  Uma única função, chamada de todos os caminhos. Se algum dia houver um
 *  segundo lugar a decidir isto, os dois vão divergir. */
export function canStructure(story: StoryFactState): TransitionResult {
  if (story.status === 'rejected') {
    return { ok: false, reason: 'Esta história foi descartada. Não volta sozinha.' };
  }
  if (story.privacyLevel === 'private' || !story.allowedForContent) {
    return { ok: false, reason: 'Esta história está marcada como privada. Só você pode liberar.' };
  }
  if (story.factStatus !== 'confirmed' || !story.factConfirmedAt) {
    return {
      ok: false,
      reason: 'Antes de estruturar preciso que você confirme se foi isso mesmo que aconteceu.',
    };
  }
  return { ok: true };
}

/** Pode gerar roteiro?
 *
 *  Mais apertado do que estruturar: exige história confirmada, ponto escolhido
 *  e estrutura aprovada. O botão não deve existir antes disto, e a action
 *  recusa mesmo quando a UI é contornada. */
export function canGenerateScript(
  story: StoryFactState,
  content: { hasStructure: boolean; hasFrame: boolean },
): TransitionResult {
  const base = canStructure(story);
  if (!base.ok) return base;
  if (!content.hasFrame) {
    return { ok: false, reason: 'Falta escolher qual é a parte que você quer contar.' };
  }
  if (!content.hasStructure) {
    return { ok: false, reason: 'O roteiro vem depois da estrutura, não antes.' };
  }
  return { ok: true };
}

/** Uma transição é legítima?
 *
 *  Além da tabela, o portão do invariant: chegar a `structured` exige fatos
 *  confirmados mesmo que a tabela permitisse o salto. */
export function canTransition(story: StoryFactState, to: StoryStatus): TransitionResult {
  if (story.status === to) return { ok: true };

  const allowed = TRANSITIONS[story.status] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `Não dá para passar de «${STORY_STATUS_LABEL[story.status]}» para «${STORY_STATUS_LABEL[to]}».`,
    };
  }

  if (to === 'structured' || to === 'ready_to_record') {
    const gate = canStructure(story);
    if (!gate.ok) return gate;
    if (to === 'ready_to_record' && !story.frameId) {
      return { ok: false, reason: 'Falta escolher o ponto da história antes de marcar como pronta.' };
    }
  }

  if (to === 'mapped') {
    const gate = canStructure(story);
    if (!gate.ok) return gate;
  }

  return { ok: true };
}

/** Editar fatos reabre a confirmação quando muda alguma coisa material.
 *
 *  Uma vírgula não devia obrigar a reconfirmar; trocar «duas horas» por «vinte
 *  minutos» tem de obrigar. O critério é a sequência factual mudar. */
export function factsEditReopens(
  before: readonly string[],
  after: readonly string[],
): boolean {
  if (before.length !== after.length) return true;
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return before.some((f, i) => norm(f) !== norm(after[i]));
}

/** Estado do fato depois de uma edição. Puro para o serviço não ter de
 *  reimplementar a regra em SQL. */
export function factStatusAfterEdit(
  current: StoryFactState,
  changed: boolean,
): Pick<StoryFactState, 'factStatus' | 'factConfirmedAt' | 'status'> {
  if (!changed) {
    return { factStatus: current.factStatus, factConfirmedAt: current.factConfirmedAt, status: current.status };
  }
  return {
    factStatus: 'needs_confirmation',
    factConfirmedAt: null,
    status: PRODUCTION_STATUSES.includes(current.status) ? 'needs_confirmation' : current.status,
  };
}

/* ── Elegibilidade para sugestão ──────────────────────────────────────────── */

export type StoryCandidateForPlan = StoryFactState & {
  id: string;
  title: string;
  pillar: string | null;
  usedByContentId?: string | null;
};

/** Uma história pode ser sugerida no planeamento?
 *
 *  Privada nunca aparece. Descartada não ressuscita sozinha. Já usada só
 *  reaparece se alguém a for buscar de propósito. */
export function eligibleForSuggestion(story: StoryCandidateForPlan): boolean {
  if (story.status === 'rejected' || story.status === 'archived') return false;
  if (story.privacyLevel === 'private') return false;
  if (!story.allowedForContent) return false;
  if (story.factStatus !== 'confirmed') return false;
  if (story.usedByContentId) return false;
  return true;
}

/* ── Privacidade por origem ───────────────────────────────────────────────── */

/** Privacidade e permissão iniciais, pela origem.
 *
 *  O que ela contou de propósito entra pronta para virar conteúdo. O que o
 *  sistema inferiu de um email entra restrita: um fato comercial detectado não
 *  é autorização de publicação, e tratá-lo como se fosse era a forma mais
 *  rápida de publicar dinheiro alheio. */
export function defaultPrivacy(source: StorySourceType): {
  privacyLevel: PrivacyLevel;
  allowedForContent: boolean;
  factStatus: FactStatus;
  status: StoryStatus;
} {
  const contadoPorEla = source === 'user_audio' || source === 'user_text';
  return contadoPorEla
    ? {
        privacyLevel: 'content_ok',
        allowedForContent: true,
        factStatus: 'needs_confirmation',
        status: 'needs_confirmation',
      }
    : {
        privacyLevel: 'restricted',
        allowedForContent: false,
        factStatus: 'draft',
        status: 'captured',
      };
}

/* ── Portão de conteúdo ───────────────────────────────────────────────────── */

export type ContentGate =
  | { ok: true; pillar: FunctionalPillar }
  | { ok: false; reason: string; excluded?: ExcludedTopic };

/** O portão que uma peça de conteúdo pessoal tem de atravessar antes de
 *  existir: história confirmada, pilar funcional válido e tema permitido. */
export function contentGate(input: {
  story: StoryFactState | null;
  pillar: string | null;
  text: string;
}): ContentGate {
  const excluded = excludedTopicIn(input.text);
  if (excluded) {
    return {
      ok: false,
      excluded,
      reason:
        excluded === 'skincare'
          ? 'Skincare está fora da estratégia de conteúdo. Maquiagem continua dentro.'
          : 'Haircare está fora da estratégia de conteúdo.',
    };
  }
  if (!input.story) {
    return { ok: false, reason: 'Falta uma situação real. Me conta o que aconteceu e eu organizo.' };
  }
  const gate = canStructure(input.story);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (!isFunctionalPillar(input.pillar)) {
    return { ok: false, reason: 'Falta decidir que função essa história cumpre.' };
  }
  return { ok: true, pillar: input.pillar };
}
