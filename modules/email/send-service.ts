import 'server-only';

import { hashContent } from '@/lib/crypto';
import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { replanActions } from '@/modules/actions/service';
import { nextActionForThread, readNextAction } from '@/modules/actions/next-action';
import { recordEvent, touchActivity } from '@/modules/activity/service';
import { upsertContactByEmail } from '@/modules/contacts/service';
import { scheduleFor } from '@/modules/followups/service';
import { rememberEdit } from './triage-service';

/** Enviar de dentro do CarolOS.
 *
 *  A Deep Review chamou-lhe o maior problema do produto: o sistema preparava
 *  tudo e não fechava nada. Todo o trabalho acabava noutra aplicação.
 *
 *  A regra 3 do CarolOS — nada sai para fora sozinho — continua intacta, e é
 *  importante entender porquê: essa regra protege o ENVIO, não a preparação.
 *  Aqui há sempre um clique dela, e não existe caminho por onde um trabalho de
 *  fundo chegue a esta função. `external_send` continua fechada, e é a
 *  bandeira que governaria envio SEM aprovação — que não é isto.
 *
 *  O scope pedido ao Google já é `gmail.compose`, que envia. Não é preciso
 *  pedir mais nada a ninguém. */

export type SendReplyResult =
  | { ok: true; messageId: string; threadId: string }
  | { ok: false; error: string };

/** Verificações antes do irreversível. Baratas, e todas já custaram caro. */
export function validateReply(input: { to: string | null; subject: string; body: string }): string | null {
  if (!input.to) return 'Esta conversa não tem para quem responder.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.to)) return 'O endereço de resposta não parece válido.';
  if (input.subject.trim().length < 2) return 'A resposta ficou sem assunto.';
  if (input.body.trim().length < 10) return 'A resposta está vazia.';
  if (input.body.length > 20000) return 'A resposta é longa de mais para um email.';
  return null;
}

/** Responde a uma conversa, dentro da mesma linha do Gmail.
 *
 *  Depois de sair: o evento fica no histórico, o follow-up pendente é
 *  cancelado — quem respondeu foi ela, e insistir a seguir seria ridículo — e
 *  a correção que ela fez ao rascunho vira memória de voz. */
