'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { getFlags } from '@/modules/settings/service';

/** As escritas da manhã.
 *
 *  Uma regra atravessa todas: o que sai para fora exige um clique dela, e o que
 *  não sai não pergunta nada. Guardar uma ideia para depois é reversível e
 *  faz-se em silêncio; enviar um email é irreversível e passa por confirmação
 *  na interface antes de chegar aqui. */

export type Result = { ok?: true; error?: string };

const OS_PATHS = ['/dashboard', '/dashboard/inbox', '/dashboard/content', '/dashboard/outreach'];
const refresh = () => {
  for (const p of OS_PATHS) revalidatePath(p);
};

const uuid = z.string().uuid();

/* ── Respostas ────────────────────────────────────────────────────────────── */

/** Envia a resposta que o sistema preparou, com o texto que ela aprovou.
 *
 *  `aiDraft` é o que estava escrito antes de ela mexer. Serve para o sistema
 *  aprender com a diferença — e é a razão pela qual o rascunho seguinte deixa
 *  de sair em português do Brasil sem ninguém configurar nada. */
export async function sendPreparedReply(input: {
  threadId: string;
  body: string;
  subject?: string;
  aiDraft?: string;
}): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(input.threadId).success) return { error: 'Conversa inválida.' };

  const { sendReply } = await import('@/modules/email/send-service');
  const result = await sendReply(input);
  if (!result.ok) return { error: result.error };

  refresh();
  return { ok: true };
}

/** Guarda o rascunho na caixa dela em vez de o enviar. Continua a existir para
 *  quando ela quiser rever no Gmail antes de mandar. */
export async function draftPreparedReply(input: {
  threadId: string;
  body: string;
  subject?: string;
}): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(input.threadId).success) return { error: 'Conversa inválida.' };

  const flags = await getFlags();
  if (!flags.gmail_draft_creation) return { error: 'A bandeira «Criar rascunho no Gmail» está fechada.' };

  const { replyToMailThread } = await import('./carolos-actions');
  return replyToMailThread(input.threadId, input.body);
}

/** «Depois». Não apaga o rascunho: adia a conversa e ela volta amanhã. */
export async function postponeReply(threadId: string): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(threadId).success) return { error: 'Conversa inválida.' };

  const { supabaseService } = await import('@/lib/supabase/service');
  await supabaseService()
    .from('thread_intel')
    .update({ draft_state: 'stale', draft_reason: 'Adiada por ela.', updated_at: new Date().toISOString() })
    .eq('thread_id', threadId);

  refresh();
  return { ok: true };
}

/* ── Conteúdo ─────────────────────────────────────────────────────────────── */

const IDEA_STATUS = z.enum(['ready', 'saved', 'recorded', 'published', 'discarded', 'archived']);

export async function decideOnIdea(ideaId: string, status: string): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(ideaId).success) return { error: 'Ideia inválida.' };
  const parsed = IDEA_STATUS.safeParse(status);
  if (!parsed.success) return { error: 'Estado inválido.' };

  const { setIdeaStatus } = await import('@/modules/creator/plan-service');
  await setIdeaStatus(ideaId, parsed.data);
  refresh();
  return { ok: true };
}

/** «Quero outra ideia.»
 *
 *  Não regenera às cegas: recebe uma direcção de um toque — mais fácil, mais
 *  pessoal, mais educativa, mais editada — e a ideia velha fica descartada com
 *  o motivo, para não voltar. */
const NUDGES = ['easier', 'personal', 'educational', 'edited'] as const;
export type Nudge = (typeof NUDGES)[number];

export async function anotherIdea(ideaId: string, nudge?: string): Promise<Result & { newId?: string }> {
  await requireUser();
  if (!uuid.safeParse(ideaId).success) return { error: 'Ideia inválida.' };

  const direction = NUDGES.includes(nudge as Nudge) ? (nudge as Nudge) : undefined;
  const { replaceIdea } = await import('@/modules/creator/replace-service');
  const result = await replaceIdea(ideaId, direction);
  if (!result.ok) return { error: result.error };

  refresh();
  return { ok: true, newId: result.id };
}

/* ── A manhã ──────────────────────────────────────────────────────────────── */

export async function openMorning(): Promise<Result> {
  await requireUser();
  const { markMorningOpened } = await import('@/modules/morning/service');
  await markMorningOpened();
  return { ok: true };
}

export async function finishMorning(): Promise<Result> {
  await requireUser();
  const { markMorningCompleted } = await import('@/modules/morning/service');
  await markMorningCompleted();
  refresh();
  return { ok: true };
}

/** Refazer a manhã à mão. Existe para o Pedro e para o caso de o cron não ter
 *  corrido — não é um botão que a Carol precise de conhecer. */
export async function rebuildMorning(): Promise<Result & { decisions?: number }> {
  await requireUser();
  const { consolidateMorning } = await import('@/modules/morning/service');
  const brief = await consolidateMorning();
  refresh();
  return brief ? { ok: true, decisions: brief.decisionCount } : { error: 'Não consegui consolidar a manhã.' };
}
