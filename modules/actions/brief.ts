/** O resumo do dia em português corrente.
 *
 *  A Carol não precisa de quatro caixas com números soltos: precisa de saber
 *  se hoje tem trabalho, quanto, e por onde começar. Isto é determinístico e
 *  puro de propósito — a leitura do dia não pode depender de haver modelo
 *  configurado, nem de a chamada correr a tempo. A IA escreve por cima, não
 *  por baixo. */

export type BriefInput = {
  queued: number;
  overdue: number;
  openOpportunities: number;
  needsReview: number;
  /** As primeiras da fila, já ordenadas por prioridade. */
  head: readonly { brandName: string; overdueDays: number | null }[];
  gmailConnected: boolean;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function dailyBrief(i: BriefInput): string {
  const parts: string[] = [];

  if (i.queued === 0) {
    parts.push(
      i.openOpportunities === 0
        ? 'Não tens nada à espera de ti.'
        : i.openOpportunities === 1
          ? 'Nada à espera de ti hoje: a conversa que tens em aberto está dentro do prazo.'
          : `Nada à espera de ti hoje: as ${i.openOpportunities} conversas em aberto estão todas dentro do prazo.`,
    );
  } else {
    let first = `Tens ${i.queued} ${plural(i.queued, 'coisa', 'coisas')} para fazer hoje`;
    if (i.overdue >= i.queued) first += ', e já passaram todas do prazo';
    else if (i.overdue > 0) first += `, ${i.overdue} já fora de prazo`;
    parts.push(`${first}.`);

    const lead = i.head[0];
    if (lead) {
      parts.push(
        lead.overdueDays && lead.overdueDays > 0
          ? `Começa pela ${lead.brandName}, que passou do prazo há ${lead.overdueDays} ${plural(lead.overdueDays, 'dia', 'dias')}.`
          : `Começa pela ${lead.brandName}.`,
      );
    }
  }

  if (i.needsReview > 0) {
    parts.push(
      i.needsReview === 1
        ? 'Há também uma mensagem por triar.'
        : `Há também ${i.needsReview} mensagens por triar.`,
    );
  }

  // Última frase de propósito: explica um silêncio que de outra forma parece avaria.
  if (!i.gmailConnected) {
    parts.push('O Gmail ainda não está ligado, por isso só entra aqui o que colares na Captura.');
  }

  return parts.join(' ');
}
