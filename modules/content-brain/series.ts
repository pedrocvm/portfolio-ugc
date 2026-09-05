/** Séries nascem de continuidade real, nunca de uma grelha de episódios.
 *
 *  A implementação antiga tinha `SERIES_CANDIDATES` com oito franquias
 *  inventadas antes de existir uma história. Isso é o contrário do que a Carol
 *  pediu: ela gosta de séries porque a Cecília conta uma coisa que continua a
 *  acontecer, não porque alguém escolheu um título bonito.
 *
 *  Aqui a série é uma consequência: várias histórias confirmadas partilham um
 *  arco, e só então se propõe organizá-las. Um episódio sem `storyId` não
 *  existe — não há placeholder, não há «episódio 4 a viver».
 *
 *  Puro. */

import type { FunctionalPillar } from './pillars';

export const SERIES_MECHANISMS = ['journey', 'challenge', 'recurring_process', 'public_learning', 'lens_format'] as const;
export type SeriesMechanism = (typeof SERIES_MECHANISMS)[number];

export const MECHANISM_LABEL: Record<SeriesMechanism, string> = {
  journey: 'Jornada',
  challenge: 'Desafio',
  recurring_process: 'Processo que se repete',
  public_learning: 'Aprendizado público',
  lens_format: 'Mesma lente, situações diferentes',
};

export const MECHANISM_DESCRIPTION: Record<SeriesMechanism, string> = {
  journey: 'Uma mudança real acompanhada ao longo do tempo.',
  challenge: 'Uma restrição clara com resultado ainda em aberto.',
  recurring_process: 'Uma coisa que você faz várias vezes e muda a cada vez.',
  public_learning: 'Uma competência mudando, com pontos de controle.',
  lens_format: 'A mesma leitura aplicada a situações diferentes.',
};

export const SERIES_STATUSES = ['suggested', 'active', 'paused', 'closed', 'declined'] as const;
export type SeriesStatus = (typeof SERIES_STATUSES)[number];

/* ── Elegibilidade ────────────────────────────────────────────────────────── */

export type SeriesPolicy = {
  version: string;
  /** Mínimo para sequer sugerir. */
  minStories: number;
  /** A partir daqui a sugestão é forte. */
  strongStories: number;
};

export const SERIES_POLICY_V1: SeriesPolicy = {
  version: 'CAROL_SERIES_POLICY_V1',
  minStories: 2,
  strongStories: 3,
};

export type ClusterInput = {
  storyId: string;
  title: string;
  pillar: FunctionalPillar | null;
  territories: readonly string[];
  factConfirmed: boolean;
  allowedForContent: boolean;
  occurredAt: string | null;
};

export type SeriesEligibility =
  | { ok: true; strength: 'suggest' | 'strong'; storyIds: string[]; because: string }
  | { ok: false; reason: string };

/** Este conjunto de histórias sustenta uma série?
 *
 *  Só contam histórias confirmadas e liberadas. Uma série montada sobre
 *  histórias por confirmar é uma série que pode ter de ser desfeita quando a
 *  Carol corrigir um fato. */
export function seriesEligibility(
  stories: readonly ClusterInput[],
  policy: SeriesPolicy = SERIES_POLICY_V1,
): SeriesEligibility {
  const validas = stories.filter((s) => s.factConfirmed && s.allowedForContent);

  if (validas.length < policy.minStories) {
    return {
      ok: false,
      reason:
        validas.length === 0
          ? 'Ainda não tenho histórias confirmadas que apontem para a mesma coisa.'
          : `Só tenho ${validas.length} história confirmada nesse arco. Uma série precisa de continuidade real.`,
    };
  }

  // Continuidade tem de estar em alguma coisa concreta: território partilhado
  // ou o mesmo pilar. Sem isso, «continuidade» é só o modelo a agrupar por
  // parecença de palavras.
  const territorios = new Map<string, number>();
  for (const s of validas) {
    for (const t of s.territories) territorios.set(t, (territorios.get(t) ?? 0) + 1);
  }
  const partilhado = [...territorios.entries()].filter(([, n]) => n >= policy.minStories);
  const mesmoPilar = new Set(validas.map((s) => s.pillar).filter(Boolean)).size === 1;

  if (partilhado.length === 0 && !mesmoPilar) {
    return { ok: false, reason: 'Essas histórias não parecem parte da mesma coisa. Não vou forçar uma série.' };
  }

  const strong = validas.length >= policy.strongStories;
  return {
    ok: true,
    strength: strong ? 'strong' : 'suggest',
    storyIds: validas.map((s) => s.storyId),
    because: strong
      ? `Você já me contou ${validas.length} situações que parecem capítulos da mesma coisa.`
      : `Duas histórias confirmadas apontam para o mesmo arco. Ainda é cedo, mas dá para acompanhar.`,
  };
}

/* ── Episódios ────────────────────────────────────────────────────────────── */

export type Episode = {
  order: number;
  storyId: string;
  title: string;
  status: 'available' | 'structured' | 'published';
};

export type EpisodeDraft = { order?: number; storyId: string | null; title?: string };

/** Um episódio só existe se apontar para uma história real.
 *
 *  Devolve os que ficam de fora em vez de os filtrar em silêncio: quem chama
 *  precisa de dizer à Carol que houve uma tentativa de inventar capítulo. */
export function acceptEpisodes(
  drafts: readonly EpisodeDraft[],
  knownStoryIds: readonly string[],
): { accepted: EpisodeDraft[]; rejected: EpisodeDraft[] } {
  const conhecidas = new Set(knownStoryIds);
  const accepted: EpisodeDraft[] = [];
  const rejected: EpisodeDraft[] = [];
  for (const d of drafts) {
    if (d.storyId && conhecidas.has(d.storyId)) accepted.push(d);
    else rejected.push(d);
  }
  return { accepted, rejected };
}

/** A frase que a tela mostra sobre o que vem a seguir.
 *
 *  Nunca «faltam 6 episódios». A série serve a vida, não o contrário. */
export function nextEpisodeLine(series: { unusedStories: number; mechanism: SeriesMechanism }): string {
  if (series.unusedStories > 0) {
    return series.unusedStories === 1
      ? 'Tem uma história já salva que ainda não virou capítulo.'
      : `Tem ${series.unusedStories} histórias já salvas que ainda não viraram capítulo.`;
  }
  return 'O próximo capítulo existe quando acontecer alguma coisa. Não vou inventar episódio.';
}
