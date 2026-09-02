/** Os marcos reais da carreira dela.
 *
 *  «Consegui o meu primeiro cliente internacional» é o melhor conteúdo que a
 *  Carol pode publicar — e é a mentira mais fácil de contar por acidente. Este
 *  módulo existe para que um marco só nasça de um facto que já está gravado:
 *  um pagamento, uma aprovação, uma licença, uma marca de outro país.
 *
 *  Nada aqui inventa. Se não há evento, não há marco, e o plano de conteúdo do
 *  dia tem de arranjar outra coisa para dizer.
 *
 *  Puro: recebe linhas, devolve marcos. */

export const MILESTONE_KINDS = [
  'first_positive_reply',
  'first_product_received',
  'first_paid_client',
  'first_international_client',
  'first_usage_fee',
  'first_approved_no_revision',
  'first_recurring_client',
  'first_rejection',
  'first_price_rejection',
  'revenue_threshold',
] as const;

export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

/** A frase que a Carol lê. Facto, não celebração inventada. */
export const MILESTONE_LABEL: Record<MilestoneKind, string> = {
  first_positive_reply: 'A primeira resposta positiva de uma marca',
  first_product_received: 'O primeiro produto recebido',
  first_paid_client: 'O primeiro cliente pago',
  first_international_client: 'O primeiro cliente de fora',
  first_usage_fee: 'A primeira vez que cobrou direitos de uso',
  first_approved_no_revision: 'O primeiro vídeo aprovado sem alterações',
  first_recurring_client: 'O primeiro cliente que voltou',
  first_rejection: 'O primeiro não',
  first_price_rejection: 'A primeira proposta recusada por preço',
  revenue_threshold: 'Um patamar de faturação',
};

export type MilestoneEvidence = { kind: string; id: string; at: string; note?: string };

export type Milestone = {
  kind: MilestoneKind;
  /** Um marco «primeiro» é único por definição; o de faturação leva o valor. */
  dedupeKey: string;
  occurredAt: string;
  brandId: string | null;
  brandName: string | null;
  summary: string;
  evidence: MilestoneEvidence[];
};

export type MilestoneInput = {
  /** Pagamentos em dinheiro, já recebidos. Permuta não conta: produto não é
   *  receita, e a regra 5 do CarolOS existe exactamente para isto. */
  payments: readonly {
    id: string;
    brandId: string | null;
    brandName: string | null;
    brandCountry: string | null;
    kind: string;
    amountCents: number;
    currency: string;
    receivedAt: string | null;
  }[];
  events: readonly {
    id: string;
    type: string;
    brandId: string | null;
    brandName: string | null;
    occurredAt: string;
    summary: string;
    payload?: Record<string, unknown> | null;
  }[];
  /** O país de casa. Um cliente «internacional» é relativo a ele. */
  homeCountry: string;
};

const iso = (v: string) => v;

const byDate = <T extends { occurredAt?: string; receivedAt?: string | null }>(list: readonly T[]) =>
  [...list].sort((a, b) => {
    const av = a.occurredAt ?? a.receivedAt ?? '';
    const bv = b.occurredAt ?? b.receivedAt ?? '';
    return av < bv ? -1 : av > bv ? 1 : 0;
  });

/** Patamares que valem conteúdo. Em cêntimos, como todo o dinheiro do CarolOS. */
const REVENUE_STEPS = [50_000, 100_000, 250_000, 500_000, 1_000_000];

