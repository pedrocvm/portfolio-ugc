import 'server-only';

import { supabaseService } from '@/lib/supabase/service';
import { addBusinessDays } from '@/lib/time';

/** Enviar uma abordagem, e deixar o CRM a par.
 *
 *  Um envio não é só um email a sair: é uma marca que passa a existir, uma
 *  oportunidade aberta, um evento no histórico e um follow-up agendado. Se ela
 *  tivesse de fazer isso à mão depois de enviar, não teríamos poupado nada. */

export type SendResult =
  | { ok: true; messageId: string; threadId: string; from: string; to: string }
  | { ok: false; error: string };

/** Verificações antes de sair. São baratas e evitam o irreversível. */
export function validateSend(input: {
  to: string | null;
  subject: string;
  body: string;
  status: string;
}): string | null {
  if (input.status === 'sent') return 'Este email já foi enviado.';
  if (!input.to) return 'Sem destinatário.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.to)) return 'O endereço não parece válido.';
  if (input.subject.trim().length < 3) return 'Sem assunto.';
  if (input.body.trim().split(/\s+/).length < 25) return 'O corpo está demasiado curto para uma abordagem.';
  return null;
}

export async function sendCandidate(candidateId: string): Promise<SendResult> {
  const db = supabaseService();

  const { data: c } = await db
    .from('outreach_candidate')
    .select('id, name, normalized_name, website, domain, country, niche_id, contact_email, contact_name, contact_role, subject, body, status, fit_score, fit_band, fit_breakdown, why_fit, product, brand_id, opportunity_id')
    .eq('id', candidateId)
    .maybeSingle();

  if (!c) return { ok: false, error: 'Candidata não encontrada.' };

  const invalid = validateSend({ to: c.contact_email, subject: c.subject, body: c.body, status: c.status });
  if (invalid) return { ok: false, error: invalid };

  // Última verificação antes do irreversível. Um domínio sem servidor de email
  // devolve a mensagem, e uma devolução estraga a reputação da caixa dela.
  const { checkEmail } = await import('./mailcheck-dns');
  const check = await checkEmail(c.contact_email as string, 'research');
  if (!check.valid) return { ok: false, error: check.reason };

  const { accessTokenFor } = await import('@/modules/integrations/gmail/oauth');
  const { sendMessage } = await import('@/modules/integrations/gmail/client');
  const auth = await accessTokenFor();
  if (!auth) return { ok: false, error: 'Sem ligação válida ao Gmail.' };

  // ── A marca e a oportunidade nascem agora, não na descoberta ────────────
  // Uma candidata que ela nunca enviou não tem de sujar o CRM.
  // `upsert(… onConflict: 'normalized_name')` não podia funcionar: o índice
  // que existe em `normalized_name` não é único, e o Postgres recusa a
  // especificação inteira. Procurar antes de escrever faz o mesmo com o
  // esquema que há, e é a regra 7 dita em código — a marca reaproveita-se pelo
  // nome normalizado, que é o identificador, e nunca por parecença.
  let brandId = c.brand_id;
  if (!brandId) {
    const { data: existente } = await db
      .from('brand')
      .select('id')
      .eq('normalized_name', c.normalized_name)
      .limit(1)
      .maybeSingle();
    brandId = existente?.id ?? null;
  }
  if (!brandId) {
    const { data: brand, error } = await db
      .from('brand')
      .insert({
        name: c.name,
        normalized_name: c.normalized_name,
        website_url: c.website,
        domain: c.domain,
        country_code: c.country,
        category_primary: c.niche_id,
        fit_score: c.fit_score,
        fit_band: c.fit_band,
        fit_breakdown: c.fit_breakdown,
        // A marca e a oportunidade falam vocabulários diferentes, e não é por
        // descuido: `brand.stage` é o funil que ela vê, em português, e tem uma
        // restrição na base. Escrever aqui o `outreach` da oportunidade fazia a
        // escrita ser recusada, e o envio parava antes de chegar ao Gmail — foi
        // o que impediu todas as abordagens até hoje.
        stage: 'abordada',
        source: 'daily_outreach',
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();
    if (error) return { ok: false, error: `Não consegui registar a marca: ${error.message}` };
    brandId = brand?.id ?? null;
  }
  if (!brandId) return { ok: false, error: 'Não consegui registar a marca.' };

  let contactId: string | null = null;
  if (c.contact_email) {
    const { upsertContactByEmail } = await import('@/modules/contacts/service');
    const contact = await upsertContactByEmail(db, {
      brandId,
      email: c.contact_email,
      name: c.contact_name,
      role: c.contact_role,
      preferredChannel: 'email',
      source: 'daily_outreach',
    });
    if ('error' in contact) {
      return { ok: false, error: `Não consegui registar o contato: ${contact.error}` };
    }
    contactId = contact.id;
  }

  let opportunityId = c.opportunity_id;
  if (!opportunityId) {
    const { data: opp, error } = await db
      .from('opportunity')
      .insert({
        brand_id: brandId,
        primary_contact_id: contactId,
        title: c.product ? `${c.name} · ${c.product}` : c.name,
        stage: 'outreach',
        source: 'daily_outreach',
        product_name: c.product ?? undefined,
        next_action_text: 'À espera de resposta à primeira abordagem.',
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();
    if (error) return { ok: false, error: `Não consegui abrir a oportunidade: ${error.message}` };
    opportunityId = opp?.id ?? null;
  }
  if (!opportunityId) return { ok: false, error: 'Não consegui abrir a oportunidade.' };

  // ── Sai ─────────────────────────────────────────────────────────────────
  let sent: { id: string; threadId: string };
  try {
    sent = await sendMessage(auth.token, {
      to: c.contact_email as string,
      subject: c.subject,
      body: c.body,
      // O remetente é a conta ligada, nunca um valor vindo de fora.
      from: auth.account,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'O Gmail recusou o envio.' };
  }

  const now = new Date();

  await db
    .from('outreach_candidate')
    .update({
      status: 'sent',
      sent_at: now.toISOString(),
      gmail_message_id: sent.id,
      gmail_thread_id: sent.threadId,
      brand_id: brandId,
      opportunity_id: opportunityId,
    })
    .eq('id', candidateId);

  const { recordEvent } = await import('@/modules/activity/service');
  await recordEvent(db, {
    eventType: 'outreach.sent',
    actorType: 'carol',
    brandId,
    opportunityId,
    contactId,
    channel: 'email',
    summary: `Abordagem enviada para ${c.contact_email}: ${c.subject}`,
    payload: { candidateId, messageId: sent.id, threadId: sent.threadId, subject: c.subject },
    dedupeKey: `outreach:sent:${candidateId}`,
  });

  // O motor de follow-up assume daqui para a frente. Fica agendado, não enviado.
  await db.from('follow_up').insert({
    opportunity_id: opportunityId,
    brand_id: brandId,
    policy_version: 'followup-v1',
    situation: 'cold_outreach',
    sequence_index: 1,
    due_at: addBusinessDays(now, 4).toISOString(),
    reason: 'Primeiro follow-up: 3 a 5 dias úteis após a abordagem.',
    status: 'scheduled',
  });

  return {
    ok: true,
    messageId: sent.id,
    threadId: sent.threadId,
    from: auth.account,
    to: c.contact_email as string,
  };
}
