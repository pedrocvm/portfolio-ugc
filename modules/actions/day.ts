/** O dia, em três estados.
 *
 *  A fila antiga misturava duas coisas muito diferentes: o que precisa de uma
 *  decisão dela, e o que o sistema já está fazendo e vai acabar sozinho. Postas
 *  na mesma lista, as segundas parecem trabalho — e uma lista de dez em que
 *  seis não são para ela é uma lista que ensina a não confiar na lista.
 *
 *  Aqui separa-se. Este módulo é puro: recebe linhas, devolve frases. Quem lê
 *  da base é o `service`. */

import { daysBetween } from '@/lib/time';

export type BackgroundKind =
  | 'waiting'
  | 'follow_up_scheduled'
  | 'snoozed'
  | 'searching'
  | 'payment_pending';

export type BackgroundItem = {
  kind: BackgroundKind;
  /** A frase que ela lê. Sujeito é o sistema, não ela. */
  label: string;
  /** Quando isto volta a mexer. Ordena a lista e nada mais. */
  at: string | null;
  brandName: string | null;
};

export type BackgroundInput = {
  /** Oportunidades em espera combinada. `waiting_until` é o campo que o
   *  planeador respeita: enquanto não passar, não nasce cartão nenhum. Dizer
   *  «à espera da resposta» seria inventar — a pausa tanto pode ser a marca a
   *  demorar como ela a ter adiado o assunto para Outubro. */
  waiting: readonly { brandName: string; until: string }[];
  /** Follow-ups agendados para o futuro. Vencidos não entram: esses já são fila. */
  scheduledFollowUps: readonly { brandName: string; dueAt: string }[];
  /** Cartões que ela adiou. */
  snoozed: readonly { brandName: string; title: string; until: string }[];
  /** Buscas de prospeção a decorrer agora. */
  runningSearches: number;
  /** Pagamentos com data futura. Em atraso não entram: esses são fila. */
  pendingPayments: readonly { brandName: string; amountCents: number; currency: string; dueAt: string }[];
  now?: Date;
};

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/** Dinheiro em cêntimos até ao último instante. Formatar não é calcular. */
const dinheiro = (cents: number, currency: string) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(cents / 100);

/** Quando é que isto volta a mexer, dito como quem fala. */
function quando(at: string, now: Date): string {
  const d = daysBetween(now, new Date(at));
  if (d <= 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d <= 7) return `daqui a ${dias(d)}`;
  return `daqui a ${Math.round(d / 7)} semanas`;
}

/** O que o CarolOS está tratando, em frases que não pedem nada.
 *
 *  Ordenado pelo que volta a mexer mais cedo. Sem data vai para o fim: uma
 *  busca a decorrer não tem prazo, tem duração. */
export function describeBackground(input: BackgroundInput): BackgroundItem[] {
  const now = input.now ?? new Date();
  const out: BackgroundItem[] = [];

  if (input.runningSearches > 0) {
    out.push({
      kind: 'searching',
      label:
        input.runningSearches === 1
          ? 'À procura de marcas novas.'
          : `${input.runningSearches} buscas de marcas a decorrer.`,
      at: null,
      brandName: null,
    });
  }

  for (const w of input.waiting) {
    out.push({
      kind: 'waiting',
      label: `Nada a fazer com a ${w.brandName} até ${quando(w.until, now)}.`,
      at: w.until,
      brandName: w.brandName,
    });
  }

  for (const f of input.scheduledFollowUps) {
    out.push({
      kind: 'follow_up_scheduled',
      label: `Vou insistir com a ${f.brandName} ${quando(f.dueAt, now)}.`,
      at: f.dueAt,
      brandName: f.brandName,
    });
  }

  for (const p of input.pendingPayments) {
    out.push({
      kind: 'payment_pending',
      label: `${dinheiro(p.amountCents, p.currency)} da ${p.brandName} a receber ${quando(p.dueAt, now)}.`,
      at: p.dueAt,
      brandName: p.brandName,
    });
  }

  for (const s of input.snoozed) {
    out.push({
      kind: 'snoozed',
      label: `«${s.title}» da ${s.brandName} volta ${quando(s.until, now)}.`,
      at: s.until,
      brandName: s.brandName,
    });
  }

  return out.sort((a, b) => {
    if (a.at === b.at) return 0;
    if (a.at === null) return 1;
    if (b.at === null) return -1;
    return a.at < b.at ? -1 : 1;
  });
}

/** A frase de fecho do dia.
 *
 *  Só aparece quando não há nada para ela. É o oposto de uma notificação: diz
 *  que pode fechar, e diz o que continua acontecendo sem ela — que é o que
 *  torna «não há nada» crível em vez de suspeito. */
export function closingLine(background: readonly BackgroundItem[]): string {
  if (background.length === 0) {
    return 'Não há nada à sua espera, e também não há nada em curso. Pode fechar.';
  }
  const contas = new Map<BackgroundKind, number>();
  for (const b of background) contas.set(b.kind, (contas.get(b.kind) ?? 0) + 1);

  const partes: string[] = [];
  const espera = contas.get('waiting') ?? 0;
  const insistir = contas.get('follow_up_scheduled') ?? 0;
  const pagamentos = contas.get('payment_pending') ?? 0;
  if (contas.get('searching')) partes.push('a procurar marcas novas');
  if (espera) partes.push(`com ${espera === 1 ? 'uma marca' : `${espera} marcas`} em espera`);
  if (insistir) partes.push(`com ${insistir === 1 ? 'um follow-up' : `${insistir} follow-ups`} marcados`);
  if (pagamentos) partes.push(`a contar ${pagamentos === 1 ? 'um pagamento' : `${pagamentos} pagamentos`}`);

  if (partes.length === 0) return 'Não há nada à sua espera. Pode fechar.';
  const lista =
    partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
  return `Não há nada à sua espera. O CarolOS fica ${lista}.`;
}
