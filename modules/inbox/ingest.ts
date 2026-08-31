import 'server-only';

import { hashContent } from '@/lib/crypto';
import { aiTaskEnabled, type Flags } from '@/lib/flags';
import { asJson } from '@/lib/supabase/json';
import { recordEvent, touchActivity, type Db } from '@/modules/activity/service';
import { dedupeKey, type EventType } from '@/modules/activity/events';
import { runPrompt } from '@/modules/ai/gateway';
import { classifyThread, extractCommercial } from '@/modules/ai/prompts/registry';
import type { CommercialExtraction } from '@/modules/ai/schemas';
import { resolveOrCreateBrand } from '@/modules/brands/service';
import { emailDomain, normalizeEmail } from '@/modules/brands/identity';
import { scheduleFor } from '@/modules/followups/service';
import { applyStageSignal, ensureOpportunity } from '@/modules/opportunities/service';
import { replanActions } from '@/modules/actions/service';
import { rightsRisks, BLANK_RIGHTS } from '@/modules/rights/engine';

/** O coração do CRM passivo.
 *
 *  Uma mensagem entra; saem marca, contacto, oportunidade, eventos, etapa,
 *  follow-up e fila do Hoje — sem a Carol abrir formulário nenhum.
 *
 *  Idempotente do princípio ao fim: o mesmo `externalMessageId` processado
 *  duas vezes não cria uma segunda linha, um segundo evento nem um segundo
 *  lembrete. É o que permite reprocessar uma sincronização falhada sem medo. */

export type NormalizedMessage = {
  provider: 'gmail' | 'instagram' | 'whatsapp' | 'manual' | 'other';
  externalThreadId: string;
  externalMessageId: string;
  direction: 'inbound' | 'outbound';
  sentAt: string;
  fromAddress: string;
  fromName: string;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  snippet: string;
  /** Endereços da própria Carol, para saber quem é a marca na conversa. */
  selfAddresses: string[];
  /** Qual das caixas dela recebeu isto. Sem isto, a resposta podia sair pelo
   *  endereço errado quando há mais do que uma conta ligada. */
  connectionId?: string | null;
  rawRef?: string | null;
};

export type IngestOutcome = {
  status: 'created' | 'duplicate' | 'irrelevant' | 'needs_review' | 'error';
  messageId?: string;
  threadId?: string;
  brandId?: string;
  opportunityId?: string;
  detail: string;
};

const MAX_BODY = 20_000;

/** Nome provável da marca a partir do domínio ou do nome do remetente.
 *  Grosseiro de propósito: é um ponto de partida que a extracção depois afina,
 *  e é melhor do que criar uma marca chamada "noreply". */
