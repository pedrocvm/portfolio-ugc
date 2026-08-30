/** A taxonomia canónica de eventos e as chaves que impedem duplicados.
 *
 *  Um evento não é um resumo bonito escrito por um modelo. É um facto
 *  estruturado com origem: `requested_paid_usage=true` sobrevive a um
 *  reprocessamento e a uma mudança de prompt; «a marca pareceu interessada»
 *  não sobrevive a nada. */

export const EVENT_TYPES = [
  'legacy.imported',
  'brand.discovered', 'brand.qualified', 'brand.enriched', 'brand.merged',
  'contact.discovered',
  'outreach.sent',
  'reply.received', 'reply.classified',
  'portfolio.requested', 'rates.requested', 'usage.requested',
  'barter.offered', 'affiliate.offered', 'media_kit.requested',
  'call.requested', 'call.scheduled',
  'proposal.sent', 'proposal.revised', 'quote.sent',
  'negotiation.counteroffer', 'concession.recorded',
  'followup.scheduled', 'followup.sent', 'followup.cancelled', 'followup.snoozed',
  'promise.recorded',
  'opportunity.won', 'opportunity.lost', 'opportunity.nurtured', 'opportunity.stage_changed',
  'product.shipped', 'product.received', 'access.granted',
  'brief.received', 'brief.validated',
  'script.created', 'script.approved',
  'content.delivered', 'revision.requested', 'content.approved',
  'invoice.sent', 'payment.received',
  'rights.started', 'rights.expiring', 'rights.renewed',
  'metrics.requested', 'metrics.received',
  'case.created', 'portfolio.published',
  'upsell.created',
  'capture.received',
  'integration.failed', 'integration.connected',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const KNOWN = new Set<string>(EVENT_TYPES);
export const isKnownEvent = (v: string): v is EventType => KNOWN.has(v);

export const EVENT_LABEL: Partial<Record<EventType, string>> = {
  'legacy.imported': 'Ficha antiga importada',
  'brand.discovered': 'Marca descoberta',
  'brand.qualified': 'Marca qualificada',
  'brand.enriched': 'Marca enriquecida',
  'brand.merged': 'Marcas fundidas',
  'contact.discovered': 'Contacto encontrado',
  'outreach.sent': 'Abordagem enviada',
  'reply.received': 'Resposta recebida',
  'reply.classified': 'Resposta classificada',
  'portfolio.requested': 'Pediram portfólio',
  'rates.requested': 'Pediram preço',
  'usage.requested': 'Pediram direitos de uso',
  'barter.offered': 'Ofereceram permuta',
  'affiliate.offered': 'Ofereceram afiliação',
  'media_kit.requested': 'Pediram media kit',
  'call.requested': 'Pediram call',
  'call.scheduled': 'Call marcada',
  'proposal.sent': 'Proposta enviada',
  'proposal.revised': 'Proposta revista',
  'quote.sent': 'Valor enviado',
  'negotiation.counteroffer': 'Contraproposta',
  'concession.recorded': 'Concessão registada',
  'followup.scheduled': 'Follow-up agendado',
  'followup.sent': 'Follow-up enviado',
  'followup.cancelled': 'Follow-up cancelado',
  'followup.snoozed': 'Follow-up adiado',
  'promise.recorded': 'Promessa de resposta',
  'opportunity.won': 'Oportunidade fechada',
  'opportunity.lost': 'Oportunidade perdida',
  'opportunity.nurtured': 'Movida para nurture',
  'opportunity.stage_changed': 'Etapa alterada',
  'product.shipped': 'Produto enviado',
  'product.received': 'Produto recebido',
  'access.granted': 'Acesso concedido',
  'brief.received': 'Briefing recebido',
  'brief.validated': 'Briefing validado',
  'script.created': 'Roteiro escrito',
  'script.approved': 'Roteiro aprovado',
  'content.delivered': 'Conteúdo entregue',
  'revision.requested': 'Revisão pedida',
  'content.approved': 'Conteúdo aprovado',
  'invoice.sent': 'Fatura enviada',
  'payment.received': 'Pagamento recebido',
  'rights.started': 'Licença iniciada',
  'rights.expiring': 'Licença a expirar',
  'rights.renewed': 'Licença renovada',
  'metrics.requested': 'Métricas pedidas',
  'metrics.received': 'Métricas recebidas',
  'case.created': 'Case criado',
  'portfolio.published': 'Publicado no portfólio',
  'upsell.created': 'Nova oportunidade de upsell',
  'capture.received': 'Captura rápida',
  'integration.failed': 'Integração falhou',
  'integration.connected': 'Integração ligada',
};

export const eventLabel = (type: string) =>
  EVENT_LABEL[type as EventType] ?? type;

/** A chave que torna o reprocessamento seguro. Correr a sincronização duas
 *  vezes sobre a mesma mensagem tem de produzir a mesma linha, não duas. */
export const dedupeKey = (
  provider: string,
  kind: string,
  externalId: string,
  eventType: EventType,
) => `${provider}:${kind}:${externalId}:${eventType}`;

export type ActorType = 'carol' | 'operator' | 'ai' | 'system' | 'brand';

export type EventInput = {
  eventType: EventType;
  occurredAt?: string;
  brandId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  collaborationId?: string | null;
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
  actorType: ActorType;
  actorUserId?: string | null;
  channel?: string | null;
  summary?: string;
  payload?: Record<string, unknown>;
  confidence?: number | null;
  policyVersion?: string | null;
  dedupeKey?: string | null;
};
