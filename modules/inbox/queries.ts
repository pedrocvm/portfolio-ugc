import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';
import { decodeEntities } from '@/lib/html';

/** Leituras do Inbox. Uma conversa, não uma caixa de correio: o que interessa
 *  é o estado comercial dela, não a lista de mensagens. */

export type ThreadRow = {
  id: string;
  provider: string;
  subject: string;
  participants: string[];
  lastMessageAt: string | null;
  messageCount: number;
  classification: 'commercial' | 'irrelevant' | 'review';
  confidence: number | null;
  reason: string;
  brandId: string | null;
  brandName: string | null;
  opportunityId: string | null;
  stage: string | null;
  lastDirection: 'inbound' | 'outbound' | null;
  snippet: string;
  replyTypes: string[];
};

export async function inboxThreads(): Promise<{
  waiting: ThreadRow[];
  review: ThreadRow[];
  quiet: ThreadRow[];
}> {
  const db = await supabaseServer();

  const { data: threads } = await db
    .from('source_thread')
    .select(`
      id, provider, subject, participants, last_message_at, message_count,
      classification, classification_confidence, classification_reason,
      brand_id, opportunity_id,
      brand:brand_id ( name ),
      opportunity:opportunity_id ( stage )
    `)
    .not('classification', 'eq', 'irrelevant')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(80);

  const ids = (threads ?? []).map((t) => t.id);
  const lastByThread = new Map<string, { direction: 'inbound' | 'outbound'; snippet: string }>();
  const asksByOpp = new Map<string, string[]>();

  if (ids.length) {
    const { data: messages } = await db
      .from('source_message')
      .select('thread_id, direction, snippet, sent_at')
      .in('thread_id', ids)
      .order('sent_at', { ascending: false });

    for (const m of messages ?? []) {
      if (!lastByThread.has(m.thread_id)) {
        lastByThread.set(m.thread_id, {
          direction: m.direction as 'inbound' | 'outbound',
          snippet: m.snippet,
        });
      }
    }

    const oppIds = (threads ?? []).map((t) => t.opportunity_id).filter(Boolean) as string[];
    if (oppIds.length) {
      const { data: events } = await db
        .from('activity_event')
        .select('opportunity_id, payload, occurred_at')
        .in('opportunity_id', oppIds)
        .eq('event_type', 'reply.classified')
        .order('occurred_at', { ascending: false });

      for (const e of events ?? []) {
        if (!e.opportunity_id || asksByOpp.has(e.opportunity_id)) continue;
        asksByOpp.set(e.opportunity_id, ((e.payload ?? {}) as { replyTypes?: string[] }).replyTypes ?? []);
      }
    }
  }

  const rows: ThreadRow[] = (threads ?? []).map((t) => {
    const brand = t.brand as unknown as { name: string } | null;
    const opportunity = t.opportunity as unknown as { stage: string } | null;
    const last = lastByThread.get(t.id);
    return {
      id: t.id,
      provider: t.provider,
      subject: t.subject || '(sem assunto)',
      participants: t.participants ?? [],
      lastMessageAt: t.last_message_at,
      messageCount: t.message_count,
      classification: t.classification as ThreadRow['classification'],
      confidence: t.classification_confidence,
      reason: t.classification_reason,
      brandId: t.brand_id,
      brandName: brand?.name ?? null,
      opportunityId: t.opportunity_id,
      stage: opportunity?.stage ?? null,
      lastDirection: last?.direction ?? null,
      // Também na leitura, e não só na ingestão: as mensagens que já estão
      // gravadas têm o escape do Gmail lá dentro, e reescrevê-las era uma
      // migração de dados para resolver um problema de apresentação.
      snippet: decodeEntities(last?.snippet ?? ''),
      replyTypes: t.opportunity_id ? (asksByOpp.get(t.opportunity_id) ?? []) : [],
    };
  });

  return {
    // A bola está do lado dela quando a última mensagem veio de fora.
    waiting: rows.filter((r) => r.classification === 'commercial' && r.lastDirection === 'inbound'),
    review: rows.filter((r) => r.classification === 'review'),
    quiet: rows.filter((r) => r.classification === 'commercial' && r.lastDirection !== 'inbound'),
  };
}

export async function threadMessages(threadId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('source_message')
    .select('id, direction, sent_at, from_address, from_name, subject, body_text, snippet')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true });
  return data ?? [];
}

export async function threadsForOpportunity(opportunityId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('source_thread')
    .select('id, provider, subject, last_message_at, message_count, external_thread_id')
    .eq('opportunity_id', opportunityId)
    .order('last_message_at', { ascending: false });
  return data ?? [];
}