function guessBrandName(msg: NormalizedMessage, counterpart: string | null): string {
  const domain = emailDomain(counterpart);
  if (domain) {
    const label = domain.split('.')[0];
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  if (msg.direction === 'inbound' && msg.fromName && !msg.fromName.includes('@')) return msg.fromName;
  return counterpart?.split('@')[0] ?? 'Marca por identificar';
}

/** A contraparte da conversa: o endereço que não é da Carol. */
function counterpartAddress(msg: NormalizedMessage): string | null {
  const self = new Set(msg.selfAddresses.map((a) => a.toLowerCase()));
  if (msg.direction === 'inbound') return normalizeEmail(msg.fromAddress);
  return msg.toAddresses.map((a) => normalizeEmail(a)).find((a) => a && !self.has(a)) ?? null;
}

export async function ingestMessage(
  db: Db,
  msg: NormalizedMessage,
  flags: Flags,
): Promise<IngestOutcome> {
  // ── 1. Já foi visto? ─────────────────────────────────────────────────────
  const { data: seen } = await db
    .from('source_message')
    .select('id, thread_id, processed_at')
    .eq('provider', msg.provider)
    .eq('external_message_id', msg.externalMessageId)
    .maybeSingle();

  if (seen?.processed_at) {
    return { status: 'duplicate', messageId: seen.id, threadId: seen.thread_id, detail: 'Mensagem já processada.' };
  }

  // ── 2. Conversa ──────────────────────────────────────────────────────────
  const counterpart = counterpartAddress(msg);
  const { data: thread } = await db
    .from('source_thread')
    .upsert(
      {
        provider: msg.provider,
        external_thread_id: msg.externalThreadId,
        subject: msg.subject,
        participants: [...new Set([msg.fromAddress, ...msg.toAddresses])].filter(Boolean),
        last_message_at: msg.sentAt,
        ...(msg.connectionId ? { connection_id: msg.connectionId } : {}),
      },
      { onConflict: 'provider,external_thread_id' },
    )
    .select('id, brand_id, contact_id, opportunity_id, classification, classification_confidence')
    .single();

  if (!thread) return { status: 'error', detail: 'Não foi possível registar a conversa.' };

  const body = msg.bodyText.slice(0, MAX_BODY);
  const { data: stored } = await db
    .from('source_message')
    .upsert(
      {
        thread_id: thread.id,
        provider: msg.provider,
        external_message_id: msg.externalMessageId,
        direction: msg.direction,
        sent_at: msg.sentAt,
        from_address: msg.fromAddress,
        from_name: msg.fromName,
        to_addresses: msg.toAddresses,
        subject: msg.subject,
        body_text: body,
        body_hash: await hashContent(body),
        snippet: msg.snippet.slice(0, 300),
        raw_ref: msg.rawRef ?? null,
      },
      { onConflict: 'provider,external_message_id' },
    )
    .select('id')
    .single();

  if (!stored) return { status: 'error', detail: 'Não foi possível guardar a mensagem.' };

  // ── 3. É comercial? ──────────────────────────────────────────────────────
  // Sinal barato primeiro: uma conversa já ligada a uma marca não precisa de
  // ser reclassificada por um modelo a cada mensagem.
  let classification = thread.classification;
  let confidence = thread.classification_confidence;

  if (!thread.brand_id && classification === 'review') {
    if (aiTaskEnabled(flags, 'ai_classification')) {
      const { data: brands } = await db.from('brand').select('name').limit(200);
      const verdict = await runPrompt(
        classifyThread,
        {
          subject: msg.subject,
          participants: [msg.fromAddress, ...msg.toAddresses],
          excerpt: body,
          knownBrands: (brands ?? []).map((b) => b.name),
        },
        { entityType: 'source_thread', entityId: thread.id, cache: true },
      );

      if (verdict.ok) {
        classification = verdict.output.is_commercial
          ? verdict.output.confidence >= 0.7
            ? 'commercial'
            : 'review'
          : verdict.output.confidence >= 0.7
            ? 'irrelevant'
            : 'review';
        confidence = verdict.output.confidence;
        await db
          .from('source_thread')
          .update({
            classification,
            classification_confidence: confidence,
            classification_reason: verdict.output.reason_codes.join(', '),
          })
          .eq('id', thread.id);
      }
    } else if (msg.direction === 'outbound') {
      // Sem IA, uma mensagem que a Carol enviou para um domínio de empresa é
      // sinal suficiente para tratar como comercial: foi ela que a escreveu.
      classification = emailDomain(counterpart) ? 'commercial' : 'review';
      await db.from('source_thread').update({ classification }).eq('id', thread.id);
    }
  }

  if (classification === 'irrelevant') {
    await db.from('source_message').update({ processed_at: new Date().toISOString() }).eq('id', stored.id);
    return { status: 'irrelevant', messageId: stored.id, threadId: thread.id, detail: 'Conversa fora da operação.' };
  }

  if (classification === 'review' && !thread.brand_id) {
    // Fica na caixa de revisão. Nenhuma marca é criada por adivinhação.
    return {
      status: 'needs_review',
      messageId: stored.id,
      threadId: thread.id,
      detail: 'Confiança insuficiente para criar registos sozinho.',
    };
  }

  // ── 4. Extracção de factos ───────────────────────────────────────────────
  let extraction: CommercialExtraction | null = null;
  let extractionRunId: string | null = null;

  if (aiTaskEnabled(flags, 'ai_classification')) {
    const { data: history } = await db
      .from('source_message')
      .select('direction, sent_at, body_text')
      .eq('thread_id', thread.id)
      .order('sent_at', { ascending: true })
      .limit(12);

    const result = await runPrompt(
      extractCommercial,
      {
        brandName: null,
        stage: 'unknown',
        thread: (history ?? [])
          .map((m) => `[${m.direction === 'inbound' ? 'marca' : 'carol'} ${m.sent_at.slice(0, 10)}] ${m.body_text.slice(0, 600)}`)
          .join('\n'),
        message: body,
        today: new Date().toISOString().slice(0, 10),
      },
      { entityType: 'source_message', entityId: stored.id, cache: true },
    );
    if (result.ok) {
      extraction = result.output;
      extractionRunId = result.runId;
    }
  }

  // ── 5. Marca, contacto, oportunidade ─────────────────────────────────────
  let brandId = thread.brand_id;
  let mergeCandidate: { brandId: string; reason: string; confidence: number } | null = null;

  if (!brandId) {
    const resolved = await resolveOrCreateBrand(db, {
      name: extraction?.brand_name || guessBrandName(msg, counterpart),
      email: counterpart,
      source: msg.provider,
      notes: '',
    });
    brandId = resolved.brandId;
    mergeCandidate = resolved.mergeCandidate;
  }

  let contactId = thread.contact_id;
  if (!contactId && counterpart) {
    const { data: contact } = await db
      .from('contact')
      .upsert(
        {
          brand_id: brandId,
          name: extraction?.contact_name ?? (msg.direction === 'inbound' ? msg.fromName : ''),
          role: extraction?.contact_role ?? '',
          email: counterpart,
          preferred_channel: msg.provider === 'gmail' ? ('email' as const) : ('other' as const),
          source: msg.provider,
        },
        { onConflict: 'email', ignoreDuplicates: false },
      )
      .select('id')
      .maybeSingle();
    contactId = contact?.id ?? null;

    if (contactId) {
      await recordEvent(db, {
        eventType: 'contact.discovered',
        brandId,
        contactId,
        actorType: 'system',
        summary: `Contacto ${counterpart} encontrado em ${msg.provider}.`,
        payload: { email: counterpart, role: extraction?.contact_role ?? null },
        dedupeKey: `contact:${counterpart}:discovered`,
      });
    }
  }

  let opportunityId = thread.opportunity_id;
  if (!opportunityId) {
    const { data: brandRow } = await db.from('brand').select('name').eq('id', brandId).maybeSingle();
    const opp = await ensureOpportunity(db, brandId, {
      title: extraction?.product_or_campaign || brandRow?.name || 'Oportunidade',
      source: msg.provider,
      productName: extraction?.product_or_campaign ?? '',
      contactId,
    });
    opportunityId = opp.id;
  }

  await db
    .from('source_thread')
    .update({ brand_id: brandId, contact_id: contactId, opportunity_id: opportunityId })
    .eq('id', thread.id);

  // ── 6. Eventos ───────────────────────────────────────────────────────────
  const baseEvent = {
    brandId,
    contactId,
    opportunityId,
    sourceThreadId: thread.id,
    sourceMessageId: stored.id,
    channel: msg.provider,
    occurredAt: msg.sentAt,
  };

  const primaryType: EventType = msg.direction === 'inbound' ? 'reply.received' : 'outreach.sent';
  const eventId = await recordEvent(db, {
    ...baseEvent,
    eventType: primaryType,
    actorType: msg.direction === 'inbound' ? 'brand' : 'carol',
    summary: msg.subject || msg.snippet.slice(0, 140),
    payload: { snippet: msg.snippet.slice(0, 300) },
    dedupeKey: dedupeKey(msg.provider, 'message', msg.externalMessageId, primaryType),
  });

  const riskFlags: string[] = [];

  if (extraction) {
    const rights = {
      ...BLANK_RIGHTS,
      paidAllowed: extraction.paid_usage_requested,
      platforms: extraction.usage_platforms,
      durationDays: null,
      endAt: extraction.usage_period ? null : null,
      whitelisting: extraction.whitelisting_requested,
      exclusivity: extraction.exclusivity_requested,
      rawFootage: extraction.raw_footage_requested,
    };
    for (const flag of rightsRisks(rights)) {
      if (flag.severity !== 'low') riskFlags.push(flag.code);
    }

    await recordEvent(db, {
      ...baseEvent,
      eventType: 'reply.classified',
      actorType: 'ai',
      summary: `Classificada como ${extraction.reply_types.join(', ')}.`,
      payload: {
        replyTypes: extraction.reply_types,
        riskFlags,
        compensationModel: extraction.compensation_model,
        cashAmountCents: extraction.cash_amount_cents,
        paidUsageRequested: extraction.paid_usage_requested,
        usagePeriod: extraction.usage_period,
        usagePlatforms: extraction.usage_platforms,
        deadline: extraction.deadline,
        promisedReplyDate: extraction.promised_reply_date,
        questions: extraction.questions,
        uncertainties: extraction.uncertainties,
        evidenceSpans: extraction.evidence_spans,
        aiRunId: extractionRunId,
      },
      confidence: extraction.confidence,
      dedupeKey: dedupeKey(msg.provider, 'message', msg.externalMessageId, 'reply.classified'),
    });

    // Um pedido concreto é um facto comercial por direito próprio, não uma
    // linha dentro de um payload: é o que o planeador lê para saber o que fazer.
    const ASK_EVENTS: Record<string, EventType> = {
      portfolio_request: 'portfolio.requested',
      rate_request: 'rates.requested',
      ads_rights: 'usage.requested',
      barter_offer: 'barter.offered',
      affiliate_offer: 'affiliate.offered',
      media_kit_request: 'media_kit.requested',
      call_request: 'call.requested',
      brief: 'brief.received',
      approval: 'content.approved',
      revision: 'revision.requested',
      payment: 'payment.received',
    };
    for (const type of extraction.reply_types) {
      const mapped = ASK_EVENTS[type];
      if (!mapped) continue;
      await recordEvent(db, {
        ...baseEvent,
        eventType: mapped,
        actorType: 'brand',
        summary: `A marca sinalizou: ${type}.`,
        payload: { replyType: type },
        confidence: extraction.confidence,
        dedupeKey: dedupeKey(msg.provider, 'message', msg.externalMessageId, mapped),
      });
    }

    if (extraction.promised_reply_date) {
      await recordEvent(db, {
        ...baseEvent,
        eventType: 'promise.recorded',
        actorType: 'brand',
        summary: `A marca prometeu responder até ${extraction.promised_reply_date}.`,
        payload: { promisedReplyDate: extraction.promised_reply_date },
        confidence: extraction.confidence,
        dedupeKey: dedupeKey(msg.provider, 'message', msg.externalMessageId, 'promise.recorded'),
      });
    }
  }

  if (mergeCandidate) {
    await recordEvent(db, {
      ...baseEvent,
      eventType: 'brand.discovered',
      actorType: 'system',
      summary: 'Possível duplicado de marca detectado. Precisa de confirmação.',
      payload: { mergeCandidate },
      confidence: mergeCandidate.confidence,
      dedupeKey: `brand:${brandId}:merge_candidate:${mergeCandidate.brandId}`,
    });
  }

  // ── 7. Etapa, follow-up, fila ────────────────────────────────────────────
  await applyStageSignal(
    db,
    opportunityId,
    {
      eventType: primaryType,
      replyTypes: extraction?.reply_types,
      explicitAcceptance: extraction?.explicit_acceptance,
      explicitRejection: extraction?.explicit_rejection,
      deferral: extraction?.deferral,
      rejectionReason: extraction?.rejection_reason ?? null,
      direction: msg.direction,
      confidence: extraction?.confidence,
    },
    { autoApply: flags.auto_apply_low_risk && !flags.shadow_mode, eventId, occurredAt: msg.sentAt },
  );

  await scheduleFor(db, {
    opportunityId,
    brandId,
    eventType: primaryType,
    eventId,
    occurredAt: new Date(msg.sentAt),
    promisedAt: extraction?.promised_reply_date ? new Date(extraction.promised_reply_date) : null,
  });

  await touchActivity(db, { brandId, opportunityId }, msg.sentAt);
  await db.from('source_message').update({ processed_at: new Date().toISOString() }).eq('id', stored.id);
  await db
    .from('source_thread')
    .update({ message_count: await countMessages(db, thread.id) })
    .eq('id', thread.id);

  await replanActions(db, [opportunityId]);

  return {
    status: 'created',
    messageId: stored.id,
    threadId: thread.id,
    brandId,
    opportunityId,
    detail: extraction
      ? `Processada: ${extraction.reply_types.join(', ')}.`
      : 'Processada sem extracção de IA (classificação desligada).',
  };
}

async function countMessages(db: Db, threadId: string) {
  const { count } = await db
    .from('source_message')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId);
  return count ?? 0;
}

