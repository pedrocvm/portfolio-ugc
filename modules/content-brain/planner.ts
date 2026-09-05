/** O planeamento semanal escolhe entre o que existe. Não gera.
 *
 *  A diferença entre esta feature e um gerador de ideias cabe nesta linha:
 *  quando falta matéria-prima, o planner devolve uma ação de mapear pilar —
 *  nunca um texto de história inventada para encher um slot.
 *
 *  Um calendário vazio não autoriza inventar vida.
 *
 *  Puro. */

import {
  FUNCTIONAL_PILLARS,
  MIN_STORIES_FOR_WEEK,
  PILLAR_LABEL,
  pillarToMap,
  type FunctionalPillar,
  type PillarCoverage,
} from './pillars';

export const SLOT_PURPOSES = ['primary', 'complement', 'breather', 'commercial'] as const;
export type SlotPurpose = (typeof SLOT_PURPOSES)[number];

export const SLOT_PURPOSE_LABEL: Record<SlotPurpose, string> = {
  primary: 'Foco da semana',
  complement: 'Complemento',
  breather: 'Respiro',
  commercial: 'Prazo comercial',
};

export type PlannerStory = {
  id: string;
  title: string;
  pillar: FunctionalPillar | null;
  /** Já estruturada e pronta para gravar. */
  ready: boolean;
  eligible: boolean;
  seriesId: string | null;
};

export type PlannerInput = {
  weekStart: string;
  primaryPillar: FunctionalPillar;
  coverage: readonly PillarCoverage[];
  stories: readonly PlannerStory[];
  /** Peças com prazo comercial real esta semana. Prazo ganha ao plano orgânico. */
  commercialDeadlines: readonly { contentId: string; title: string; dueAt: string }[];
  /** Quanto ela consegue produzir. Nunca uma quota fixa da mentoria. */
  capacity?: number;
  recentPillars?: readonly string[];
};

export type PlannerSlot =
  | {
      kind: 'story';
      order: number;
      pillar: FunctionalPillar;
      purpose: SlotPurpose;
      storyId: string;
      title: string;
      ready: boolean;
    }
  | {
      kind: 'content';
      order: number;
      pillar: FunctionalPillar | null;
      purpose: SlotPurpose;
      contentId: string;
      title: string;
      dueAt: string;
    }
  | {
      kind: 'map_pillar';
      order: number;
      pillar: FunctionalPillar;
      purpose: SlotPurpose;
      /** O que a sessão vai procurar. Categorias, nunca ideias. */
      reason: string;
    };

export type WeekPlan = {
  weekStart: string;
  primaryPillar: FunctionalPillar;
  rationale: string;
  slots: PlannerSlot[];
  /** Pilares sem material. Não bloqueiam a semana; explicam-na. */
  gaps: { pillar: FunctionalPillar; available: number }[];
  /** Verdadeiro quando não há material nenhum e a semana é só mapeamento. */
  mappingOnly: boolean;
};

const DEFAULT_CAPACITY = 4;

/** Mistura alvo por semana, como sugestão revisável. Não é uma grelha
 *  matemática: é a leitura de que só um pilar cansa. */
function targetMix(capacity: number): { primary: number; complement: number; breather: number } {
  if (capacity <= 1) return { primary: 1, complement: 0, breather: 0 };
  if (capacity <= 3) return { primary: capacity - 1, complement: 1, breather: 0 };
  return { primary: capacity - 2, complement: 1, breather: 1 };
}

/** Monta a semana a partir do inventário real.
 *
 *  A ordem é: prazos comerciais primeiro (são compromissos com terceiros), o
 *  pilar em foco depois, complemento e respiro no fim. Onde não houver
 *  história elegível entra uma ação de mapear — uma só, nunca uma por slot
 *  vazio, que era como o Hoje passava a mostrar cinco dívidas. */
