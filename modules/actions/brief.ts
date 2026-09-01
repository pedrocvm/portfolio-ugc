/** O resumo do dia em português corrente — de Portugal.
 *
 *  «Você tem» e «comece pela» são do Brasil. A Carol é portuguesa e o produto
 *  fala com ela, não sobre ela: a segunda pessoa cai, e o que sobra é a frase
 *  a dizer o que há, sem sujeito nenhum.
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
        ? 'Não há nada à sua espera.'
        : i.openOpportunities === 1
          ? 'Nada à sua espera hoje: a conversa em aberto está dentro do prazo.'
          : `Nada à sua espera hoje: as ${i.openOpportunities} conversas em aberto estão todas dentro do prazo.`,
    );
  } else {
    let first = `Há ${i.queued} ${plural(i.queued, 'coisa', 'coisas')} para hoje`;
    // Uma só não «passaram todas»: com singular a frase tem de mudar de forma.
    if (i.overdue >= i.queued) {
      first += i.queued === 1 ? ', e já passou do prazo' : ', e já passaram todas do prazo';
    }
    else if (i.overdue > 0) first += `, ${i.overdue} já fora de prazo`;
    parts.push(`${first}.`);

    const lead = i.head[0];
    if (lead) {
      parts.push(
        lead.overdueDays && lead.overdueDays > 0
          ? `A mais antiga é a ${lead.brandName}, que passou do prazo há ${lead.overdueDays} ${plural(lead.overdueDays, 'dia', 'dias')}.`
          : `A primeira é a ${lead.brandName}.`,
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
    parts.push('O Gmail ainda não está ligado, por isso só entra aqui o que for colado.');
  }

  return parts.join(' ');
}
