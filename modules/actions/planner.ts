/** Next Best Action.
 *
 *  A tela Hoje não monta cartões: lê `action_item`. Este módulo é quem decide
 *  o que entra nessa lista, porquê, com que urgência e com que CTA.
 *
 *  Determinístico por desenho. A IA pode explicar melhor e escrever o
 *  rascunho, mas a ordem da fila sai de regras que se conseguem testar — uma
 *  fila ordenada por um modelo é uma fila que muda de opinião entre dois
 *  carregamentos da página. */

import { daysBetween } from '@/lib/time';
import { REPLY_TYPE_LABEL, type ReplyType } from '@/modules/ai/schemas';
import { STAGE_PROXIMITY, isOpen, type Stage } from '@/modules/opportunities/domain';

export const ACTION_TYPES = [
  'respond', 'follow_up', 'send_portfolio', 'ask_scope', 'send_rate',
  'negotiate', 'create_proposal', 'start_production', 'request_brief',
  'deliver', 'request_metrics', 'upsell', 'renew_rights', 'nurture',
  'close', 'review', 'wait_expired', 'integration_fix', 'chase_payment',
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export type Risk = 'none' | 'low' | 'medium' | 'high';

export const ACTION_CTA: Record<ActionType, string> = {
  respond: 'Responder',
  follow_up: 'Enviar follow-up',
  send_portfolio: 'Enviar portfólio',
  ask_scope: 'Perguntar escopo',
  send_rate: 'Enviar valor',
  negotiate: 'Rever negociação',
  create_proposal: 'Criar proposta',
  start_production: 'Arrancar produção',
  request_brief: 'Pedir briefing',
  deliver: 'Entregar',
  request_metrics: 'Pedir métricas',
  upsell: 'Propor próximo trabalho',
  renew_rights: 'Preparar renovação',
  nurture: 'Marcar reaproximação',
  close: 'Fechar oportunidade',
  review: 'Rever',
  wait_expired: 'A espera terminou',
  integration_fix: 'Reparer ligação',
  chase_payment: 'Cobrar',
};

/** Peso base por tipo. Não é a ordenação final — é o ponto de partida antes de
 *  prazo, etapa e idade entrarem na conta. */
const BASE: Record<ActionType, number> = {
  respond: 90,
  chase_payment: 85,
  negotiate: 80,
  send_rate: 78,
  ask_scope: 75,
  create_proposal: 72,
  deliver: 70,
  request_brief: 68,
  start_production: 66,
  follow_up: 60,
  renew_rights: 58,
  send_portfolio: 55,
  upsell: 45,
  request_metrics: 40,
  wait_expired: 38,
  review: 35,
  close: 30,
  nurture: 20,
  integration_fix: 95,
};

const RISK_BONUS: Record<Risk, number> = { none: 0, low: 5, medium: 15, high: 30 };

export type PriorityInput = {
  type: ActionType;
  stage?: Stage | null;
  /** Prazo do item. Vencido pesa muito mais do que próximo. */
  dueAt?: string | null;
  /** Última atividade da oportunidade. Silêncio prolongado sobe a prioridade. */
  lastActivityAt?: string | null;
  /** Fit da marca, 0-100. */
  fitScore?: number | null;
  /** Valor esperado em cêntimos. */
  expectedCents?: number | null;
  risk?: Risk;
  /** Verdadeiro quando o próximo passo está do lado da Carol. */
  inboundWaiting?: boolean;
  snoozedUntil?: string | null;
  now?: Date;
};

/** Pontuação inteira e estável. Inteira porque é o que ordena no SQL, e um
 *  float ali dentro torna a ordem dependente de arredondamento. */
export function priorityScore(input: PriorityInput): number {
  const now = input.now ?? new Date();
  let score = BASE[input.type] ?? 30;

  if (input.dueAt) {
    const days = daysBetween(now, new Date(input.dueAt));
    if (days < 0) score += Math.min(60, 25 + Math.abs(days) * 4); // vencido
    else if (days === 0) score += 20;
    else if (days <= 2) score += 10;
    else if (days <= 7) score += 3;
  }

  if (input.inboundWaiting) score += 25;

  if (input.stage) score += STAGE_PROXIMITY[input.stage] * 2;

  if (typeof input.fitScore === 'number') {
    score += Math.round((input.fitScore - 50) / 10); // -5 .. +5
  }

  if (input.expectedCents && input.expectedCents > 0) {
    // Escala logarítmica: 100 € e 10 000 € não devem separar-se por cem pontos.
    score += Math.min(12, Math.round(Math.log10(input.expectedCents / 100) * 4));
  }

  if (input.lastActivityAt) {
    const idle = daysBetween(new Date(input.lastActivityAt), now);
    if (idle >= 30) score += 8;
    else if (idle >= 14) score += 5;
    else if (idle >= 7) score += 2;
  }

  score += RISK_BONUS[input.risk ?? 'none'];

  if (input.snoozedUntil && new Date(input.snoozedUntil).getTime() > now.getTime()) {
    score -= 1000; // adiado sai da fila sem deixar de existir
  }

  return Math.round(score);
}

/** O contrato do cartão. Tudo o que o Hoje precisa de mostrar sem ir buscar
 *  mais nada, e sem montar a explicação em JSX. */
export type PlannedAction = {
  type: ActionType;
  title: string;
  reason: string;
  cta: string;
  dueAt: string | null;
  risk: Risk;
  requiresApproval: boolean;
  evidence: Record<string, unknown>;
  dedupeKey: string;
  priorityScore: number;
};

export type OpportunitySnapshot = {
  id: string;
  brandId: string;
  brandName: string;
  stage: Stage;
  productName: string;
  fitScore: number | null;
  expectedCents: number | null;
  lastActivityAt: string | null;
  waitingUntil: string | null;
  nextActionText: string;
  /** Última mensagem recebida ainda sem resposta da Carol. */
  awaitingReplySince: string | null;
  /** Pedidos comerciais detectados e ainda em aberto. */
  openAsks: readonly string[];
  /** Riscos comerciais detectados na conversa. */
  riskFlags: readonly string[];
  /** Follow-up agendado e já vencido. */
  dueFollowUp: { id: string; dueAt: string; reason: string } | null;
  hasQuote: boolean;
  hasProposalDoc: boolean;
};

const ASK_TO_ACTION: Record<string, { type: ActionType; title: string }> = {
  portfolio_request: { type: 'send_portfolio', title: 'Enviar portfólio e o exemplo mais relevante' },
  rate_request: { type: 'send_rate', title: 'Responder ao pedido de valor' },
  ads_rights: { type: 'ask_scope', title: 'Clarificar período e canais do uso pago' },
  usage_request: { type: 'ask_scope', title: 'Clarificar período e canais do uso pago' },
  barter_offer: { type: 'negotiate', title: 'Avaliar a permuta oferecida' },
  affiliate_offer: { type: 'negotiate', title: 'Reenquadrar: a proposta é UGC, não afiliação' },
  media_kit_request: { type: 'negotiate', title: 'Reenquadrar: UGC para os canais da marca' },
  call_request: { type: 'respond', title: 'Marcar a call e preparar o escopo' },
  brief: { type: 'request_brief', title: 'Validar o briefing recebido' },
};

/** O que a marca pediu, como substantivo, para caber numa frase.
 *
 *  As etiquetas do inbox são frases verbais («Pede preço») e ficam bem numa
 *  lista, mas «a marca pediu pede preço» não é português. E um `rate_request`
 *  no meio de uma frase é o sistema a falar consigo próprio à frente de quem
 *  o usa. */
const ASK_NOUN: Record<string, string> = {
  portfolio_request: 'o portfólio',
  rate_request: 'o seu valor',
  ads_rights: 'direitos para anúncios',
  usage_request: 'direitos de uso',
  barter_offer: 'uma permuta',
  affiliate_offer: 'uma parceria de afiliação',
  media_kit_request: 'o media kit',
  call_request: 'uma call',
  brief: 'o briefing',
};

const askNames = (asks: readonly string[]) => {
  const names = asks.map((a) => ASK_NOUN[a] ?? REPLY_TYPE_LABEL[a as ReplyType]?.toLowerCase() ?? a);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
};

/** Gera as ações que uma oportunidade justifica agora. Uma oportunidade ativa
 *  sem nada aqui e sem estado de espera é um bug — o Hoje mostra-a como
 *  «sem próxima ação» em vez de a esconder. */
export function planForOpportunity(
  opp: OpportunitySnapshot,
  now = new Date(),
): PlannedAction[] {
  const out: PlannedAction[] = [];
  const common = {
    stage: opp.stage,
    fitScore: opp.fitScore,
    expectedCents: opp.expectedCents,
    lastActivityAt: opp.lastActivityAt,
    now,
  };

  const risk: Risk = opp.riskFlags.length
    ? opp.riskFlags.length > 1
      ? 'high'
      : 'medium'
    : 'none';

  // 1. A marca respondeu e a bola está do lado dela.
  if (opp.awaitingReplySince && isOpen(opp.stage)) {
    const waitingDays = daysBetween(new Date(opp.awaitingReplySince), now);
    const asks = opp.openAsks.filter((a) => ASK_TO_ACTION[a]);
    const primary = asks.length ? ASK_TO_ACTION[asks[0]] : null;
    const type = primary?.type ?? 'respond';
    out.push({
      type,
      title: primary?.title ?? 'Responder à mensagem',
      // Sem data ISO no meio de uma frase. «2026-08-31» é o sistema a falar
      // consigo próprio; ela quer saber há quanto tempo é que a pessoa espera.
      reason: asks.length
        ? `A marca pediu ${askNames(asks)}, e ainda não teve resposta.`
        : waitingDays <= 0
          ? 'Chegou hoje e ainda não teve resposta.'
          : `Está à espera de resposta há ${waitingDays} ${waitingDays === 1 ? 'dia' : 'dias'}.`,
      cta: ACTION_CTA[type],
      dueAt: opp.awaitingReplySince,
      risk,
      requiresApproval: true,
      evidence: { awaitingReplySince: opp.awaitingReplySince, asks: opp.openAsks, riskFlags: opp.riskFlags },
      dedupeKey: `opp:${opp.id}:respond:${opp.awaitingReplySince}`,
      priorityScore: priorityScore({ ...common, type, inboundWaiting: true, risk, dueAt: opp.awaitingReplySince }),
    });
  }

  // 2. Follow-up vencido.
  if (opp.dueFollowUp && !opp.awaitingReplySince) {
    out.push({
      type: 'follow_up',
      title: 'Enviar o follow-up',
      reason: opp.dueFollowUp.reason,
      cta: ACTION_CTA.follow_up,
      dueAt: opp.dueFollowUp.dueAt,
      risk: 'none',
      requiresApproval: true,
      evidence: { followUpId: opp.dueFollowUp.id },
      dedupeKey: `opp:${opp.id}:followup:${opp.dueFollowUp.id}`,
      priorityScore: priorityScore({ ...common, type: 'follow_up', dueAt: opp.dueFollowUp.dueAt }),
    });
  }

  // 3. Espera explícita que já passou.
  if (opp.waitingUntil && new Date(opp.waitingUntil).getTime() <= now.getTime()) {
    out.push({
      type: 'wait_expired',
      title: 'A espera combinada terminou',
      reason: 'Passou a data até à qual a oportunidade estava em espera.',
      cta: ACTION_CTA.wait_expired,
      dueAt: opp.waitingUntil,
      risk: 'none',
      requiresApproval: false,
      evidence: { waitingUntil: opp.waitingUntil },
      dedupeKey: `opp:${opp.id}:wait:${opp.waitingUntil}`,
      priorityScore: priorityScore({ ...common, type: 'wait_expired', dueAt: opp.waitingUntil }),
    });
  }

  // 4. Qualificação comercial sem proposta: falta transformar interesse em oferta.
  if (opp.stage === 'commercial_qualification' && !opp.hasQuote && !opp.awaitingReplySince) {
    out.push({
      type: 'create_proposal',
      title: 'Preparar a oferta',
      reason: 'A oportunidade está qualificada mas ainda não tem valor nem escopo enviados.',
      cta: ACTION_CTA.create_proposal,
      dueAt: null,
      risk,
      requiresApproval: true,
      evidence: { stage: opp.stage },
      dedupeKey: `opp:${opp.id}:proposal`,
      priorityScore: priorityScore({ ...common, type: 'create_proposal', risk }),
    });
  }

  // 5. Ativa e sem nada que a puxe: a fila tem de dizer isso em voz alta.
  if (
    isOpen(opp.stage) &&
    out.length === 0 &&
    !opp.waitingUntil &&
    !opp.dueFollowUp
  ) {
    out.push({
      type: 'review',
      title: 'Sem próxima ação definida',
      reason:
        opp.nextActionText.trim() ||
        'Nenhum evento recente e nenhum follow-up agendado. Decide o próximo passo ou põe em nurture.',
      cta: ACTION_CTA.review,
      dueAt: null,
      risk: 'low',
      requiresApproval: false,
      evidence: { stage: opp.stage, lastActivityAt: opp.lastActivityAt },
      dedupeKey: `opp:${opp.id}:noaction`,
      priorityScore: priorityScore({ ...common, type: 'review', risk: 'low' }),
    });
  }

  return out.sort((a, b) => b.priorityScore - a.priorityScore);
}

/* ── Replanear em lote ───────────────────────────────────────────────────── */

/** Quais das ações abertas deixaram de se justificar.
 *
 *  As chaves são por oportunidade (`opp:<id>:…`), por isso juntá-las todas num
 *  conjunto só é seguro: uma chave de uma oportunidade nunca colide com a de
 *  outra, e assim cancela-se tudo numa consulta em vez de uma por oportunidade. */
export function staleActionIds(
  open: readonly { id: string; dedupe_key: string | null }[],
  keep: ReadonlySet<string>,
): string[] {
  return open.filter((a) => a.dedupe_key && !keep.has(a.dedupe_key)).map((a) => a.id);
}

/** Agrupa as oportunidades que ficam com o mesmo texto de próxima ação.
 *
 *  O texto é materializado na oportunidade para o funil não ter de ler a fila
 *  toda. Era um UPDATE por oportunidade — trinta viagens à base para escrever,
 *  quase sempre, a mesma coisa: a maioria fica sem próxima ação nenhuma. */
export function nextActionGroups(
  rows: readonly { id: string; text: string; dueAt: string | null }[],
): { text: string; dueAt: string | null; ids: string[] }[] {
  const groups = new Map<string, { text: string; dueAt: string | null; ids: string[] }>();
  for (const r of rows) {
    const key = `${r.text} ${r.dueAt ?? ''}`;
    const g = groups.get(key) ?? { text: r.text, dueAt: r.dueAt, ids: [] };
    g.ids.push(r.id);
    groups.set(key, g);
  }
  return [...groups.values()];
}
