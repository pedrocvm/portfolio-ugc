/** Datas do CarolOS. Salvas em UTC, mostradas no fuso da Carol, e nunca
 *  comparadas como texto. O cálculo de dias úteis vive aqui e só aqui: um
 *  «+ 5 dias» espalhado por componentes é como as cadências de follow-up
 *  deixam de ser política e passam a ser folclore. */

export const CAROL_TIMEZONE = 'Europe/Lisbon';

const DAY_MS = 86_400_000;

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAROL_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** O dia a que um instante pertence é o dia dela, não o do servidor. */
export const localDay = (at: Date | string) =>
  dayFormatter.format(typeof at === 'string' ? new Date(at) : at);

/** Sábado e domingo. Feriados ficam de fora por decisão: são calendário
 *  nacional variável e a cadência de follow-up tolera um dia de folga melhor
 *  do que tolera uma tabela de feriados desatualizada.
 *  ponytail: se um follow-up cair no Natal e isso incomodar, entra aqui uma
 *  lista de feriados PT — não uma biblioteca. */
export function isBusinessDay(at: Date) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: CAROL_TIMEZONE,
    weekday: 'short',
  }).format(at);
  return weekday !== 'Sat' && weekday !== 'Sun';
}

/** Avança `days` dias úteis a partir de `from`, preservando a hora do dia. */
export function addBusinessDays(from: Date, days: number): Date {
  if (days <= 0) return new Date(from.getTime());
  let cursor = new Date(from.getTime());
  let left = days;
  while (left > 0) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (isBusinessDay(cursor)) left--;
  }
  return cursor;
}

/** Empurra para o próximo dia útil se já não estiver num. */
export function nextBusinessDay(from: Date): Date {
  let cursor = new Date(from.getTime());
  while (!isBusinessDay(cursor)) cursor = new Date(cursor.getTime() + DAY_MS);
  return cursor;
}

export const addDays = (from: Date, days: number) =>
  new Date(from.getTime() + days * DAY_MS);

/** Dias corridos entre dois instantes, positivo quando `b` é posterior. */
export const daysBetween = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / DAY_MS);

export const isOverdue = (due: string | null | undefined, now = new Date()) =>
  Boolean(due) && new Date(due as string).getTime() <= now.getTime();

/** «há 3 dias», «amanhã», «hoje». Usado nos cartões, onde a data exacta pesa
 *  mais do que ajuda. */
export function relativeDays(target: string | Date, now = new Date()) {
  const at = typeof target === 'string' ? new Date(target) : target;
  const diff = Math.round(
    (Date.parse(`${localDay(at)}T00:00:00Z`) - Date.parse(`${localDay(now)}T00:00:00Z`)) / DAY_MS,
  );
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  return diff > 0 ? `em ${diff} dias` : `há ${-diff} dias`;
}

const dateFormatter = new Intl.DateTimeFormat('pt-PT', {
  timeZone: CAROL_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export const formatDate = (at: string | Date) =>
  dateFormatter.format(typeof at === 'string' ? new Date(at) : at);

/** Meio-dia local para prazos derivados de regra: um follow-up marcado para
 *  «daqui a 3 dias úteis» não deve chegar à meia-noite nem depender da hora a
 *  que o evento anterior calhou acontecer. */
export function atMidday(day: Date): Date {
  const iso = localDay(day);
  return new Date(`${iso}T12:00:00.000Z`);
}
