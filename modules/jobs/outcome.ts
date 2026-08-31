/** O resultado de um trabalho, dito em português.
 *
 *  Antes isto era `JSON.stringify(detail)` na tela: a Carol carregava em
 *  «Sincronizar Gmail» e recebia `{"mailbox":null,"status":"success",
 *  "processed":0,...}`. É a máquina a falar consigo própria à frente de quem a
 *  usa — e num sítio onde ela só quer saber se aconteceu alguma coisa. */

const n = (v: unknown) => (typeof v === 'number' ? v : 0);
const plural = (v: number, um: string, muitos: string) => `${v} ${v === 1 ? um : muitos}`;

/** Junta o que aconteceu numa frase, e omite os zeros: «0 duplicadas» não é
 *  informação, é ruído a competir com o que importa. */
const list = (parts: string[]) => {
  const real = parts.filter(Boolean);
  if (real.length === 0) return '';
  if (real.length === 1) return real[0];
  return `${real.slice(0, -1).join(', ')} e ${real[real.length - 1]}`;
};

export function jobOutcome(job: string, detail: unknown): string {
  const d = (detail ?? {}) as Record<string, unknown>;

  switch (job) {
    case 'gmail-sync': {
      const processed = n(d.processed);
      if (processed === 0) return 'Nada de novo nas caixas.';
      const bits = list([
        n(d.created) ? `${plural(n(d.created), 'conversa nova', 'conversas novas')}` : '',
        n(d.needsReview) ? `${plural(n(d.needsReview), 'por triar', 'por triar')}` : '',
        n(d.duplicates) ? `${plural(n(d.duplicates), 'já conhecida', 'já conhecidas')}` : '',
        n(d.irrelevant) ? `${plural(n(d.irrelevant), 'fora do trabalho', 'fora do trabalho')}` : '',
      ]);
      return `${plural(processed, 'mensagem lida', 'mensagens lidas')}${bits ? `: ${bits}` : ''}.`;
    }

    case 'process-pending': {
      const total = Object.values(d).reduce<number>((t, v) => t + n(v), 0);
      if (total === 0) return 'Não havia nada pendente.';
      return `${plural(total, 'mensagem processada', 'mensagens processadas')}.`;
    }

    case 'followups': {
      const bits = list([
        n(d.markedDue) ? `${plural(n(d.markedDue), 'venceu', 'venceram')}` : '',
        n(d.seeded) ? `${plural(n(d.seeded), 'novo agendado', 'novos agendados')}` : '',
      ]);
      return bits ? `Follow-ups: ${bits}.` : 'Nenhum follow-up mudou de estado.';
    }

    case 'rights': {
      const expired = n(d.expired);
      return expired === 0
        ? 'Nenhuma licença expirou.'
        : `${plural(expired, 'licença expirou', 'licenças expiraram')}.`;
    }

    case 'plan': {
      const bits = list([
        n(d.created) ? `${plural(n(d.created), 'ação nova', 'ações novas')}` : '',
        n(d.closed) ? `${plural(n(d.closed), 'fechada', 'fechadas')}` : '',
        n(d.woken) ? `${plural(n(d.woken), 'adiada acordou', 'adiadas acordaram')}` : '',
      ]);
      return bits ? `Fila recalculada: ${bits}.` : 'Fila recalculada, sem mudanças.';
    }

    case 'metrics': {
      const asked = n(d.requested);
      return asked === 0
        ? 'Nenhum trabalho está à espera de métricas.'
        : `${plural(asked, 'pedido de métricas preparado', 'pedidos de métricas preparados')}.`;
    }

    case 'upsell': {
      const found = n(d.found) || n(d.created) || n(d.scanned);
      return found === 0 ? 'Nenhuma oportunidade de upsell agora.' : `${plural(found, 'hipótese', 'hipóteses')} de upsell.`;
    }

    case 'insights': {
      const bits = list([
        n(d.created) ? `${plural(n(d.created), 'aviso', 'avisos')}` : '',
        n(d.closed) ? `${plural(n(d.closed), 'resolvido', 'resolvidos')}` : '',
      ]);
      return bits ? `Avisos: ${bits}.` : 'Nada de novo para avisar.';
    }

    case 'outreach': {
      const found = n(d.selected);
      if (found === 0) return 'Nenhuma marca nova atingiu o nível de qualidade hoje.';
      return `${plural(found, 'marca nova encontrada', 'marcas novas encontradas')}, com email preparado.`;
    }

    default:
      return 'Correu.';
  }
}
