/** Motor de follow-up. Determinístico: as datas saem de regras versionadas e de
 *  dias úteis, não de um modelo a inventar «daqui a uns dias».
 *
 *  A IA só entra a escrever o texto do rascunho, e mesmo esse passa por
 *  aprovação. O que aqui se decide é quando, porquê e quando parar. */

import { addBusinessDays, addDays, atMidday, nextBusinessDay } from '@/lib/time';

export const FOLLOWUP_POLICY_VERSION = 'followup-v1';

export type Situation =
  | 'cold_outreach'
  | 'material_requested'
  | 'promised_date'
  | 'after_call_or_proposal'
  | 'nurture';

export const SITUATION_LABEL: Record<Situation, string> = {
  cold_outreach: 'Abordagem sem resposta',
  material_requested: 'Pediu material e ficou calada',
  promised_date: 'Prometeu responder numa data',
  after_call_or_proposal: 'Depois de call ou proposta',
  nurture: 'Nurture',
};

/** Cadência canónica do Product Briefing §15 e do Handoff §14.1.
 *  `businessDays` é o intervalo desde o evento que a disparou; o valor mais
 *  baixo de cada intervalo é o usado, porque atrasar um follow-up custa mais
 *  do que antecipá-lo um dia. */
type Step = { businessDays: number; note: string };

export const CADENCE: Record<Exclude<Situation, 'nurture'>, Step[]> = {
  cold_outreach: [
    { businessDays: 3, note: 'Primeiro follow-up: 3 a 5 dias úteis após a abordagem.' },
    { businessDays: 5, note: 'Segundo e último: 5 a 7 dias úteis depois.' },
  ],
  material_requested: [
    { businessDays: 2, note: 'Pediu material: 2 a 4 dias úteis após o envio.' },
    { businessDays: 5, note: 'Segundo: 5 a 7 dias úteis depois.' },
  ],
  promised_date: [
    { businessDays: 1, note: 'No dia útil seguinte ao prazo que a marca prometeu.' },
    { businessDays: 4, note: 'Segundo: 4 a 5 dias úteis depois.' },
  ],
  after_call_or_proposal: [
    { businessDays: 2, note: 'Depois de call ou proposta: 2 a 3 dias úteis.' },
    { businessDays: 5, note: 'Segundo: 5 a 7 dias úteis depois.' },
  ],
};

/** Fim da sequência activa. Nurture não é insistência: é uma data futura para
 *  voltar a existir, não um terceiro «viste a minha mensagem?». */
export const NURTURE_DAYS = 45;

export type Schedule =
  | {
      kind: 'followup';
      situation: Situation;
      sequenceIndex: number;
      dueAt: string;
      reason: string;
      policyVersion: string;
    }
  | {
      kind: 'nurture';
      situation: 'nurture';
      sequenceIndex: number;
      dueAt: string;
      reason: string;
      policyVersion: string;
    }
  | { kind: 'none'; reason: string };

export type ScheduleInput = {
  situation: Situation;
  /** Quando aconteceu o que dispara a contagem. */
  since: Date;
  /** Quantos follow-ups já foram enviados nesta sequência. */
  sentCount: number;
  /** Data que a marca prometeu, quando existe. Manda sobre a cadência genérica. */
  promisedAt?: Date | null;
  /** Espera explícita: a marca disse para voltar depois desta data. */
  waitingUntil?: Date | null;
};

/** Prioridade das regras, do Technical Briefing §20.1:
 *  1. data prometida pela marca; 2. espera explícita; 3. cadência da etapa;
 *  4. nurture. */
export function scheduleFollowUp(input: ScheduleInput): Schedule {
  const { situation, since, sentCount } = input;

  if (input.waitingUntil && input.waitingUntil.getTime() > Date.now()) {
    return {
      kind: 'none',
      reason: 'A oportunidade está em espera explícita até uma data combinada.',
    };
  }

  if (input.promisedAt) {
    const steps = CADENCE.promised_date;
    if (sentCount < steps.length) {
      const step = steps[sentCount];
      const base = sentCount === 0 ? input.promisedAt : since;
      return {
        kind: 'followup',
        situation: 'promised_date',
        sequenceIndex: sentCount + 1,
        dueAt: atMidday(nextBusinessDay(addBusinessDays(base, step.businessDays))).toISOString(),
        reason: step.note,
        policyVersion: FOLLOWUP_POLICY_VERSION,
      };
    }
    return nurture('A promessa de resposta não se concretizou após dois follow-ups.');
  }

  if (situation === 'nurture') {
    return nurture('Relação em nurture.');
  }

  const steps = CADENCE[situation];
  if (sentCount >= steps.length) {
    return nurture(
      'Sequência activa esgotada. Continuar a insistir passa a ruído — melhor voltar com contexto novo.',
    );
  }

  const step = steps[sentCount];
  return {
    kind: 'followup',
    situation,
    sequenceIndex: sentCount + 1,
    dueAt: atMidday(nextBusinessDay(addBusinessDays(since, step.businessDays))).toISOString(),
    reason: step.note,
    policyVersion: FOLLOWUP_POLICY_VERSION,
  };
}

function nurture(reason: string): Schedule {
  return {
    kind: 'nurture',
    situation: 'nurture',
    sequenceIndex: 1,
    dueAt: atMidday(nextBusinessDay(addDays(new Date(), NURTURE_DAYS))).toISOString(),
    reason,
    policyVersion: FOLLOWUP_POLICY_VERSION,
  };
}

/** Uma resposta da marca cancela o follow-up pendente daquela conversa. Se não
 *  cancelasse, o sistema mandava «viste a minha mensagem?» ao lado de uma
 *  resposta acabada de chegar. */
export const cancelsPendingFollowUp = (eventType: string) =>
  eventType === 'reply.received' || eventType === 'opportunity.won' || eventType === 'opportunity.lost';

/** Qual situação se aplica depois de um evento. `null` quando o evento não
 *  justifica agendar nada. */
export function situationFor(eventType: string): Situation | null {
  switch (eventType) {
    case 'outreach.sent':
      return 'cold_outreach';
    case 'portfolio.requested':
    case 'media_kit.requested':
      return 'material_requested';
    case 'proposal.sent':
    case 'quote.sent':
    case 'call.scheduled':
      return 'after_call_or_proposal';
    case 'promise.recorded':
      return 'promised_date';
    case 'opportunity.nurtured':
      return 'nurture';
    default:
      return null;
  }
}
