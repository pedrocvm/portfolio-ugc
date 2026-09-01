/** Insights proativos, como regras puras.
 *
 *  O assistente não pode existir só quando lhe perguntam. Isto olha para o
 *  estado do negócio e diz o que está prestes a custar dinheiro.
 *
 *  Determinístico de propósito: um aviso que aparece por uma razão que ninguém
 *  consegue reconstruir é ruído, e ruído ensina-se a ignorar. Cada insight traz
 *  a sua chave de deduplicação, que é o que impede o mesmo aviso de voltar
 *  todos os dias até ela deixar de olhar. */

import { STAGE_LABEL, type Stage } from '@/modules/opportunities/domain';

export type Insight = {
  kind: string;
  severity: 'info' | 'warn' | 'urgent';
  title: string;
  detail: string;
  href: string | null;
  brandId: string | null;
  opportunityId: string | null;
  dedupeKey: string;
};

export type InsightInput = {
  now: Date;
  opportunities: {
    id: string;
    brandId: string | null;
    brandName: string;
    stage: string;
    lastActivityAt: string | null;
    waitingUntil: string | null;
    expectedCashCents: number | null;
  }[];
  followUps: { id: string; brandName: string; dueAt: string; opportunityId: string | null }[];
  rights: { id: string; brandName: string; endAt: string | null; opportunityId: string | null }[];
  payments: { id: string; brandName: string; amountCents: number; dueAt: string | null }[];
  /** Colaborações entregues à espera de métricas ou de um upsell. */
  delivered: { id: string; brandName: string; deliveredAt: string; brandId: string | null }[];
};

const days = (from: string | Date, to: Date) =>
  Math.floor((to.getTime() - new Date(from).getTime()) / 86400000);

/** Uma janela, não um dia exacto: se o trabalho de fundo falhar uma passagem,
 *  o aviso não desaparece para sempre. */
const STALE_DAYS = 7;
const UPSELL_DAYS = 7;
const RIGHTS_WARNING_DAYS = 21;

/** Etapas onde o silêncio custa. Uma descoberta parada não é notícia; uma
 *  negociação parada é dinheiro a esfriar. */
const HOT_STAGES = new Set(['replied', 'commercial_qualification', 'proposal', 'negotiation']);

export function buildInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const { now } = input;

  for (const o of input.opportunities) {
    if (!HOT_STAGES.has(o.stage)) continue;
    // Uma espera combinada não é abandono.
    if (o.waitingUntil && new Date(o.waitingUntil) > now) continue;
    const idle = o.lastActivityAt ? days(o.lastActivityAt, now) : null;
    if (idle === null || idle < STALE_DAYS) continue;

    out.push({
      kind: 'opportunity_stale',
      severity: idle >= 21 ? 'urgent' : 'warn',
      title: `${o.brandName} está parada há ${idle} dias`,
      // `o.stage` é o identificador da base. «Estava em replied» é o sistema a
      // falar consigo próprio à frente de quem o usa.
      detail: `Estava em ${(STAGE_LABEL[o.stage as Stage] ?? o.stage).toLowerCase()}. Quanto mais tempo passa, mais caro é reabrir a conversa.`,
      href: `/dashboard/opportunities/${o.id}`,
      brandId: o.brandId,
      opportunityId: o.id,
      // A semana entra na chave: o aviso pode voltar daqui a sete dias se
      // continuar parada, mas não amanhã.
      dedupeKey: `stale:${o.id}:${Math.floor(idle / 7)}`,
    });
  }

  // Follow-ups vencidos não geram insight nenhum: o planeador já lhes deu um
  // cartão na fila, com a mesma marca e a mesma data. Dois avisos para a mesma
  // coisa é o que faz uma lista deixar de se ler.

  for (const r of input.rights) {
    if (!r.endAt) continue;
    const left = -days(r.endAt, now);
    if (left < 0 || left > RIGHTS_WARNING_DAYS) continue;
    out.push({
      kind: 'rights_expiring',
      severity: left <= 7 ? 'urgent' : 'warn',
      title: `A licença da ${r.brandName} acaba em ${left} ${left === 1 ? 'dia' : 'dias'}`,
      detail: 'Renovar antes de expirar é mais barato do que voltar a negociar do zero.',
      href: r.opportunityId ? `/dashboard/opportunities/${r.opportunityId}` : '/dashboard/revenue',
      brandId: null,
      opportunityId: r.opportunityId,
      dedupeKey: `rights:${r.id}:${left <= 7 ? 'urgente' : 'aviso'}`,
    });
  }

  for (const p of input.payments) {
    if (!p.dueAt) continue;
    const late = days(p.dueAt, now);
    if (late < 1) continue;
    out.push({
      kind: 'payment_late',
      severity: late >= 15 ? 'urgent' : 'warn',
      title: `${p.brandName} tem ${(p.amountCents / 100).toFixed(0)}€ por receber há ${late} dias`,
      detail: 'Dinheiro combinado que não entrou é a coisa mais fácil de esquecer.',
      href: '/dashboard/revenue',
      brandId: null,
      opportunityId: null,
      dedupeKey: `payment:${p.id}:${Math.floor(late / 7)}`,
    });
  }

  for (const d of input.delivered) {
    const since = days(d.deliveredAt, now);
    if (since < UPSELL_DAYS || since > 45) continue;
    out.push({
      kind: 'upsell_window',
      severity: 'info',
      title: `A ${d.brandName} recebeu o conteúdo há ${since} dias`,
      detail: 'Boa altura para pedir métricas ou propor a segunda peça — já usaram o criativo.',
      href: d.brandId ? `/dashboard/brands/${d.brandId}` : '/dashboard/production',
      brandId: d.brandId,
      opportunityId: null,
      dedupeKey: `upsell:${d.id}`,
    });
  }

  // A pior notícia primeiro, e nunca mais do que cabe num relance.
  const weight = { urgent: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => weight[a.severity] - weight[b.severity]).slice(0, 12);
}