/** Reprocessa mensagens que ficaram por processar — por falha de IA, por
 *  bandeira desligada na altura, ou porque o trabalho morreu a meio. */
export async function processPending(db: Db, flags: Flags, limit = 25) {
  const { data } = await db
    .from('source_message')
    .select('id, thread_id, provider, external_message_id, direction, sent_at, from_address, from_name, to_addresses, subject, body_text, snippet, raw_ref')
    .is('processed_at', null)
    .order('sent_at', { ascending: true })
    .limit(limit);

  const results: IngestOutcome[] = [];
  for (const m of data ?? []) {
    const { data: thread } = await db
      .from('source_thread')
      .select('external_thread_id')
      .eq('id', m.thread_id)
      .maybeSingle();
    if (!thread) continue;

    results.push(
      await ingestMessage(
        db,
        {
          provider: m.provider as NormalizedMessage['provider'],
          externalThreadId: thread.external_thread_id,
          externalMessageId: m.external_message_id,
          direction: m.direction as 'inbound' | 'outbound',
          sentAt: m.sent_at,
          fromAddress: m.from_address,
          fromName: m.from_name,
          toAddresses: m.to_addresses ?? [],
          subject: m.subject,
          bodyText: m.body_text,
          snippet: m.snippet,
          selfAddresses: [],
          rawRef: m.raw_ref,
        },
        flags,
      ),
    );
  }
  return results;
}

/** Confirmação manual a partir da caixa de revisão: a Carol diz que a conversa
 *  é (ou não é) comercial, e o processamento segue com essa certeza. */
export async function resolveReview(
  db: Db,
  threadId: string,
  decision: 'commercial' | 'irrelevant',
  flags: Flags,
) {
  await db
    .from('source_thread')
    .update({
      classification: decision,
      classification_confidence: 1,
      classification_reason: 'Confirmado à mão.',
    })
    .eq('id', threadId);

  if (decision === 'irrelevant') {
    await db
      .from('source_message')
      .update({ processed_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .is('processed_at', null);
    return { processed: 0 };
  }

  const results = await processPending(db, flags, 50);
  return { processed: results.filter((r) => r.status === 'created').length };
}

export { asJson };