export function deriveMilestones(input: MilestoneInput): Milestone[] {
  const out: Milestone[] = [];

  const cash = byDate(
    input.payments.filter((p) => p.kind !== 'barter' && p.receivedAt && p.amountCents > 0),
  );

  const first = cash[0];
  if (first?.receivedAt) {
    out.push({
      kind: 'first_paid_client',
      dedupeKey: 'first_paid_client',
      occurredAt: iso(first.receivedAt),
      brandId: first.brandId,
      brandName: first.brandName,
      summary: `${first.brandName ?? 'Uma marca'} foi o primeiro pagamento em dinheiro que entrou.`,
      evidence: [{ kind: 'payment', id: first.id, at: first.receivedAt }],
    });
  }

  const foreign = cash.find(
    (p) => p.brandCountry && p.brandCountry.toLowerCase() !== input.homeCountry.toLowerCase(),
  );
  if (foreign?.receivedAt) {
    out.push({
      kind: 'first_international_client',
      dedupeKey: 'first_international_client',
      occurredAt: iso(foreign.receivedAt),
      brandId: foreign.brandId,
      brandName: foreign.brandName,
      summary: `${foreign.brandName ?? 'Uma marca'} foi o primeiro cliente de fora de ${input.homeCountry}.`,
      evidence: [{ kind: 'payment', id: foreign.id, at: foreign.receivedAt }],
    });
  }

  const usage = cash.find((p) => p.kind === 'usage_license');
  if (usage?.receivedAt) {
    out.push({
      kind: 'first_usage_fee',
      dedupeKey: 'first_usage_fee',
      occurredAt: iso(usage.receivedAt),
      brandId: usage.brandId,
      brandName: usage.brandName,
      summary: `A primeira vez que os direitos de uso foram pagos à parte da produção — ${usage.brandName ?? 'uma marca'}.`,
      evidence: [{ kind: 'payment', id: usage.id, at: usage.receivedAt }],
    });
  }

  // Duas entradas em dinheiro da mesma marca é recorrência. Uma só não é.
  const porMarca = new Map<string, typeof cash>();
  for (const p of cash) {
    if (!p.brandId) continue;
    porMarca.set(p.brandId, [...(porMarca.get(p.brandId) ?? []), p]);
  }
  for (const [brandId, lista] of porMarca) {
    if (lista.length < 2) continue;
    const segundo = lista[1];
    if (!segundo.receivedAt) continue;
    out.push({
      kind: 'first_recurring_client',
      dedupeKey: 'first_recurring_client',
      occurredAt: iso(segundo.receivedAt),
      brandId,
      brandName: segundo.brandName,
      summary: `${segundo.brandName ?? 'Uma marca'} voltou a pagar — o primeiro cliente que repetiu.`,
      evidence: lista.slice(0, 2).map((p) => ({ kind: 'payment', id: p.id, at: p.receivedAt ?? '' })),
    });
    break;
  }

  // Patamares acumulados, na moeda em que entraram. Sem conversão inventada:
  // só se somam pagamentos da mesma moeda.
  const porMoeda = new Map<string, number>();
  for (const p of cash) {
    const total = (porMoeda.get(p.currency) ?? 0) + p.amountCents;
    porMoeda.set(p.currency, total);
    for (const step of REVENUE_STEPS) {
      if (total >= step && total - p.amountCents < step) {
        out.push({
          kind: 'revenue_threshold',
          dedupeKey: `revenue_threshold:${p.currency}:${step}`,
          occurredAt: iso(p.receivedAt ?? ''),
          brandId: p.brandId,
          brandName: p.brandName,
          summary: `A faturação passou os ${step / 100} ${p.currency}.`,
          evidence: [{ kind: 'payment', id: p.id, at: p.receivedAt ?? '' }],
        });
      }
    }
  }

  const eventos = byDate(input.events);
  const firstOf = (types: readonly string[]) => eventos.find((e) => types.includes(e.type));

  const positiva = firstOf(['reply.received']);
  if (positiva) {
    out.push({
      kind: 'first_positive_reply',
      dedupeKey: 'first_positive_reply',
      occurredAt: positiva.occurredAt,
      brandId: positiva.brandId,
      brandName: positiva.brandName,
      summary: `${positiva.brandName ?? 'Uma marca'} foi a primeira a responder.`,
      evidence: [{ kind: 'event', id: positiva.id, at: positiva.occurredAt }],
    });
  }

  const produto = firstOf(['product.received']);
  if (produto) {
    out.push({
      kind: 'first_product_received',
      dedupeKey: 'first_product_received',
      occurredAt: produto.occurredAt,
      brandId: produto.brandId,
      brandName: produto.brandName,
      summary: `O primeiro produto a chegar a casa veio da ${produto.brandName ?? 'marca'}.`,
      evidence: [{ kind: 'event', id: produto.id, at: produto.occurredAt }],
    });
  }

  const recusa = firstOf(['opportunity.lost']);
  if (recusa) {
    const razao = String((recusa.payload as { reason?: unknown } | null)?.reason ?? '');
    out.push({
      kind: 'first_rejection',
      dedupeKey: 'first_rejection',
      occurredAt: recusa.occurredAt,
      brandId: recusa.brandId,
      brandName: recusa.brandName,
      summary: `O primeiro não veio da ${recusa.brandName ?? 'marca'}.`,
      evidence: [{ kind: 'event', id: recusa.id, at: recusa.occurredAt, note: razao || undefined }],
    });
    if (/pre[çc]o|budget|caro|valor/i.test(razao)) {
      out.push({
        kind: 'first_price_rejection',
        dedupeKey: 'first_price_rejection',
        occurredAt: recusa.occurredAt,
        brandId: recusa.brandId,
        brandName: recusa.brandName,
        summary: `A primeira proposta recusada por preço — ${recusa.brandName ?? 'uma marca'}.`,
        evidence: [{ kind: 'event', id: recusa.id, at: recusa.occurredAt, note: razao }],
      });
    }
  }

  // Aprovado sem alterações: a aprovação existe e não houve pedido de revisão
  // nessa oportunidade antes dela.
  const aprovacoes = eventos.filter((e) => e.type === 'content.approved');
  for (const a of aprovacoes) {
    const houveRevisao = eventos.some(
      (e) => e.type === 'revision.requested' && e.brandId === a.brandId && e.occurredAt < a.occurredAt,
    );
    if (houveRevisao) continue;
    out.push({
      kind: 'first_approved_no_revision',
      dedupeKey: 'first_approved_no_revision',
      occurredAt: a.occurredAt,
      brandId: a.brandId,
      brandName: a.brandName,
      summary: `${a.brandName ?? 'Uma marca'} aprovou à primeira, sem pedir alterações.`,
      evidence: [{ kind: 'event', id: a.id, at: a.occurredAt }],
    });
    break;
  }

  // Um marco por chave: o mais antigo ganha, porque «primeiro» quer dizer isso.
  const porChave = new Map<string, Milestone>();
  for (const m of out) {
    if (!m.occurredAt) continue;
    const existente = porChave.get(m.dedupeKey);
    if (!existente || m.occurredAt < existente.occurredAt) porChave.set(m.dedupeKey, m);
  }
  return [...porChave.values()].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
}

/** Um marco vale conteúdo enquanto for notícia. Passados dois meses é
 *  história, e história conta-se de outra maneira. */
export function isFreshMilestone(m: Pick<Milestone, 'occurredAt'>, now: Date = new Date()): boolean {
  const at = Date.parse(m.occurredAt);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at <= 60 * 86_400_000;
}