export async function sendReply(input: {
  threadId: string;
  body: string;
  subject?: string;
  /** O rascunho que o sistema tinha escrito, para se aprender com a diferença. */
  aiDraft?: string;
}): Promise<SendReplyResult> {
  const db = supabaseService();

  const { data: thread } = await db
    .from('source_thread')
    .select('id, subject, external_thread_id, connection_id, brand_id, opportunity_id')
    .eq('id', input.threadId)
    .maybeSingle();

  if (!thread) return { ok: false, error: 'Conversa não encontrada.' };

  const { data: last } = await db
    .from('source_message')
    .select('from_address')
    .eq('thread_id', input.threadId)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const subject =
    input.subject?.trim() ||
    (thread.subject?.toLowerCase().startsWith('re:') ? thread.subject : `Re: ${thread.subject || '(sem assunto)'}`);

  const invalid = validateReply({ to: last?.from_address ?? null, subject, body: input.body });
  if (invalid) return { ok: false, error: invalid };

  const { accessTokenFor } = await import('@/modules/integrations/gmail/oauth');
  const { sendMessage } = await import('@/modules/integrations/gmail/client');

  const auth = await accessTokenFor(thread.connection_id ?? undefined);
  if (!auth) return { ok: false, error: 'Sem ligação válida ao Gmail. Volta a ligar em Definições.' };

  let sent: { id: string; threadId: string };
  try {
    sent = await sendMessage(auth.token, {
      to: last!.from_address,
      subject,
      body: input.body,
      // O remetente é a conta ligada, nunca um valor vindo de fora.
      from: auth.account,
      threadId: thread.external_thread_id ?? undefined,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'O Gmail recusou o envio.' };
  }

  const now = new Date().toISOString();

  await db
    .from('thread_intel')
    .update({ draft_state: 'sent', updated_at: now })
    .eq('thread_id', input.threadId);

  await recordEvent(db, {
    eventType: 'reply.sent',
    actorType: 'carol',
    brandId: thread.brand_id,
    opportunityId: thread.opportunity_id,
    sourceThreadId: thread.id,
    channel: 'gmail',
    summary: `Resposta enviada para ${last!.from_address}: ${subject}`,
    payload: { messageId: sent.id, threadId: sent.threadId, chars: input.body.length },
    dedupeKey: `reply:sent:${sent.id}`,
  });

  // Ela respondeu: o lembrete de insistir deixa de fazer sentido.
  if (thread.opportunity_id) {
    await db
      .from('follow_up')
      .update({ status: 'cancelled', cancelled_reason: 'A resposta saiu do CarolOS.' })
      .eq('opportunity_id', thread.opportunity_id)
      .in('status', ['scheduled', 'due']);
  }

  if (input.aiDraft) {
    await rememberEdit({
      threadId: input.threadId,
      brandId: thread.brand_id,
      aiText: input.aiDraft,
      finalText: input.body,
    });
  }

  return { ok: true, messageId: sent.id, threadId: sent.threadId };
}

/* ── Email novo para o contato que a marca indicou ────────────────────────── */

export type SendComposeResult =
  | { ok: true; messageId: string; threadId: string; newThreadId: string }
  | { ok: false; error: string };

/** Escreve para quem a marca disse que decide.
 *
 *  Não é uma resposta: é uma conversa nova, para outra caixa, e o Gmail tem de
 *  a ver assim — sem `threadId`. O que fica ligado é aqui dentro: a thread
 *  nova sabe de que mensagem nasceu, o contato guarda a prova, e a oportunidade
 *  é a mesma. Um envio que o Gmail depois sincroniza cai em duplicado e não
 *  reprocessa nada.
 *
 *  Depois de sair, a Carol não faz contabilidade nenhuma: quem espera é a
 *  marca, o follow-up marca-se, a ação antiga cai e a fila refaz-se. */
export async function sendCompose(input: {
  threadId: string;
  to?: string | null;
  subject: string;
  body: string;
  aiDraft?: string;
}): Promise<SendComposeResult> {
  const db = supabaseService();

  const [{ data: thread }, { data: intel }] = await Promise.all([
    db
      .from('source_thread')
      .select('id, subject, external_thread_id, connection_id, brand_id, opportunity_id')
      .eq('id', input.threadId)
      .maybeSingle(),
    db.from('thread_intel').select('next_action').eq('thread_id', input.threadId).maybeSingle(),
  ]);

  if (!thread) return { ok: false, error: 'Conversa não encontrada.' };
  const next = readNextAction(intel?.next_action);
  const to = (input.to ?? next?.target.to ?? '').trim().toLowerCase();
  if (!to) return { ok: false, error: 'Esta conversa não tem um contato indicado para quem escrever.' };
  if (next?.target.kind === 'compose' && next.target.to && next.target.to !== to && !input.to) {
    return { ok: false, error: 'O destinatário mudou. Confirma para quem vai.' };
  }

  const subject = input.subject.trim();
  const invalid = validateReply({ to, subject, body: input.body });
  if (invalid) return { ok: false, error: invalid };

  const { accessTokenFor } = await import('@/modules/integrations/gmail/oauth');
  const { sendMessage } = await import('@/modules/integrations/gmail/client');

  const auth = await accessTokenFor(thread.connection_id ?? undefined);
  if (!auth) return { ok: false, error: 'Sem ligação válida ao Gmail. Volta a ligar em Definições.' };

  let sent: { id: string; threadId: string };
  try {
    sent = await sendMessage(auth.token, { to, subject, body: input.body, from: auth.account });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'O Gmail recusou o envio.' };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const sourceMessageId = next?.evidence.sourceMessageId ?? null;

  // O contato, com a prova. Idempotente: se a triagem já o criou, devolve-o.
  let contactId: string | null = next?.contactId ?? null;
  if (thread.brand_id) {
    const contato = await upsertContactByEmail(db, {
      brandId: thread.brand_id,
      email: to,
      preferredChannel: 'email',
      source: 'referral',
      provenance: {
        sourceMessageId,
        sourceThreadId: thread.id,
        confidence: next?.confidence ?? null,
        text: next?.evidence.quote ? `Indicado pela marca: «${next.evidence.quote}»` : 'Indicado pela marca.',
      },
    });
    if (!('error' in contato)) contactId = contato.id;
  }

  // A conversa nova, já ligada. Quando o Gmail a sincronizar, cai aqui.
  const { data: novaThread } = await db
    .from('source_thread')
    .upsert(
      {
        provider: 'gmail',
        external_thread_id: sent.threadId,
        subject,
        participants: [auth.account, to],
        last_message_at: nowIso,
        message_count: 1,
        brand_id: thread.brand_id,
        opportunity_id: thread.opportunity_id,
        contact_id: contactId,
        classification: 'commercial',
        classification_confidence: 1,
        classification_reason: 'Email enviado do CarolOS para o contato que a marca indicou.',
        connection_id: thread.connection_id,
        parent_thread_id: thread.id,
        referral_message_id: sourceMessageId,
      },
      { onConflict: 'provider,external_thread_id' },
    )
    .select('id')
    .single();

  if (novaThread) {
    await db.from('source_message').upsert(
      {
        thread_id: novaThread.id,
        provider: 'gmail',
        external_message_id: sent.id,
        direction: 'outbound',
        sent_at: nowIso,
        from_address: auth.account,
        from_name: 'Carolina',
        to_addresses: [to],
        subject,
        body_text: input.body,
        body_hash: await hashContent(input.body),
        snippet: input.body.replace(/\s+/g, ' ').slice(0, 300),
        raw_ref: `gmail:${sent.id}`,
        processed_at: nowIso,
      },
      { onConflict: 'provider,external_message_id' },
    );

    // A conversa nova nasce lida: a vez é da marca, nada a fazer.
    const nada = nextActionForThread({
      threadId: novaThread.id,
      opportunityId: thread.opportunity_id,
      brandId: thread.brand_id,
      brandName: 'a marca',
      intent: 'UNCERTAIN',
      confidence: 1,
      waitingOn: 'brand',
      waitingSince: nowIso,
      lastExternal: null,
      draft: null,
      recommendation: '',
      whatTheyWant: '',
      referred: [],
    });
    await db.from('thread_intel').upsert(
      {
        thread_id: novaThread.id,
        opportunity_id: thread.opportunity_id,
        brand_id: thread.brand_id,
        last_carol_message_id: null,
        waiting_on: 'brand',
        waiting_since: nowIso,
        source_fingerprint: `sent:${sent.id}`,
        prepared_at: nowIso,
        updated_at: nowIso,
        intent: 'UNCERTAIN',
        recommendation: 'Enviado para o contato que a marca indicou. A vez é da marca.',
        draft_state: 'sent',
        next_action: asJson(nada),
        next_action_type: nada.type,
      },
      { onConflict: 'thread_id' },
    );
  }

  const eventId = await recordEvent(db, {
    eventType: 'outreach.sent',
    actorType: 'carol',
    brandId: thread.brand_id,
    contactId,
    opportunityId: thread.opportunity_id,
    sourceThreadId: novaThread?.id ?? thread.id,
    sourceMessageId,
    channel: 'gmail',
    occurredAt: nowIso,
    summary: `Email enviado para ${to}, o contato que a marca indicou: ${subject}`,
    payload: { messageId: sent.id, threadId: sent.threadId, referral: true, parentThreadId: thread.id, chars: input.body.length },
    dedupeKey: `gmail:message:${sent.id}:outreach.sent`,
  });

  // A conversa antiga fecha: ninguém está à espera da Carol ali.
  const fechada = nextActionForThread({
    threadId: thread.id,
    opportunityId: thread.opportunity_id,
    brandId: thread.brand_id,
    brandName: 'a marca',
    intent: 'REFERRAL',
    confidence: 1,
    waitingOn: 'brand',
    waitingSince: nowIso,
    lastExternal: null,
    draft: null,
    recommendation: '',
    whatTheyWant: '',
    referred: [],
  });
  await db
    .from('thread_intel')
    .update({
      draft_state: 'sent',
      waiting_on: 'brand',
      waiting_since: nowIso,
      recommendation: `Escrito para ${to}. Agora a vez é da marca.`,
      next_action: asJson({ ...fechada, reason: `O email para ${to} saiu. Agora a vez é da marca.` }),
      next_action_type: fechada.type,
      updated_at: nowIso,
    })
    .eq('thread_id', thread.id);

  if (thread.opportunity_id) {
    await db
      .from('opportunity')
      .update({ ...(contactId ? { primary_contact_id: contactId } : {}), last_activity_at: nowIso })
      .eq('id', thread.opportunity_id);

    // A ação antiga cai; a fila refaz-se a partir da leitura nova.
    await db
      .from('action_item')
      .update({ status: 'done' })
      .eq('opportunity_id', thread.opportunity_id)
      .eq('status', 'open')
      .in('type', ['respond', 'compose_to_new_contact', 'confirm_referral']);

    await scheduleFor(db, {
      opportunityId: thread.opportunity_id,
      brandId: thread.brand_id,
      eventType: 'outreach.sent',
      eventId,
      occurredAt: now,
    });

    await touchActivity(db, { brandId: thread.brand_id, opportunityId: thread.opportunity_id }, nowIso);
    await replanActions(db, [thread.opportunity_id]).catch(() => null);
  }

  if (input.aiDraft) {
    await rememberEdit({ threadId: thread.id, brandId: thread.brand_id, aiText: input.aiDraft, finalText: input.body });
  }

  return { ok: true, messageId: sent.id, threadId: sent.threadId, newThreadId: novaThread?.id ?? '' };
}

/** Ela escolheu, entre dois endereços, para qual escrever. A ação refaz-se
 *  com essa certeza e o email fica pronto — sem nova chamada ao modelo. */
export async function chooseReferredContact(threadId: string, email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = supabaseService();
  const { data: intel } = await db
    .from('thread_intel')
    .select('next_action, draft_subject, draft_body, draft_language, intent, intent_confidence, waiting_on, waiting_since, recommendation, what_they_want, brand_id, opportunity_id')
    .eq('thread_id', threadId)
    .maybeSingle();
  const atual = readNextAction(intel?.next_action);
  if (!intel || !atual) return { ok: false, error: 'Esta conversa ainda não foi lida.' };

  const escolhido = atual.candidates.find((c) => c.email === email.trim().toLowerCase());
  if (!escolhido) return { ok: false, error: 'Esse endereço não está entre os que a marca deixou.' };

  const [{ data: brand }, { data: msgs }] = await Promise.all([
    intel.brand_id ? db.from('brand').select('name').eq('id', intel.brand_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('source_message').select('id, direction, from_address, from_name, subject, body_text, sent_at').eq('thread_id', threadId).order('sent_at', { ascending: true }),
  ]);
  const ultimaDaMarca = [...(msgs ?? [])].reverse().find((m) => m.direction === 'inbound') ?? null;
  const primeiraDela = (msgs ?? []).find((m) => m.direction === 'outbound') ?? null;

  const next = nextActionForThread({
    threadId,
    opportunityId: intel.opportunity_id,
    brandId: intel.brand_id,
    brandName: brand?.name ?? 'a marca',
    intent: 'REFERRAL',
    confidence: intel.intent_confidence ?? 0.6,
    waitingOn: (intel.waiting_on as 'carol' | 'brand' | 'nobody') ?? 'carol',
    waitingSince: intel.waiting_since,
    lastExternal: ultimaDaMarca
      ? { id: ultimaDaMarca.id, fromAddress: ultimaDaMarca.from_address, fromName: ultimaDaMarca.from_name, bodyText: ultimaDaMarca.body_text ?? '', sentAt: ultimaDaMarca.sent_at }
      : null,
    draft: null,
    recommendation: intel.recommendation,
    whatTheyWant: intel.what_they_want,
    referred: [{ ...escolhido, valid: true, reason: null }],
    originalOutbound: primeiraDela ? { subject: primeiraDela.subject, body: primeiraDela.body_text ?? '' } : null,
  });

  await db
    .from('thread_intel')
    .update({ next_action: asJson(next), next_action_type: next.type, draft_state: 'ready', updated_at: new Date().toISOString() })
    .eq('thread_id', threadId);
  if (intel.opportunity_id) await replanActions(db, [intel.opportunity_id]).catch(() => null);
  return { ok: true };
}
