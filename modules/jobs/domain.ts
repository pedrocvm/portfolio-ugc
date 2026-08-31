/** A parte pura do agendador: tipos e a explicação de cada trabalho.
 *
 *  Separada do serviço porque a tela de Definições corre no browser e precisa
 *  destas etiquetas. Se viessem do serviço, importá-las arrastava o cliente de
 *  service role para o pacote do cliente — que é exactamente o que o
 *  `server-only` no serviço está lá para impedir. */

export type ScheduleRow = {
  jobName: string;
  schedule: string;
  active: boolean;
  lastDispatch: string | null;
  lastStatus: string | null;
  lastError: string | null;
  processedCount: number | null;
  failures24h: number;
};

export type SchedulerState = {
  available: boolean;
  configured: boolean;
  baseUrl: string | null;
  configuredAt: string | null;
  hasSecret: boolean;
  rows: ScheduleRow[];
  /** Porque é que não está disponível, quando não está. */
  unavailableReason: string | null;
};

/** O que cada trabalho faz e porque corre com esta frequência. A interface
 *  mostra isto ao lado da expressão, para o horário não ser um enigma.
 *
 *  As frequências não foram copiadas de lado nenhum: cada uma responde a
 *  quanto tempo é aceitável o sistema estar errado sobre aquele assunto. Uma
 *  licença expira ao dia; uma resposta de marca fica velha em minutos. */
export const JOB_PURPOSE: Record<string, { label: string; why: string }> = {
  'carolos-gmail-sync': {
    label: 'Sincronizar o Gmail',
    why: 'De 15 em 15 minutos durante o dia. É o intervalo entre uma marca responder e tu saberes.',
  },
  'carolos-process-pending': {
    label: 'Processar o que ficou pendente',
    why: 'De 30 em 30 minutos, todo o dia. Apanha mensagens por processar e repete a extração que falhou.',
  },
  'carolos-followups': {
    label: 'Atualizar follow-ups',
    why: 'De hora a hora. Marca os vencidos e semeia os que faltam.',
  },
  'carolos-plan': {
    label: 'Recalcular a fila do Hoje',
    why: 'De hora a hora. Acorda adiados e refaz as ações, sem depender de você abrir a aplicação.',
  },
  'carolos-rights': {
    label: 'Verificar licenças',
    why: 'Uma vez por dia. Uma licença expira ao dia, não ao minuto.',
  },
  'carolos-metrics': {
    label: 'Lembretes de métricas',
    why: 'Uma vez por dia. Pede resultados às marcas cuja campanha já correu.',
  },
  'carolos-upsell': {
    label: 'Procurar próxima oferta',
    why: 'Uma vez por dia. Avalia trabalhos aprovados que já assentaram.',
  },
  'carolos-insights': {
    label: 'Procurar o que precisa de atenção',
    why: 'Uma vez por dia, de manhã. Marcas paradas, licenças a acabar, dinheiro por receber e janelas de upsell — o que começa a doer antes de você reparar.',
  },
  'carolos-outreach': {
    label: 'Procurar marcas novas',
    why: 'Uma vez por dia, antes de você acordar. Pesquisa, qualifica e escreve o email. Nunca envia: isso é seu.',
  },
  'carolos-reconcile': {
    label: 'Reconciliar chamadas',
    why: 'De 5 em 5 minutos. Fecha os disparos cuja resposta se perdeu, para nenhum ficar em aberto.',
  },
};

export const DISPATCH_TONE: Record<string, 'ok' | 'bad' | 'hot' | 'mute'> = {
  ok: 'ok',
  failed: 'bad',
  timeout: 'bad',
  unconfigured: 'bad',
  skipped: 'hot',
  sent: 'mute',
};

export const DISPATCH_LABEL: Record<string, string> = {
  ok: 'correu',
  failed: 'falhou',
  timeout: 'sem resposta',
  unconfigured: 'por configurar',
  skipped: 'em recuo',
  sent: 'a correr',
};

/** Uma expressão de cron não diz nada a ninguém. Isto diz. */
export function readSchedule(expression: string): string {
  const [minute, hour] = expression.split(' ');
  const everyN = minute.match(/^\*\/(\d+)$/);
  const window = hour.match(/^(\d+)-(\d+)$/);

  if (everyN && window) {
    return `de ${everyN[1]} em ${everyN[1]} minutos, entre as ${window[1]}h e as ${window[2]}h UTC`;
  }
  if (everyN) return `de ${everyN[1]} em ${everyN[1]} minutos`;
  if (hour === '*' && minute.includes(',')) return `${minute.split(',').length}× por hora`;
  if (hour === '*') return 'de hora a hora';
  if (/^\d+$/.test(hour)) return `uma vez por dia, às ${hour}h${minute.padStart(2, '0')} UTC`;
  return expression;
}
