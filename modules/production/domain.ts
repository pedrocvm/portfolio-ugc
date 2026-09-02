/** A parte pura da produção: estados, etiquetas e a regra do portão.
 *
 *  Vive separada do serviço porque a bancada de produção é um componente de
 *  cliente e precisa destas constantes. Se estivessem no serviço, importá-las
 *  arrastava o cliente Supabase e a chave de service role para o browser — que
 *  é exatamente o que o `server-only` no serviço está lá para impedir. */

export const COLLABORATION_STATUS = [
  'accepted', 'awaiting_terms', 'awaiting_product', 'awaiting_brief',
  'production_ready', 'in_production', 'delivered', 'in_revision',
  'approved', 'closed', 'cancelled',
] as const;

export type CollaborationStatus = (typeof COLLABORATION_STATUS)[number];

export const STATUS_LABEL: Record<CollaborationStatus, string> = {
  accepted: 'Aceite',
  awaiting_terms: 'À espera de termos',
  awaiting_product: 'À espera do produto',
  awaiting_brief: 'À espera do briefing',
  production_ready: 'Pronta para produzir',
  in_production: 'Em produção',
  delivered: 'Entregue',
  in_revision: 'Em revisão',
  approved: 'Aprovada',
  closed: 'Encerrada',
  cancelled: 'Cancelada',
};

export type CollaborationRow = {
  id: string;
  opportunityId: string;
  brandId: string;
  brandName: string;
  title: string;
  status: CollaborationStatus;
  compensationModel: string;
  deadlineAt: string | null;
  logisticsKind: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  trackingRef: string | null;
  accessStatus: string | null;
  paymentGate: string;
  gateBlockers: string[];
  revisionsIncluded: number | null;
  acceptedAt: string | null;
  notes: string;
};

/** O que ainda falta antes de valer a pena gravar. Se a Carol produzir sem
 *  isto resolvido, descobre o problema depois de a câmara já ter desligado. */
export function gateBlockers(c: {
  compensationModel: string;
  logisticsKind: string | null;
  receivedAt: string | null;
  accessStatus: string | null;
  hasBrief: boolean;
  hasRights: boolean;
  deadlineAt: string | null;
  paymentGate: string;
}): string[] {
  const blockers: string[] = [];

  if (c.compensationModel === 'unclear') blockers.push('Modelo de compensação por definir.');
  if (!c.deadlineAt) blockers.push('Sem prazo combinado.');
  if (!c.hasBrief) blockers.push('Briefing por receber ou por validar.');
  if (!c.hasRights) blockers.push('Direitos de uso por registar.');
  if (c.paymentGate === 'unresolved') blockers.push('Regra de pagamento por decidir.');

  if (c.logisticsKind === 'physical' && !c.receivedAt) blockers.push('Produto ainda não chegou.');
  if (c.logisticsKind === 'digital' && c.accessStatus !== 'ready') {
    blockers.push('Acesso ao produto digital ainda não está pronto.');
  }

  return blockers;
}
