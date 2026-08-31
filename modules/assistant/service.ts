import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';
import type { EntityContext, Source } from './domain';

/** Conversas e mensagens. A conversa é dela: pode ser lida, renomeada e
 *  apagada, e apagá-la não toca em nada do CRM. */

export type ThreadRow = {
  id: string;
  title: string;
  lastMessageAt: string | null;
  contextType: string | null;
  contextId: string | null;
};

export type MessageRow = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  sources: Source[];
  status: string;
  createdAt: string;
};

export async function listThreads(limit = 40): Promise<ThreadRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('assistant_thread')
    .select('id, title, last_message_at, context_type, context_id')
    .is('archived_at', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []).map((t) => ({
    id: t.id, title: t.title, lastMessageAt: t.last_message_at,
    contextType: t.context_type, contextId: t.context_id,
  }));
}

export async function createThread(entity: EntityContext | null): Promise<string | null> {
  const db = await supabaseServer();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return null;
  const { data, error } = await db
    .from('assistant_thread')
    .insert({
      app_user_id: me.id,
      title: '',
      context_type: entity?.type ?? null,
      context_id: entity && 'id' in entity ? entity.id : null,
    })
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`createThread: ${error.message}`);
  return data?.id ?? null;
}

export async function threadMessages(threadId: string): Promise<MessageRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('assistant_message')
    .select('id, role, content, sources, status, created_at')
    .eq('thread_id', threadId)
    .neq('role', 'tool')
    .order('created_at', { ascending: true });
  return (data ?? []).map((m) => ({
    id: m.id,
    role: m.role as MessageRow['role'],
    content: m.content,
    sources: (m.sources ?? []) as Source[],
    status: m.status,
    createdAt: m.created_at,
  }));
}

export async function threadSummary(threadId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('assistant_thread')
    .select('summary, summary_through_id, summary_version, context_type, context_id')
    .eq('id', threadId)
    .maybeSingle();
  return data;
}

export async function renameThread(threadId: string, title: string) {
  const db = await supabaseServer();
  const { error } = await db
    .from('assistant_thread')
    .update({ title: title.slice(0, 140) })
    .eq('id', threadId);
  if (error) throw new Error(`renameThread: ${error.message}`);
}

/** Apagar uma conversa apaga a conversa. As marcas, os emails e os orçamentos
 *  de que ela falava continuam onde estavam. */
export async function deleteThread(threadId: string) {
  const db = await supabaseServer();
  const { error } = await db.from('assistant_thread').delete().eq('id', threadId);
  if (error) throw new Error(`deleteThread: ${error.message}`);
}

export async function activeMemories(limit = 20) {
  const db = await supabaseServer();
  const { data } = await db
    .from('business_memory')
    .select('type, content')
    .eq('status', 'active')
    .order('effective_from', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Os avisos abertos, os piores primeiro. */
export async function openInsights(limit = 6) {
  const db = await supabaseServer();
  const { data } = await db
    .from('assistant_insight')
    .select('id, severity, title, detail, href')
    .eq('status', 'open')
    .order('severity')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((i) => ({
    id: i.id,
    severity: i.severity as 'info' | 'warn' | 'urgent',
    title: i.title,
    detail: i.detail,
    href: i.href,
  }));
}