export function planWeek(input: PlannerInput): WeekPlan {
  const capacity = Math.max(1, Math.min(input.capacity ?? DEFAULT_CAPACITY, 7));
  const mix = targetMix(capacity);
  const slots: PlannerSlot[] = [];
  let order = 0;

  for (const d of input.commercialDeadlines) {
    slots.push({
      kind: 'content',
      order: order++,
      pillar: null,
      purpose: 'commercial',
      contentId: d.contentId,
      title: d.title,
      dueAt: d.dueAt,
    });
  }

  const disponiveis = input.stories.filter((s) => s.eligible);
  const usadas = new Set<string>();

  const take = (pillar: FunctionalPillar | null, purpose: SlotPurpose, n: number) => {
    const pool = disponiveis
      .filter((s) => !usadas.has(s.id))
      .filter((s) => (pillar ? s.pillar === pillar : true))
      // Prontas primeiro: a semana começa pelo que já não precisa de decisão.
      .sort((a, b) => Number(b.ready) - Number(a.ready));
    for (const s of pool.slice(0, n)) {
      usadas.add(s.id);
      slots.push({
        kind: 'story',
        order: order++,
        pillar: (s.pillar ?? pillar) as FunctionalPillar,
        purpose,
        storyId: s.id,
        title: s.title,
        ready: s.ready,
      });
    }
  };

  take(input.primaryPillar, 'primary', mix.primary);

  const complementar = FUNCTIONAL_PILLARS.filter((p) => p !== input.primaryPillar).sort((a, b) => {
    const ca = input.coverage.find((c) => c.pillar === a)?.available ?? 0;
    const cb = input.coverage.find((c) => c.pillar === b)?.available ?? 0;
    return cb - ca;
  });
  if (mix.complement > 0 && complementar[0]) take(complementar[0], 'complement', mix.complement);
  if (mix.breather > 0) take(null, 'breather', mix.breather);

  const gaps = input.coverage
    .filter((c) => c.available < MIN_STORIES_FOR_WEEK)
    .map((c) => ({ pillar: c.pillar, available: c.available }));

  const temHistoria = slots.some((s) => s.kind === 'story');
  const aMapear = pillarToMap(input.coverage);

  if (aMapear && (!temHistoria || slots.filter((s) => s.kind === 'story').length < mix.primary)) {
    slots.push({
      kind: 'map_pillar',
      order: order++,
      pillar: aMapear,
      purpose: temHistoria ? 'complement' : 'primary',
      reason: `${PILLAR_LABEL[aMapear]} tem pouca matéria-prima. Uma sessão curta resolve.`,
    });
  }

  return {
    weekStart: input.weekStart,
    primaryPillar: input.primaryPillar,
    rationale: rationale(input, temHistoria),
    slots,
    gaps,
    mappingOnly: !temHistoria,
  };
}

function rationale(input: PlannerInput, temHistoria: boolean): string {
  const label = PILLAR_LABEL[input.primaryPillar];
  const cobertura = input.coverage.find((c) => c.pillar === input.primaryPillar);
  if (!temHistoria) {
    return `O foco é ${label}, mas ainda não tenho situação real guardada para isso. Antes de plano, matéria-prima.`;
  }
  const n = cobertura?.available ?? 0;
  return `O foco desta semana é ${label}. Você tem ${n} ${n === 1 ? 'situação real disponível' : 'situações reais disponíveis'} nesse pilar.`;
}

/** O planner nunca devolve texto livre de história. Esta função existe para o
 *  teste: um slot só é legítimo se apontar para um id existente ou for uma
 *  ação de mapear. */
export function validateSlots(
  slots: readonly PlannerSlot[],
  known: { storyIds: readonly string[]; contentIds: readonly string[] },
): { ok: true } | { ok: false; invalid: PlannerSlot[] } {
  const stories = new Set(known.storyIds);
  const contents = new Set(known.contentIds);
  const invalid = slots.filter((s) => {
    if (s.kind === 'story') return !stories.has(s.storyId);
    if (s.kind === 'content') return !contents.has(s.contentId);
    return false;
  });
  return invalid.length ? { ok: false, invalid } : { ok: true };
}

/** Quantas decisões de conteúdo o Hoje pode mostrar por dia.
 *
 *  Uma. Cinco slots planeados não são cinco cartões: o Hoje consolida e
 *  pergunta uma coisa de cada vez. */
export const MAX_CONTENT_DECISIONS_PER_DAY = 1;
