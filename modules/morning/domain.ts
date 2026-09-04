/** A manhã, decidida antes de ela chegar.
 *
 *  Este módulo não faz trabalho nenhum: recebe o que os trabalhos da noite
 *  produziram e responde a três perguntas que o Hoje fazia mal ou não fazia.
 *
 *    Por onde começar?      — cinco níveis, não dezassete cartões iguais.
 *    Quanto tempo demora?   — uma estimativa honesta, não um número bonito.
 *    O que é que falhou?    — dito por palavras, nunca escondido.
 *
 *  A ordem não é uma preferência estética. É dinheiro: uma marca que está à
 *  espera de resposta há dois dias vale mais do que dezasseis follow-ups
 *  frios, e o Hoje antigo ordenava exatamente ao contrário — por atraso, que
 *  é priorizar o mais morto.
 *
 *  Puro. */

export const DECISION_KINDS = [
  'reply',
  'money',
  'outreach_batch',
  'recording',
  'content',
] as const;

export type DecisionKind = (typeof DECISION_KINDS)[number];

/** Os cinco níveis, por ordem. O número é só a ordem — não aparece na tela. */
export const KIND_TIER: Record<DecisionKind, number> = {
  reply: 1,
  money: 2,
  outreach_batch: 3,
  recording: 4,
  content: 5,
};

export type Decision = {
  id: string;
  kind: DecisionKind;
  /** Quem, em nome próprio. «Cecotec», não «oportunidade #4». */
  subject: string;
  /** O que o sistema recomenda, numa frase. */
  headline: string;
  /** Porquê. fato, não regra de política. */
  because: string;
  /** Quantas coisas resolve de uma vez. A revisão de prospeção resolve seis. */
  covers: number;
  /** Dentro do nível: dinheiro conhecido, urgência, dias de espera. */
  weightCents: number | null;
  urgent: boolean;
  waitingDays: number | null;
  /** Minutos que esta decisão costuma custar. */
  minutes: number;
  href: string | null;
  payload?: Record<string, unknown>;
};

/** Quanto custa cada tipo de decisão, quando não há histórico.
 *
 *  São números pequenos de propósito: uma resposta já escrita lê-se e envia-se.
 *  Se demorasse cinco minutos, o sistema não a tinha preparado. */
export const DEFAULT_MINUTES: Record<DecisionKind, number> = {
  reply: 1,
  money: 1,
  outreach_batch: 3,
  recording: 2,
  content: 2,
};

/** A ordem inteligente da manhã.
 *
 *  Primeiro o nível. Dentro do nível: o que é urgente, depois o que tem mais
 *  dinheiro conhecido, depois quem espera há mais tempo. Nunca por atraso puro,
 *  que era o que punha em primeiro lugar a marca que nunca respondeu. */
export function orderDecisions(decisions: readonly Decision[]): Decision[] {
  return [...decisions].sort((a, b) => {
    const ta = KIND_TIER[a.kind];
    const tb = KIND_TIER[b.kind];
    if (ta !== tb) return ta - tb;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const ma = a.weightCents ?? -1;
    const mb = b.weightCents ?? -1;
    if (ma !== mb) return mb - ma;
    const wa = a.waitingDays ?? -1;
    const wb = b.waitingDays ?? -1;
    if (wa !== wb) return wb - wa;
    return a.subject.localeCompare(b.subject, 'pt');
  });
}

/** «5 decisões · cerca de 8 minutos».
 *
 *  A estimativa usa o histórico real quando existe. Sem histórico usa a tabela
 *  acima e arredonda para cima — prometer três minutos e gastar dez é pior do
 *  que prometer dez. */
export function estimateMinutes(
  decisions: readonly Decision[],
  history: Partial<Record<DecisionKind, number>> = {},
): number {
  const total = decisions.reduce((sum, d) => {
    const base = history[d.kind] ?? d.minutes ?? DEFAULT_MINUTES[d.kind];
    // Um lote de seis emails não custa seis vezes um: a segunda leitura já é
    // mais rápida. A raiz é grosseira e é honesta sobre isso.
    const escala = d.covers > 1 ? Math.sqrt(d.covers) : 1;
    return sum + base * escala;
  }, 0);
  return Math.max(1, Math.ceil(total));
}

/* ── O que o sistema fez, e o que não conseguiu ───────────────────────────── */

export type PreparedCounts = {
  brandsFound: number;
  referencesFound: number;
  threadsOrganized: number;
  repliesPrepared: number;
  trendsFound: number;
  contentIdeas: number;
  mailboxesSynced: number;
  followUpsCancelled: number;
  stagesUpdated: number;
};

export const EMPTY_PREPARED: PreparedCounts = {
  brandsFound: 0,
  referencesFound: 0,
  threadsOrganized: 0,
  repliesPrepared: 0,
  trendsFound: 0,
  contentIdeas: 0,
  mailboxesSynced: 0,
  followUpsCancelled: 0,
  stagesUpdated: 0,
};

/** Uma falha parcial dita como quem fala. Não é um código de erro: é a frase
 *  que ela lê no fim do Hoje. */
export type Gap = { area: string; message: string };

const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);

/** «Enquanto estava fora, o CarolOS…» — a prova de vida.
 *
 *  A Deep Review apontou que nove trabalhos correm todas as manhãs e o Hoje
 *  não menciona nenhum: ela vê a dívida dela e nunca vê o trabalho dele. Isto
 *  é a correção, e só conta o que aconteceu mesmo. */
