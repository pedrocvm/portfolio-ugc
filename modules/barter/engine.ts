/** Decisão de permuta.
 *
 *  A conta ingénua — «preço de retalho ≥ preço do vídeo, logo compensa» — é
 *  exactamente a que faz a Carol trocar horas de produção por um pau de selfie.
 *  O que conta é o valor que o produto tem PARA ELA, não o que a marca diz que
 *  custa: um produto que ela nunca compraria vale perto de zero por muito que
 *  a etiqueta diga o contrário.
 *
 *  O resultado é uma recomendação explicada. Não é ciência e não finge ser. */

export type BarterInput = {
  /** Preço de etiqueta, em cêntimos. Sinal fraco por si só. */
  retailPriceCents: number | null;
  /** Quanto vale mesmo para a Carol, em cêntimos. Se ausente, deriva do resto. */
  valueToCarolCents?: number | null;
  /** Ela compraria isto com o próprio dinheiro? */
  wouldBuy: boolean | null;
  /** Interesse no produto, 0-5. */
  productInterest: number | null;
  /** Esforço de produção, 0-5 (5 = ocupa um dia inteiro e vários cenários). */
  productionEffort: number | null;
  /** Valor estratégico da relação: LTV, recorrência, porta para paid. 0-5. */
  strategicValue: number | null;
  /** O que este trabalho acrescenta ao portfólio. 0-5. */
  portfolioValue: number | null;
  /** Direitos pedidos além do orgânico. Cada um encarece a troca. */
  rightsRequested: { paidUsage: boolean; whitelisting: boolean; exclusivity: boolean; rawFootage: boolean };
  /** Valor de mercado de um trabalho pago equivalente, quando existe política. */
  cashAlternativeCents: number | null;
};

export type BarterDecision = 'ACCEPT_BARTER' | 'ASK_FOR_CASH' | 'HYBRID' | 'DECLINE' | 'ASK_INFO';

export const DECISION_LABEL: Record<BarterDecision, string> = {
  ACCEPT_BARTER: 'Aceitar a permuta',
  ASK_FOR_CASH: 'Pedir pagamento',
  HYBRID: 'Produto + dinheiro',
  DECLINE: 'Recusar',
  ASK_INFO: 'Pedir informação em falta',
};

export type BarterResult = {
  decision: BarterDecision;
  /** Valor efectivo da troca para a Carol, em cêntimos. Nunca é receita. */
  effectiveValueCents: number;
  /** Custo estimado do trabalho, em cêntimos, quando calculável. */
  estimatedCostCents: number | null;
  reasons: string[];
  missing: string[];
  /** Nunca somar isto à receita: produto não é dinheiro. */
  countsAsCashRevenue: false;
};

/** Um produto que a Carol não compraria vale uma fracção da etiqueta.
 *  Os multiplicadores são grosseiros de propósito: o objectivo é impedir a
 *  ilusão do MSRP, não simular um mercado secundário. */
const utilityMultiplier = (wouldBuy: boolean | null, interest: number | null) => {
  if (wouldBuy === true) return 1;
  if (wouldBuy === false) return 0.2;
  if (interest == null) return 0.5;
  return 0.2 + (interest / 5) * 0.8;
};

/** Cada direito pedido além do orgânico consome valor da troca: são licenças
 *  que noutro contexto se vendiam. */
const rightsCostCents = (r: BarterInput['rightsRequested'], reference: number) =>
  (r.paidUsage ? reference * 0.5 : 0) +
  (r.whitelisting ? reference * 0.5 : 0) +
  (r.exclusivity ? reference * 0.7 : 0) +
  (r.rawFootage ? reference * 0.3 : 0);

/** Custo de oportunidade. Mesmo o trabalho mais leve ocupa metade de um espaço
 *  de agenda que podia ser vendido — a produção é indivisível, não se grava
 *  meio vídeo. O esforço move o custo de metade a um trabalho inteiro. */
const effortCostCents = (effort: number | null, reference: number) =>
  reference * (0.5 + ((effort ?? 3) / 5) * 0.5);

/** Bónus só acima de neutro. Um valor estratégico "aceitável" (3) não
 *  acrescenta nada: se acrescentasse, qualquer permuta ficava atraente por
 *  omissão, que é exactamente o erro que este motor existe para evitar. */
const aboveNeutral = (value: number | null | undefined) => Math.max(0, ((value ?? 2) - 3) / 2);

