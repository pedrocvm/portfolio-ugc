/** Um acontecimento do negócio não é conteúdo. É, no máximo, uma pergunta.
 *
 *  O CarolOS já vê o Gmail, a prospecção, a produção e o dinheiro. A tentação
 *  óbvia é transformar «marca respondeu em dois dias» num Reel. Isso seria o
 *  sistema a decidir o que foi importante na vida dela.
 *
 *  O que este módulo produz é um candidato com uma pergunta de significado.
 *  Só depois de ela dizer «guardar» é que nasce uma `creator_story`.
 *
 *  Puro. */

export const CANDIDATE_SOURCES = [
  'brand_reply',
  'opportunity_stage',
  'production_milestone',
  'payment',
  'social_proof',
  'performance_milestone',
] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const CANDIDATE_STATUSES = ['open', 'saved', 'dismissed', 'private'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export type EventInput = {
  source: CandidateSource;
  /** Identificador estável do acontecimento, para não perguntar duas vezes. */
  externalKey: string;
  brandId?: string | null;
  brandName?: string | null;
  /** O fato, sem adjetivo. Nunca «uma ótima notícia». */
  fact: string;
  occurredAt: string;
  evidenceRefs?: readonly string[];
};

export type StoryCandidate = {
  dedupeKey: string;
  source: CandidateSource;
  fact: string;
  /** A pergunta que o cartão faz. Uma só, de baixa pressão. */
  question: string;
  occurredAt: string;
  brandId: string | null;
  brandName: string | null;
  evidenceRefs: string[];
};

/** A pergunta certa por origem.
 *
 *  Nenhuma sugere a resposta. «Isso foi um marco importante, não foi?» seria o
 *  sistema a atribuir emoção — que é exatamente o que ele não pode fazer. */
const QUESTION: Record<CandidateSource, string> = {
  brand_reply: 'Isso teve algum significado para você ou foi só mais um contato?',
  opportunity_stage: 'Isso mudou alguma coisa para você ou foi só o processo andando?',
  production_milestone: 'Aconteceu alguma coisa nesse processo que valha registrar?',
  payment: 'Você considera isso um marco que quer guardar na sua jornada?',
  social_proof: 'Você quer guardar isso como prova do seu trabalho?',
  performance_milestone: 'Isso te surpreendeu ou já era o esperado?',
};

/** Janela em que o mesmo tipo de evento, da mesma marca, não volta a
 *  perguntar. Sem isto, seis emails de uma marca produziam seis cartões. */
export const COOLDOWN_DAYS: Record<CandidateSource, number> = {
  brand_reply: 14,
  opportunity_stage: 7,
  production_milestone: 7,
  payment: 30,
  social_proof: 30,
  performance_milestone: 14,
};

export const dedupeKeyFor = (e: EventInput): string =>
  `${e.source}:${e.brandId ?? 'none'}:${e.externalKey}`;

export type EligibilityContext = {
  /** Chaves já perguntadas, em qualquer estado. */
  seenKeys: readonly string[];
  /** Últimas perguntas por origem+marca, para o cooldown. */
  recent: readonly { source: CandidateSource; brandId: string | null; at: string }[];
  now?: Date;
};

export type Eligibility = { ok: true; candidate: StoryCandidate } | { ok: false; reason: string };

/** Este acontecimento merece uma pergunta?
 *
 *  Três portões, por esta ordem: já perguntámos, está em cooldown, tem fato
 *  concreto. O terceiro é o que impede o sistema de perguntar porque «parece
 *  emocionante» — sem fato objetivo não há cartão. */
export function candidateFor(event: EventInput, ctx: EligibilityContext): Eligibility {
  const key = dedupeKeyFor(event);

  if (ctx.seenKeys.includes(key)) {
    return { ok: false, reason: 'Já perguntei sobre isso.' };
  }

  const now = ctx.now ?? new Date();
  const cooldownMs = COOLDOWN_DAYS[event.source] * 24 * 60 * 60 * 1000;
  const recente = ctx.recent.find(
    (r) =>
      r.source === event.source &&
      (r.brandId ?? null) === (event.brandId ?? null) &&
      now.getTime() - new Date(r.at).getTime() < cooldownMs,
  );
  if (recente) {
    return { ok: false, reason: 'Perguntei sobre uma coisa parecida há pouco tempo.' };
  }

  const fato = event.fact.trim();
  if (fato.length < 10) {
    return { ok: false, reason: 'O fato não é concreto o suficiente para valer uma pergunta.' };
  }

  return {
    ok: true,
    candidate: {
      dedupeKey: key,
      source: event.source,
      fact: fato,
      question: QUESTION[event.source],
      occurredAt: event.occurredAt,
      brandId: event.brandId ?? null,
      brandName: event.brandName ?? null,
      evidenceRefs: [...(event.evidenceRefs ?? [])],
    },
  };
}

/** Vários acontecimentos da mesma marca no mesmo dia viram um cartão.
 *
 *  Consolidar é o que separa «o sistema reparou» de «o sistema notifica». */
export function consolidate(candidates: readonly StoryCandidate[]): StoryCandidate[] {
  const porChave = new Map<string, StoryCandidate>();
  for (const c of candidates) {
    const dia = c.occurredAt.slice(0, 10);
    const chave = `${c.source}:${c.brandId ?? 'none'}:${dia}`;
    const existente = porChave.get(chave);
    if (!existente) {
      porChave.set(chave, c);
      continue;
    }
    porChave.set(chave, {
      ...existente,
      fact: `${existente.fact} ${c.fact}`.slice(0, 600),
      evidenceRefs: [...new Set([...existente.evidenceRefs, ...c.evidenceRefs])],
    });
  }
  return [...porChave.values()];
}

/** Máximo de cartões proativos por dia. Conteúdo não pode virar central de
 *  notificações — é o risco nomeado no Product Briefing §23. */
export const MAX_CANDIDATES_PER_DAY = 2;
