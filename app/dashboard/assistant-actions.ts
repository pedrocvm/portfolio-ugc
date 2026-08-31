'use server';

import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { assistantReady } from '@/modules/assistant/config';
import { suggestionsFor } from '@/modules/assistant/context';
import {
  createThread, deleteThread, listThreads, renameThread, threadMessages,
  type MessageRow, type ThreadRow,
} from '@/modules/assistant/service';
import { supabaseServer } from '@/lib/supabase/server';

const Uuid = z.string().uuid();

export async function assistantThreads(): Promise<ThreadRow[]> {
  await requireUser();
  return listThreads();
}

export async function openAssistantThread(
  entityType: string | null,
  entityId: string | null,
): Promise<{ id: string } | { error: string }> {
  await requireUser();
  if (!assistantReady()) return { error: 'Falta ANTHROPIC_API_KEY no ambiente.' };

  const type = entityType && Uuid.safeParse(entityId).success ? entityType : null;
  const id = await createThread(
    type ? ({ type, id: entityId } as never) : null,
  );
  return id ? { id } : { error: 'Não consegui abrir a conversa.' };
}

export async function assistantMessages(threadId: string): Promise<MessageRow[]> {
  await requireUser();
  if (!Uuid.safeParse(threadId).success) return [];
  return threadMessages(threadId);
}

export async function assistantSuggestions(entityType: string | null): Promise<string[]> {
  await requireUser();
  return suggestionsFor(entityType);
}

export async function renameAssistantThread(threadId: string, title: string) {
  await requireUser();
  if (!Uuid.safeParse(threadId).success) return { error: 'Conversa inválida.' };
  await renameThread(threadId, title);
  return { ok: true };
}

export async function deleteAssistantThread(threadId: string) {
  await requireUser();
  if (!Uuid.safeParse(threadId).success) return { error: 'Conversa inválida.' };
  await deleteThread(threadId);
  return { ok: true };
}

/** O título sai da primeira pergunta dela. Um modelo para isto seria uma
 *  chamada paga para nomear uma coisa que ela vai ler de relance. */
export async function titleAssistantThread(threadId: string, firstMessage: string) {
  await requireUser();
  if (!Uuid.safeParse(threadId).success) return { error: 'Conversa inválida.' };
  const db = await supabaseServer();
  const { data } = await db.from('assistant_thread').select('title').eq('id', threadId).maybeSingle();
  if (data?.title) return { ok: true };

  const clean = firstMessage.replace(/\s+/g, ' ').trim();
  const title = clean.length > 52 ? `${clean.slice(0, 52).trimEnd()}…` : clean;
  await renameThread(threadId, title || 'Conversa');
  return { ok: true };
}
