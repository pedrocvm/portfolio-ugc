import 'server-only';

import { supabaseService } from '@/lib/supabase/service';
import { recordEvent } from '@/modules/activity/service';
import { rememberEdit } from './triage-service';

/** Enviar de dentro do CarolOS.
 *
 *  A Deep Review chamou-lhe o maior problema do produto: o sistema preparava
 *  tudo e não fechava nada. Todo o trabalho acabava noutra aplicação.
 *
 *  A regra 3 do CarolOS — nada sai para fora sozinho — continua intacta, e é
 *  importante perceber porquê: essa regra protege o ENVIO, não a preparação.
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
 *  a correcção que ela fez ao rascunho vira memória de voz. */
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
