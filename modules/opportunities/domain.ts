/** O estado comercial de uma oportunidade e as regras que o movem.
 *
 *  Puro de propósito: sem Next, sem Supabase, sem SDK. É o que permite testar
 *  «resposta positiva move para replied» sem base de dados, e é o que impede
 *  que a lógica acabe espalhada por triggers de SQL ou por componentes. */

export const STAGES = [
  'discovered',
  'qualified',
  'outreach',
  'replied',
  'commercial_qualification',
  'proposal',
  'negotiation',
  'won',
  'lost',
  'nurture',
] as const;

export type Stage = (typeof STAGES)[number];

/** Etiquetas são tradução de interface. O valor guardado é sempre o id estável. */
export const STAGE_LABEL: Record<Stage, string> = {
  discovered: 'Descoberta',
  qualified: 'Qualificada',
  outreach: 'Abordada',
  replied: 'Respondeu',
  commercial_qualification: 'Qualificação comercial',
  proposal: 'Proposta',
  negotiation: 'Negociação',
  won: 'Fechada',
  lost: 'Perdida',
  nurture: 'Nurture',
};

/** Distância até à receita. Alimenta a prioridade do Hoje: uma negociação
 *  parada custa mais do que uma descoberta parada. */
export const STAGE_PROXIMITY: Record<Stage, number> = {
  discovered: 0,
  qualified: 1,
  outreach: 2,
  replied: 4,
  commercial_qualification: 5,
  proposal: 7,
  negotiation: 8,
  won: 10,
  lost: 0,
  nurture: 1,
};

export const OPEN_STAGES: readonly Stage[] = [
  'discovered', 'qualified', 'outreach', 'replied',
  'commercial_qualification', 'proposal', 'negotiation',
];

export const isOpen = (stage: Stage) => OPEN_STAGES.includes(stage);
export const isClosed = (stage: Stage) => stage === 'won' || stage === 'lost';

export const COMMERCIAL_MODELS = [
  'paid', 'barter', 'reimbursement', 'hybrid', 'influencer', 'affiliate', 'spec', 'unclear',
] as const;
export type CommercialModel = (typeof COMMERCIAL_MODELS)[number];

export const MODEL_LABEL: Record<CommercialModel, string> = {
  paid: 'Pago',
  barter: 'Permuta',
  reimbursement: 'Reembolso',
  hybrid: 'Misto',
  influencer: 'Influencer',
  affiliate: 'Afiliado',
  spec: 'Spec',
  unclear: 'Por esclarecer',
};

/** Os factos que um evento traz e que podem mover o estado. Tudo opcional:
 *  o redutor só age sobre o que foi realmente observado. */
export type StageSignal = {
  eventType: string;
  /** Categorias de resposta detectadas na mensagem. */
  replyTypes?: readonly string[];
  /** Aceitação explícita. Entusiasmo não conta. */
  explicitAcceptance?: boolean;
  /** Recusa explícita, com motivo. */
  explicitRejection?: boolean;
  rejectionReason?: string | null;
  /** «agora não», «na próxima campanha». Não é perda. */
  deferral?: boolean;
  direction?: 'inbound' | 'outbound';
  confidence?: number;
};

export type Transition = {
  to: Stage;
  reason: string;
  /** Verdadeiro quando a mudança é segura o suficiente para se aplicar sozinha. */
  autoApplicable: boolean;
};

const ASKS_COMMERCIAL = new Set([
  'rate_request', 'ads_rights', 'usage_request', 'barter_offer',
  'affiliate_offer', 'media_kit_request', 'scope_question',
]);

/** Dado o estado actual e um sinal, o que deve acontecer. `null` significa
 *  «nada muda», que é a resposta certa na maioria dos eventos. */
export function reduceStage(current: Stage, signal: StageSignal): Transition | null {
  if (signal.explicitAcceptance) {
    return {
      to: 'won',
      reason: 'A marca aceitou explicitamente.',
      // Fechar um negócio é irreversível na prática. Passa sempre por pessoa.
      autoApplicable: false,
    };
  }

  if (signal.explicitRejection) {
    // «Agora não» é nurture, não perda: a marca não disse não ao trabalho,
    // disse não ao momento.
    if (signal.deferral) {
      return {
        to: 'nurture',
        reason: signal.rejectionReason
          ? `Adiado: ${signal.rejectionReason}`
          : 'A marca adiou sem fechar a porta.',
        autoApplicable: true,
      };
    }
    return {
      to: 'lost',
      reason: signal.rejectionReason ?? 'Recusa explícita sem motivo documentado.',
      autoApplicable: false,
    };
  }

  switch (signal.eventType) {
    case 'outreach.sent':
      return current === 'discovered' || current === 'qualified'
        ? { to: 'outreach', reason: 'Primeira abordagem enviada.', autoApplicable: true }
        : null;

    case 'reply.received': {
      if (isClosed(current)) return null;
      const asks = (signal.replyTypes ?? []).filter((t) => ASKS_COMMERCIAL.has(t));
      if (asks.length && current !== 'proposal' && current !== 'negotiation') {
        return {
          to: 'commercial_qualification',
          reason: `A marca pediu ${asks.join(', ')}: falta fechar âmbito e direitos.`,
          autoApplicable: true,
        };
      }
      if (current === 'outreach' || current === 'discovered' || current === 'qualified' || current === 'nurture') {
        return { to: 'replied', reason: 'A marca respondeu.', autoApplicable: true };
      }
      return null;
    }

    case 'proposal.sent':
    case 'quote.sent':
      return current === 'proposal'
        ? null
        : { to: 'proposal', reason: 'Proposta ou valor enviados.', autoApplicable: true };

    case 'proposal.revised':
    case 'negotiation.counteroffer':
      return current === 'negotiation'
        ? null
        : { to: 'negotiation', reason: 'A marca contrapôs ou pediu alterações.', autoApplicable: true };

    case 'brand.qualified':
      return current === 'discovered'
        ? { to: 'qualified', reason: 'Fit avaliado.', autoApplicable: true }
        : null;

    case 'opportunity.nurtured':
      return isClosed(current)
        ? null
        : { to: 'nurture', reason: 'Movida para nurture.', autoApplicable: true };

    default:
      return null;
  }
}

/** Invariantes que uma escrita nunca pode violar. Devolve os problemas em vez
 *  de atirar: quem chama decide se bloqueia ou se pede revisão. */
export type OpportunityState = {
  stage: Stage;
  wonAt: string | null;
  lostAt: string | null;
  lossReason: string | null;
  nextActionText: string;
  nextActionDueAt: string | null;
  waitingUntil: string | null;
};

export function violations(state: OpportunityState): string[] {
  const out: string[] = [];

  if (state.stage === 'won' && !state.wonAt) {
    out.push('Uma oportunidade fechada precisa da data de aceitação.');
  }
  if (state.stage === 'lost' && !state.lossReason) {
    out.push('Uma oportunidade perdida precisa de um motivo. Silêncio não é motivo.');
  }
  if (
    isOpen(state.stage) &&
    !state.waitingUntil &&
    !state.nextActionDueAt &&
    !state.nextActionText.trim()
  ) {
    out.push('Uma oportunidade activa precisa de próxima ação ou de um estado de espera explícito.');
  }
  return out;
}