export function describePrepared(p: PreparedCounts): string[] {
  const linhas: string[] = [];

  if (p.mailboxesSynced > 0) {
    linhas.push(
      p.mailboxesSynced === 1 ? 'sincronizei uma caixa de email' : `sincronizei ${p.mailboxesSynced} caixas de email`,
    );
  }
  if (p.threadsOrganized > 0) {
    linhas.push(`organizei ${p.threadsOrganized} ${plural(p.threadsOrganized, 'conversa', 'conversas')}`);
  }
  if (p.repliesPrepared > 0) {
    linhas.push(`preparei ${p.repliesPrepared} ${plural(p.repliesPrepared, 'resposta', 'respostas')}`);
  }
  if (p.brandsFound > 0) {
    linhas.push(`encontrei ${p.brandsFound} ${plural(p.brandsFound, 'marca', 'marcas')}`);
  }
  if (p.referencesFound > 0) {
    linhas.push(`separei ${p.referencesFound} ${plural(p.referencesFound, 'referência', 'referências')}`);
  }
  if (p.trendsFound > 0) {
    linhas.push(`vi ${p.trendsFound} ${plural(p.trendsFound, 'tendência', 'tendências')}`);
  }
  if (p.contentIdeas > 0) {
    linhas.push(
      p.contentIdeas === 1
        ? 'escolhi um conteúdo para gravar'
        : `escolhi ${p.contentIdeas} conteúdos para gravar`,
    );
  }
  if (p.followUpsCancelled > 0) {
    linhas.push(
      p.followUpsCancelled === 1
        ? 'cancelei um follow-up porque a marca respondeu'
        : `cancelei ${p.followUpsCancelled} follow-ups porque as marcas responderam`,
    );
  }
  if (p.stagesUpdated > 0) {
    linhas.push(
      p.stagesUpdated === 1 ? 'actualizei o estado de um negócio' : `actualizei o estado de ${p.stagesUpdated} negócios`,
    );
  }

  return linhas;
}

export type BriefStatus = 'ready' | 'partial' | 'failed';

export function briefStatus(prepared: PreparedCounts, gaps: readonly Gap[]): BriefStatus {
  const fezAlgumaCoisa = Object.values(prepared).some((v) => v > 0);
  if (!fezAlgumaCoisa && gaps.length > 0) return 'failed';
  return gaps.length > 0 ? 'partial' : 'ready';
}

/** A primeira frase que ela lê.
 *
 *  Nunca «17 coisas, 16 fora de prazo». Um sistema que abre com uma acusação
 *  deixa de ser aberto. */
export function headline(input: {
  decisions: readonly Decision[];
  prepared: PreparedCounts;
  gaps: readonly Gap[];
  minutes: number;
}): string {
  const n = input.decisions.length;
  if (n === 0) {
    const fez = describePrepared(input.prepared);
    if (fez.length === 0) {
      return input.gaps.length
        ? 'Não consegui preparar a manhã. Está aqui em baixo o que falhou.'
        : 'Nada precisa de você agora.';
    }
    return 'A manhã está tratada. Não sobrou nada que precise de você.';
  }
  const coisas = n === 1 ? 'Uma coisa precisa de você' : `${n} coisas precisam de você`;
  return `${coisas} — cerca de ${input.minutes} ${plural(input.minutes, 'minuto', 'minutos')}.`;
}

/** A frase de fecho, depois de ela resolver tudo. */
export function closingLine(input: {
  waitingOnBrands: number;
  recordingsToday: number;
  brandsTomorrow: number;
}): string {
  const partes: string[] = [];
  if (input.waitingOnBrands > 0) {
    partes.push(
      input.waitingOnBrands === 1
        ? 'Fica uma marca por responder do outro lado'
        : `Ficam ${input.waitingOnBrands} marcas por responder do outro lado`,
    );
  }
  if (input.recordingsToday > 0) {
    partes.push(
      input.recordingsToday === 1
        ? 'há uma gravação para hoje'
        : `há ${input.recordingsToday} gravações para hoje`,
    );
  }
  if (input.brandsTomorrow > 0) {
    partes.push(`amanhã procuro mais ${input.brandsTomorrow} marcas`);
  }

  if (partes.length === 0) return 'Pronto. A manhã está organizada.';
  const lista =
    partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
  return `Pronto. A manhã está organizada. ${lista.charAt(0).toUpperCase()}${lista.slice(1)}.`;
}

/** A regra que impede a manhã de virar uma lista de investigação.
 *
 *  Doze tendências pesquisadas não são doze cartões. São uma recomendação para
 *  o Instagram, outra para o TikTok e, quando o dia comporta, um Reels Test
 *  feito com o que já existe. Isto verifica-o em vez de o prometer. */
export const MAX_CONTENT_DECISIONS = 3;

export function researchDidNotBecomeTasks(input: {
  trendsFound: number;
  referencesFound: number;
  decisions: readonly Decision[];
}): { ok: boolean; because: string } {
  const conteudo = input.decisions.filter((d) => d.kind === 'content').length;
  if (conteudo > MAX_CONTENT_DECISIONS) {
    return { ok: false, because: `${conteudo} cartões de conteúdo: a pesquisa virou lista.` };
  }
  const referencias = input.decisions.filter((d) => d.kind === 'recording').length;
  if (input.referencesFound > 0 && referencias > input.decisions.length) {
    return { ok: false, because: 'cada referência virou um cartão.' };
  }
  return { ok: true, because: '' };
}