export function decideBarter(input: BarterInput): BarterResult {
  const reasons: string[] = [];
  const missing: string[] = [];

  if (input.retailPriceCents == null && input.valueToCarolCents == null) {
    missing.push('Preço do produto ou valor real para a Carol.');
  }
  if (input.wouldBuy == null && input.productInterest == null) {
    missing.push('Se a Carol usaria ou compraria o produto.');
  }
  if (input.productionEffort == null) {
    missing.push('Esforço de produção estimado.');
  }

  const retail = input.retailPriceCents ?? 0;
  const utility = utilityMultiplier(input.wouldBuy, input.productInterest);
  const productValue = input.valueToCarolCents ?? Math.round(retail * utility);

  if (input.valueToCarolCents == null && retail > 0) {
    reasons.push(
      `Etiqueta ${(retail / 100).toFixed(0)} €, mas ${
        input.wouldBuy === false
          ? 'a Carol não compraria isto'
          : input.wouldBuy === true
            ? 'ela compraria'
            : 'o interesse é parcial'
      }: valor real ≈ ${(productValue / 100).toFixed(0)} €.`,
    );
  }

  // Sem alternativa em dinheiro configurada não há régua económica: só é
  // possível decidir pela utilidade e pelo estratégico, e isso diz-se.
  const reference = input.cashAlternativeCents;
  let estimatedCostCents: number | null = null;

  if (reference != null && reference > 0) {
    estimatedCostCents = Math.round(
      effortCostCents(input.productionEffort, reference) + rightsCostCents(input.rightsRequested, reference),
    );
  } else {
    missing.push('Valor de um trabalho pago equivalente (falta política de preço).');
  }

  const strategic = aboveNeutral(input.strategicValue) * (reference ?? 0) * 0.4;
  const portfolio = aboveNeutral(input.portfolioValue) * (reference ?? 0) * 0.25;
  const effectiveValueCents = Math.round(productValue + strategic + portfolio);

  const requestedRights = Object.entries(input.rightsRequested).filter(([, v]) => v).map(([k]) => k);
  if (requestedRights.length) {
    reasons.push(
      `A marca pede ${requestedRights.join(', ')} — licenças que normalmente se vendem à parte de uma permuta.`,
    );
  }

  // ── Decisão ─────────────────────────────────────────────────────────────
  let decision: BarterDecision;

  if (input.rightsRequested.exclusivity || input.rightsRequested.whitelisting) {
    decision = 'ASK_FOR_CASH';
    reasons.push('Exclusividade ou whitelisting por produto não é troca: é cedência sem contrapartida.');
  } else if (missing.length >= 2) {
    decision = 'ASK_INFO';
    reasons.push('Faltam dados demais para decidir com honestidade.');
  } else if (estimatedCostCents == null) {
    // Sem régua económica, decide-se pelo que se sabe: utilidade e estratégia.
    if (input.wouldBuy === true && (input.strategicValue ?? 0) >= 3) {
      decision = 'ACCEPT_BARTER';
      reasons.push('Produto que ela queria e marca com potencial: a troca faz sentido mesmo sem tabela.');
    } else if (input.wouldBuy === false) {
      decision = 'ASK_FOR_CASH';
      reasons.push('Produto que ela não usaria ocupa tempo de produção sem devolver valor.');
    } else {
      decision = 'ASK_INFO';
      reasons.push('Sem política de preço não há régua económica; falta perceber orçamento e objectivo.');
    }
  } else if (effectiveValueCents >= estimatedCostCents) {
    decision = 'ACCEPT_BARTER';
    reasons.push(
      `O valor da troca (${(effectiveValueCents / 100).toFixed(0)} €) cobre o custo do trabalho (${(estimatedCostCents / 100).toFixed(0)} €).`,
    );
  } else if (effectiveValueCents >= estimatedCostCents * 0.5) {
    decision = 'HYBRID';
    reasons.push(
      `O produto cobre cerca de metade do trabalho. Pedir a diferença em dinheiro (≈ ${((estimatedCostCents - effectiveValueCents) / 100).toFixed(0)} €) mantém a colaboração viável.`,
    );
  } else if (input.wouldBuy === false && (input.strategicValue ?? 0) <= 2) {
    decision = 'DECLINE';
    reasons.push('Produto sem interesse, marca sem potencial e produção a sério: é trabalho a perder.');
  } else {
    decision = 'ASK_FOR_CASH';
    reasons.push('O produto fica muito abaixo do custo do trabalho.');
  }

  if (input.productionEffort != null && input.productionEffort >= 4) {
    reasons.push('Produção pesada: ocupa um espaço de agenda que podia ser vendido.');
  }

  return {
    decision,
    effectiveValueCents,
    estimatedCostCents,
    reasons,
    missing,
    countsAsCashRevenue: false,
  };
}
