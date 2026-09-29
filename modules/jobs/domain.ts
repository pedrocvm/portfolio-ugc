/** Explicação dos únicos trabalhos de fundo que ainda fazem parte do CarolOS. */

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
  unavailableReason: string | null;
};

export const JOB_PURPOSE: Record<string, { label: string; why: string }> = {
  'carolos-instagram-sync': {
    label: 'Sincronizar o Instagram',
    why: 'De 30 em 30 minutos. Guarda mídia, Stories e snapshots antes que a Meta deixe de entregá-los.',
  },
  'carolos-instagram-token': {
    label: 'Renovar o acesso ao Instagram',
    why: 'Uma vez por dia. Mantém a integração viva sem depender de alguém lembrar do token.',
  },
  'carolos-content-community': {
    label: 'Ler a qualidade dos comentários',
    why: 'Uma vez por dia. Separa elogio solto de identificação, pergunta e conversa, que é o sinal que mais importa para a Carol.',
  },
  'carolos-content-learning': {
    label: 'Aprender com o que foi publicado',
    why: 'Uma vez por dia. Compara conteúdos equivalentes e só aumenta a força de um padrão quando existe evidência repetida.',
  },
  'carolos-content-audit': {
    label: 'Atualizar a auditoria',
    why: 'Uma vez por dia. Transforma métricas e aprendizados em conclusões que podem mudar a próxima decisão.',
  },
  'carolos-content-week': {
    label: 'Montar a semana',
    why: 'Segunda de manhã. Prepara três propostas para a Carol validar em vez de entregar um calendário vazio.',
  },
  'carolos-reconcile': {
    label: 'Reconciliar chamadas',
    why: 'De 5 em 5 minutos. Fecha disparos sem resposta para que falhas do agendador não fiquem invisíveis.',
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
  sent: 'rodando',
};

export function readSchedule(expression: string): string {
  const [minute, hour] = expression.split(' ');
  const everyN = minute.match(/^\*\/(\d+)$/);
  const window = hour.match(/^(\d+)-(\d+)$/);

  if (everyN && window) {
    return `de ${everyN[1]} em ${everyN[1]} minutos, entre ${window[1]}h e ${window[2]}h UTC`;
  }
  if (everyN) return `de ${everyN[1]} em ${everyN[1]} minutos`;
  if (hour === '*' && minute.includes(',')) return `${minute.split(',').length} vezes por hora`;
  if (hour === '*') return 'de hora em hora';
  if (/^\d+$/.test(hour)) return `uma vez por dia, às ${hour}h${minute.padStart(2, '0')} UTC`;
  return expression;
}
