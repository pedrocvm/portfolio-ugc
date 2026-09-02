'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { getFlags } from '@/modules/settings/service';

/** As escritas da manhã.
 *
 *  Uma regra atravessa todas: o que sai para fora exige um clique dela, e o que
 *  não sai não pergunta nada. Salvar uma ideia para depois é reversível e
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

/** salva o rascunho na caixa dela em vez de o enviar. Continua existindo para
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

export async function decideOnIdea(ideaId: string, status: string, reason?: string): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(ideaId).success) return { error: 'Ideia inválida.' };
  const parsed = IDEA_STATUS.safeParse(status);
  if (!parsed.success) return { error: 'Estado inválido.' };

  const { isRejectionReason } = await import('@/modules/creator/domain');
  const { setIdeaStatus } = await import('@/modules/creator/plan-service');
  await setIdeaStatus(ideaId, parsed.data, reason && isRejectionReason(reason) ? reason : undefined);
  refresh();
  return { ok: true };
}

/** «Quero outra ideia.» e «não é para mim.»
 *
 *  São o mesmo gesto com dois destinos: em ambos ela diz porquê, e é o porquê
 *  que muda o plano de amanhã. Sem motivo, recusar era um estado morto — a
 *  ideia saía da tela e voltava no dia seguinte com outras palavras. */
export async function anotherIdea(ideaId: string, reason?: string): Promise<Result & { newId?: string }> {
  await requireUser();
  if (!uuid.safeParse(ideaId).success) return { error: 'Ideia inválida.' };

  const { isRejectionReason } = await import('@/modules/creator/domain');
  const motivo = reason && isRejectionReason(reason) ? reason : undefined;
  const { replaceIdea } = await import('@/modules/creator/replace-service');
  const result = await replaceIdea(ideaId, motivo);
  if (!result.ok) return { error: result.error };

  refresh();
  return { ok: true, newId: result.id };
}

/** «Que conteúdo meu sai desta mesma gravação?»
 *
 *  Gasta uma chamada ao modelo, e por isso corre quando ela pergunta — não em
 *  todas as gravações de madrugada. */
export async function contentFromJob(
  collaborationId: string,
): Promise<Result & { suggestions?: import('@/modules/creator/multiplier-service').MultiplierSuggestion[] }> {
  await requireUser();
  if (!uuid.safeParse(collaborationId).success) return { error: 'Gravação inválida.' };

  const { multiplierFor } = await import('@/modules/creator/multiplier-service');
  const r = await multiplierFor(collaborationId);
  return r.ok ? { ok: true, suggestions: r.suggestions } : { error: r.reason };
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
