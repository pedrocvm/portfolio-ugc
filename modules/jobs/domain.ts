/** O agendador do CarolOS depois do reset editorial.
 *
 * Apenas preserva a memória do Instagram. Todo o resto da operação antiga
 * deixou de ser responsabilidade do produto atual. */
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
    why: 'De 30 em 30 minutos. Preserva mídias, Stories e snapshots que não podem ser reconstruídos depois.',
  },
  'carolos-instagram-token': {
    label: 'Renovar o acesso ao Instagram',
    why: 'Uma vez por dia. Mantém a coleta viva sem depender de alguém lembrar de renovar o acesso.',
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
  sent: 'executando',
};

export function readSchedule(expression: string): string {
  const [minute, hour] = expression.split(' ');
  const everyN = minute.match(/^\*\/(\d+)$/);
  const window = hour.match(/^(\d+)-(\d+)$/);

  if (everyN && window) {
    return `de ${everyN[1]} em ${everyN[1]} minutos, entre as ${window[1]}h e as ${window[2]}h UTC`;
  }
  if (everyN) return `de ${everyN[1]} em ${everyN[1]} minutos`;
  if (hour === '*' && minute.includes(',')) return `${minute.split(',').length}× por hora`;
  if (hour === '*') return 'de hora em hora';
  if (/^\d+$/.test(hour)) return `uma vez por dia, às ${hour}h${minute.padStart(2, '0')} UTC`;
  return expression;
}
