'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import type { FlagKey } from '@/lib/flags';
import { supabaseServer } from '@/lib/supabase/server';
import { completeAction, dismissAction, reopenAction as reopen, replanActions, snoozeAction } from '@/modules/actions/service';
import { ACTION_CTA, type ActionType } from '@/modules/actions/planner';
import { decodeEntities } from '@/lib/html';
import { applyCapture, createCapture, discardCapture, type CaptureKind } from '@/modules/capture/service';
import { draftCase, publishToPortfolio, requestMetrics, setPermission, unpublishFromPortfolio, updateCase } from '@/modules/cases/service';
import { generateHypotheses, saveContent, saveShotList, shotListFromScript, approveScript } from '@/modules/content/service';
import { ingestBrief, validateBrief } from '@/modules/briefs/service';
import { resolveReview } from '@/modules/inbox/ingest';
import { markSent, snoozeFollowUp } from '@/modules/followups/service';
import { analyze, decideRecommendation, draft, recordConcession } from '@/modules/negotiation/service';
import { setStageManually, setWaiting } from '@/modules/opportunities/service';
import type { Stage } from '@/modules/opportunities/domain';
import { createQuote, markQuoteSent, previewQuote } from '@/modules/pricing/service';
import { approveDelivery, recordDelivery, recordFeedback, startCollaboration, updateCollaboration, type CollaborationStatus } from '@/modules/production/service';
import { createLicense } from '@/modules/rights/service';
import { markPaid, recordPayment } from '@/modules/revenue/service';
import { getFlags, setFlag } from '@/modules/settings/service';
import { runJob, type JobName } from '@/modules/jobs/runner';
import { scoreAndSaveFit } from '@/modules/brands/service';
import { decideBarter, type BarterInput } from '@/modules/barter/engine';
import { BLANK_RIGHTS } from '@/modules/rights/engine';

export type Result = { ok?: true; error?: string };

/** Todas as escritas do CarolOS passam por aqui. Nenhum componente recebe um
 *  cliente Supabase com permissão para mexer no CRM: centralizar as escritas é
 *  o que garante que evento, validação e política não podem ser contornados. */

const OS_PATHS = [
  '/dashboard',
  '/dashboard/inbox',
  '/dashboard/opportunities',
  '/dashboard/brands',
  '/dashboard/followups',
  '/dashboard/production',
  '/dashboard/revenue',
];

const refreshOs = () => {
  for (const path of OS_PATHS) revalidatePath(path);
};

/* ── Fila do Hoje ───────────────────────────────────────────────────────── */

export async function doneAction(id: string): Promise<Result> {
  const { app } = await requireUser();
  await completeAction(id, app.id);
  refreshOs();
  return { ok: true };
}

export async function snooze(id: string, days: number): Promise<Result> {
  const { app } = await requireUser();
  const until = new Date(Date.now() + Math.max(1, days) * 86400000).toISOString();
  await snoozeAction(id, until, app.id);
  refreshOs();
  return { ok: true };
}

export async function dismiss(id: string): Promise<Result> {
  await requireUser();
  await dismissAction(id);
  refreshOs();
  return { ok: true };
}

/** O desfazer de «já está», «depois» e «não é preciso».
 *
 *  Estas três são reversíveis, e por isso não pedem confirmação: fazem-se, e
 *  fica um «desfazer» à mão durante uns segundos. Uma janela a perguntar «tem
 *  a certeza?» a cada cartão é o que faz uma fila de cinco parecer trabalho. */
export async function reopenAction(id: string): Promise<Result> {
  await requireUser();
  await reopen(id);
  refreshOs();
  return { ok: true };
}

export async function replan(): Promise<Result> {
  await requireUser();
  const db = await supabaseServer();
  await replanActions(db);
  refreshOs();
  return { ok: true };
}

/* ── Oportunidades ──────────────────────────────────────────────────────── */

const StageSchema = z.enum([
  'discovered', 'qualified', 'outreach', 'replied', 'commercial_qualification',
  'proposal', 'negotiation', 'won', 'lost', 'nurture',
]);

export async function changeStage(
  opportunityId: string,
  stage: string,
  reason: string,
): Promise<Result> {
  const { app } = await requireUser();
  const parsed = StageSchema.safeParse(stage);
  if (!parsed.success) return { error: 'Etapa desconhecida.' };

  const result = await setStageManually(opportunityId, parsed.data as Stage, reason.trim(), app.id);
  if (!result.ok) return { error: result.error };

  const db = await supabaseServer();
  await replanActions(db, [opportunityId]);
  refreshOs();
  revalidatePath(`/dashboard/opportunities/${opportunityId}`);
  return { ok: true };
}

export async function wait(opportunityId: string, until: string, reason: string): Promise<Result> {
  const { app } = await requireUser();
  await setWaiting(opportunityId, until || null, reason, app.id);
  const db = await supabaseServer();
  await replanActions(db, [opportunityId]);
  refreshOs();
  revalidatePath(`/dashboard/opportunities/${opportunityId}`);
  return { ok: true };
}

export async function updateOpportunity(
  opportunityId: string,
  patch: { title?: string; productName?: string; commercialModel?: string; expectedCashCents?: number | null; priority?: string },
): Promise<Result> {
  await requireUser();
  const db = await supabaseServer();
  const { error } = await db
    .from('opportunity')
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.productName !== undefined ? { product_name: patch.productName } : {}),
      ...(patch.commercialModel ? { commercial_model: patch.commercialModel } : {}),
      ...(patch.expectedCashCents !== undefined ? { expected_cash_cents: patch.expectedCashCents } : {}),
      ...(patch.priority ? { priority: patch.priority } : {}),
    })
    .eq('id', opportunityId);

  if (error) return { error: 'Não foi possível salvar.' };
  revalidatePath(`/dashboard/opportunities/${opportunityId}`);
  return { ok: true };
}

/* ── Follow-ups ─────────────────────────────────────────────────────────── */

export async function followUpSent(id: string, text?: string): Promise<Result> {
  const { app } = await requireUser();
  await markSent(id, app.id, text);
  refreshOs();
  revalidatePath('/dashboard/followups');
  return { ok: true };
}

export async function followUpSnooze(id: string, days: number): Promise<Result> {
  const { app } = await requireUser();
  const until = new Date(Date.now() + Math.max(1, days) * 86400000).toISOString();
  await snoozeFollowUp(id, until, app.id);
  refreshOs();
  revalidatePath('/dashboard/followups');
  return { ok: true };
}

/* ── Inbox ──────────────────────────────────────────────────────────────── */

export async function triageThread(threadId: string, decision: 'commercial' | 'irrelevant'): Promise<Result> {
  await requireUser();
  const db = await supabaseServer();
  await resolveReview(db, threadId, decision, await getFlags());
  refreshOs();
  revalidatePath('/dashboard/inbox');
  return { ok: true };
}

/* ── Copiloto comercial ─────────────────────────────────────────────────── */

export type CopilotState = Result & {
  analysis?: unknown;
  draftText?: string;
  recommendationId?: string;
};

export async function runCopilot(opportunityId: string): Promise<CopilotState> {
  await requireUser();
  const result = await analyze(opportunityId, await getFlags());
  if (!result.ok) return { error: result.message };
  revalidatePath(`/dashboard/opportunities/${opportunityId}`);
  return { ok: true, analysis: result.analysis, recommendationId: result.recommendationId ?? undefined };
}

export async function draftMessage(opportunityId: string, goal: string): Promise<CopilotState> {
  await requireUser();
  if (!goal.trim()) return { error: 'Diz qual é o objetivo desta mensagem.' };
  const result = await draft(opportunityId, goal.trim(), await getFlags());
  if (!result.ok) return { error: result.message };
  return { ok: true, draftText: result.draft.body };
}

export async function decideOnRecommendation(
  recommendationId: string,
  decision: 'accepted' | 'edited' | 'rejected',
): Promise<Result> {
  await requireUser();
  await decideRecommendation(recommendationId, decision);
  return { ok: true };
}

export async function logConcession(
  opportunityId: string,
  what: string,
  inExchangeFor: string,
): Promise<Result> {
  const { app } = await requireUser();
  if (!what.trim()) return { error: 'Escreve o que foi cedido.' };
  await recordConcession(opportunityId, what.trim(), inExchangeFor.trim(), app.id);
  revalidatePath(`/dashboard/opportunities/${opportunityId}`);
  return { ok: true };
}

/** Cria um rascunho na caixa do Gmail. É o limite do automático: a mensagem
 *  fica escrita, o envio continua sendo um clique dela no Gmail. */
export async function pushDraftToGmail(
  opportunityId: string,
  subject: string,
  body: string,
): Promise<Result> {
  await requireUser();
  const flags = await getFlags();
  if (!flags.gmail_draft_creation) {
    return { error: 'A bandeira "Criar rascunho no Gmail" está fechada.' };
  }

  const { accessTokenFor } = await import('@/modules/integrations/gmail/oauth');
  const { createDraft } = await import('@/modules/integrations/gmail/client');

  const auth = await accessTokenFor();
  if (!auth) return { error: 'Sem ligação ao Gmail.' };

  const db = await supabaseServer();
  const { data: opp } = await db
    .from('opportunity')
    .select('brand_id, primary_contact_id')
    .eq('id', opportunityId)
    .maybeSingle();
  if (!opp) return { error: 'Oportunidade não encontrada.' };

  const { data: contact } = await db
    .from('contact')
    .select('email')
    .eq('brand_id', opp.brand_id)
    .not('email', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!contact?.email) return { error: 'Esta marca ainda não tem um e-mail de contato.' };

  const { data: thread } = await db
    .from('source_thread')
    .select('external_thread_id')
    .eq('opportunity_id', opportunityId)
    .eq('provider', 'gmail')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  try {
    await createDraft(auth.token, {
      to: contact.email,
      subject,
      body,
      from: auth.account,
      threadId: thread?.external_thread_id,
    });
    return { ok: true };
  } catch {
    return { error: 'O Gmail recusou criar o rascunho. Verifica a ligação.' };
  }
}

/* ── Preço e direitos ───────────────────────────────────────────────────── */

const ScopeInput = z.object({
  videos: z.coerce.number().int().min(1).default(1),
  extraHooks: z.coerce.number().int().min(0).default(0),
  rawFootage: z.coerce.boolean().default(false),
  rush: z.coerce.boolean().default(false),
  paidUsage: z.coerce.boolean().default(false),
  usageTerm: z.enum(['30d', '3m', '6m', '12m']).nullable().default(null),
  platforms: z.array(z.string()).default([]),
  territories: z.array(z.string()).default([]),
  whitelisting: z.coerce.boolean().default(false),
  exclusivity: z.coerce.boolean().default(false),
  perpetual: z.coerce.boolean().default(false),
});

export async function quotePreview(scope: unknown) {
  await requireUser();
  const parsed = ScopeInput.safeParse(scope);
  if (!parsed.success) return { error: 'Escopo inválido.' as const };
  return { ok: true as const, quote: await previewQuote(parsed.data) };
}

export async function saveQuote(
  opportunityId: string,
  scope: unknown,
  finalCents: number | null,
  overrideReason: string,
): Promise<Result & { quoteId?: string }> {
  const { app } = await requireUser();
  const parsed = ScopeInput.safeParse(scope);
  if (!parsed.success) return { error: 'Escopo inválido.' };

  const result = await createQuote({
    opportunityId,
    scope: parsed.data,
    finalCents,
    overrideReason: overrideReason.trim() || undefined,
    actorUserId: app.id,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath(`/dashboard/opportunities/${opportunityId}`);
  return { ok: true, quoteId: result.id };
}

export async function sendQuote(quoteId: string, opportunityId: string): Promise<Result> {
  await requireUser();
  await markQuoteSent(quoteId);
  revalidatePath(`/dashboard/opportunities/${opportunityId}`);
  return { ok: true };
}

export async function saveLicense(input: {
  brandId: string;
  opportunityId?: string | null;
  collaborationId?: string | null;
  paidAllowed: boolean;
  platforms: string[];
  territories: string[];
  startAt: string | null;
  durationDays: number | null;
  whitelisting: boolean;
  exclusivity: boolean;
  exclusivityEndAt: string | null;
  rawFootage: boolean;
  portfolioPermission: boolean | null;
  feeCents: number | null;
  notes: string;
}): Promise<Result> {
  const { app } = await requireUser();
  const result = await createLicense({
    brandId: input.brandId,
    opportunityId: input.opportunityId,
    collaborationId: input.collaborationId,
    scope: {
      ...BLANK_RIGHTS,
      paidAllowed: input.paidAllowed,
      platforms: input.platforms,
      territories: input.territories,
      startAt: input.startAt,
      durationDays: input.durationDays,
      whitelisting: input.whitelisting,
      exclusivity: input.exclusivity,
      exclusivityEndAt: input.exclusivityEndAt,
      rawFootage: input.rawFootage,
      portfolioPermission: input.portfolioPermission,
    },
    feeCents: input.feeCents,
    notes: input.notes,
    actorUserId: app.id,
  });

  if (!result.ok) return { error: result.error };
  refreshOs();
  return { ok: true };
}

/* ── Permuta ────────────────────────────────────────────────────────────── */

export async function evaluateBarter(input: BarterInput) {
  await requireUser();
  return decideBarter(input);
}

/* ── Captura rápida ─────────────────────────────────────────────────────── */

export async function capture(
  kind: string,
  raw: string,
  note: string,
  storagePath?: string | null,
): Promise<Result & { id?: string }> {
  await requireUser();
  const result = await createCapture({
    kind: (kind as CaptureKind) ?? 'text',
    raw,
    note,
    storagePath: storagePath ?? null,
    flags: await getFlags(),
  });
  revalidatePath('/dashboard/capture');
  return result.ok ? { ok: true, id: result.id } : { error: result.error };
}

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

/** Sobe um print para o bucket privado `capture`. Nunca para o `media`, que é
 *  o que o site serve: um print de uma conversa com uma marca não pode acabar
 *  a ser servido publicamente por engano. */
export async function uploadScreenshot(form: FormData): Promise<Result & { path?: string }> {
  await requireUser();
  const file = form.get('file');
  if (!(file instanceof File)) return { error: 'Nenhum arquivo recebido.' };
  if (!file.type.startsWith('image/')) return { error: 'Só imagens.' };
  if (file.size > MAX_SCREENSHOT_BYTES) return { error: 'A imagem é grande demais (máximo 4 MB).' };

  const db = await supabaseServer();
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
  const { error } = await db.storage.from('capture').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) return { error: 'Não foi possível salvar a imagem.' };
  return { ok: true, path };
}

export async function confirmCapture(
  captureId: string,
  brandName: string,
  nicheId: string,
): Promise<Result & { brandId?: string }> {
  const { app } = await requireUser();
  const result = await applyCapture(captureId, { brandName, nicheId: nicheId || null }, app.id);
  if (!result.ok) return { error: result.error };
  refreshOs();
  revalidatePath('/dashboard/capture');
  return { ok: true, brandId: result.brandId };
}

export async function dropCapture(captureId: string): Promise<Result> {
  await requireUser();
  await discardCapture(captureId);
  revalidatePath('/dashboard/capture');
  return { ok: true };
}

/* ── Produção ───────────────────────────────────────────────────────────── */

export async function openCollaboration(opportunityId: string): Promise<Result & { id?: string }> {
  const { app } = await requireUser();
  const result = await startCollaboration(opportunityId, app.id);
  if (!result.ok) return { error: result.error };
  refreshOs();
  return { ok: true, id: result.id };
}

export async function patchCollaboration(
  collaborationId: string,
  patch: Record<string, unknown>,
): Promise<Result> {
  const { app } = await requireUser();
  await updateCollaboration(collaborationId, patch as Parameters<typeof updateCollaboration>[1], app.id);
  refreshOs();
  revalidatePath(`/dashboard/production/${collaborationId}`);
  return { ok: true };
}

export async function setCollaborationStatus(
  collaborationId: string,
  status: string,
): Promise<Result> {
  const { app } = await requireUser();
  await updateCollaboration(collaborationId, { status: status as CollaborationStatus }, app.id);
  refreshOs();
  revalidatePath(`/dashboard/production/${collaborationId}`);
  return { ok: true };
}

export async function submitBrief(collaborationId: string, raw: string): Promise<Result & { gaps?: string[] }> {
  const { app } = await requireUser();
  if (!raw.trim()) return { error: 'Cola o briefing.' };
  const result = await ingestBrief({
    collaborationId,
    raw,
    flags: await getFlags(),
    actorUserId: app.id,
  });
  revalidatePath(`/dashboard/production/${collaborationId}`);
  return result.ok ? { ok: true, gaps: result.gaps } : { error: result.error };
}

export async function markBriefValidated(briefId: string, collaborationId: string): Promise<Result> {
  const { app } = await requireUser();
  await validateBrief(briefId, app.id);
  revalidatePath(`/dashboard/production/${collaborationId}`);
  return { ok: true };
}

export async function deliver(
  collaborationId: string,
  assetUrl: string,
  recipient: string,
  channel: string,
): Promise<Result> {
  const { app } = await requireUser();
  if (!assetUrl.trim()) return { error: 'Falta a ligação do arquivo entregue.' };
  const result = await recordDelivery({
    collaborationId,
    assetUrl: assetUrl.trim(),
    recipient: recipient.trim(),
    channel: channel.trim() || 'email',
    actorUserId: app.id,
  });
  if (!result.ok) return { error: result.error };
  refreshOs();
  revalidatePath(`/dashboard/production/${collaborationId}`);
  return { ok: true };
}

export async function logFeedback(
  deliverableId: string,
  collaborationId: string,
  feedback: string,
  classification: 'in_scope' | 'subjective' | 'brief_change' | 'new_deliverable',
): Promise<Result> {
  const { app } = await requireUser();
  await recordFeedback({ deliverableId, feedback, classification, actorUserId: app.id });
  revalidatePath(`/dashboard/production/${collaborationId}`);
  return { ok: true };
}

export async function approve(deliverableId: string, collaborationId: string): Promise<Result> {
  const { app } = await requireUser();
  await approveDelivery(deliverableId, app.id);
  refreshOs();
  revalidatePath(`/dashboard/production/${collaborationId}`);
  return { ok: true };
}

/* ── Conteúdo e criativo ────────────────────────────────────────────────── */

export async function saveContentAsset(input: Parameters<typeof saveContent>[0]): Promise<Result & { id?: string }> {
  await requireUser();
  if (!input.title?.trim()) return { error: 'O conteúdo precisa de um título.' };
  const result = await saveContent(input);
  if (!result.ok) return { error: result.error };
  if (input.collaborationId) revalidatePath(`/dashboard/production/${input.collaborationId}`);
  revalidatePath('/dashboard/content');
  return { ok: true, id: result.id };
}

export async function buildShotList(contentId: string, script: string, mandatory: string[]): Promise<Result> {
  await requireUser();
  await saveShotList(contentId, shotListFromScript(script, mandatory));
  revalidatePath('/dashboard/content');
  return { ok: true };
}

export async function scriptApproved(contentId: string, collaborationId?: string): Promise<Result> {
  const { app } = await requireUser();
  await approveScript(contentId, app.id);
  if (collaborationId) revalidatePath(`/dashboard/production/${collaborationId}`);
  return { ok: true };
}

export async function creativeIdeas(
  brandId: string,
  opportunityId: string | null,
  product: string,
  objective: string,
): Promise<Result & { created?: number }> {
  await requireUser();
  const result = await generateHypotheses({
    brandId,
    opportunityId,
    product,
    objective,
    flags: await getFlags(),
  });
  if (!result.ok) return { error: result.message };
  revalidatePath(`/dashboard/brands/${brandId}`);
  return { ok: true, created: result.created };
}

/* ── Cases e portfólio ──────────────────────────────────────────────────── */

export async function createCaseDraft(collaborationId: string): Promise<Result & { id?: string }> {
  const { app } = await requireUser();
  const result = await draftCase(collaborationId, app.id);
  if (!result.ok) return { error: result.error };
  revalidatePath('/dashboard/cases');
  return { ok: true, id: result.id };
}

export async function saveCase(caseId: string, patch: Record<string, unknown>): Promise<Result> {
  await requireUser();
  await updateCase(caseId, patch as Parameters<typeof updateCase>[1]);
  revalidatePath('/dashboard/cases');
  return { ok: true };
}

export async function casePermission(caseId: string, permission: string): Promise<Result> {
  const { app } = await requireUser();
  await setPermission(caseId, permission as 'unknown' | 'requested' | 'granted' | 'denied', app.id);
  revalidatePath('/dashboard/cases');
  return { ok: true };
}

export async function publishCase(
  caseId: string,
  mediaItemIds: string[],
  niche: string,
): Promise<Result> {
  const { app } = await requireUser();
  if (!mediaItemIds.length) return { error: 'Escolhe pelo menos um arquivo da biblioteca.' };
  const result = await publishToPortfolio({ caseId, mediaItemIds, niche, actorUserId: app.id });
  if (!result.ok) return { error: result.error };
  revalidatePath('/dashboard/cases');
  revalidatePath('/');
  return { ok: true };
}

export async function unpublishCase(caseId: string): Promise<Result> {
  await requireUser();
  await unpublishFromPortfolio(caseId);
  revalidatePath('/dashboard/cases');
  revalidatePath('/');
  return { ok: true };
}

export async function askForMetrics(collaborationId: string): Promise<Result> {
  const { app } = await requireUser();
  await requestMetrics(collaborationId, app.id);
  revalidatePath(`/dashboard/production/${collaborationId}`);
  return { ok: true };
}

/* ── Dinheiro ───────────────────────────────────────────────────────────── */

export async function addPayment(input: {
  brandId: string;
  collaborationId?: string | null;
  opportunityId?: string | null;
  kind: 'cash' | 'reimbursement' | 'barter' | 'usage_license';
  amountCents: number;
  dueAt?: string | null;
  invoiceRef?: string;
}): Promise<Result> {
  const { app } = await requireUser();
  if (!input.amountCents || input.amountCents < 0) return { error: 'Escreve um valor válido.' };
  const result = await recordPayment({ ...input, actorUserId: app.id });
  if (!result.ok) return { error: result.error };
  revalidatePath('/dashboard/revenue');
  refreshOs();
  return { ok: true };
}

export async function paymentReceived(paymentId: string): Promise<Result> {
  const { app } = await requireUser();
  await markPaid(paymentId, app.id);
  revalidatePath('/dashboard/revenue');
  refreshOs();
  return { ok: true };
}

/* ── Marcas ─────────────────────────────────────────────────────────────── */

export async function rescoreBrand(
  brandId: string,
  signals: Record<string, number | undefined>,
  nicheId: string | null,
): Promise<Result> {
  await requireUser();
  const db = await supabaseServer();
  await scoreAndSaveFit(db, brandId, { ...signals, nicheId });
  revalidatePath(`/dashboard/brands/${brandId}`);
  revalidatePath('/dashboard/brands');
  return { ok: true };
}

export async function overrideFit(brandId: string, score: number, reason: string): Promise<Result> {
  const { app } = await requireUser();
  if (!reason.trim()) return { error: 'Um override precisa de motivo escrito.' };
  const db = await supabaseServer();
  await db
    .from('brand')
    .update({
      fit_override: { score, reason: reason.trim(), at: new Date().toISOString(), by: app.id },
    })
    .eq('id', brandId);
  revalidatePath(`/dashboard/brands/${brandId}`);
  return { ok: true };
}

export async function mergeBrands(keepId: string, mergeId: string): Promise<Result> {
  const { app } = await requireUser();
  if (keepId === mergeId) return { error: 'São a mesma marca.' };
  const db = await supabaseServer();

  // Mover em vez de apagar: o histórico da marca absorvida tem de sobreviver.
  for (const table of ['opportunity', 'contact', 'brand_identity', 'activity_event', 'action_item',
    'product', 'rights_license', 'payment', 'case_study', 'source_thread', 'content_asset'] as const) {
    await db.from(table).update({ brand_id: keepId }).eq('brand_id', mergeId);
  }
  await db.from('brand').update({ status: 'archived' }).eq('id', mergeId);

  const { recordEvent } = await import('@/modules/activity/service');
  await recordEvent(db, {
    eventType: 'brand.merged',
    brandId: keepId,
    actorType: 'carol',
    actorUserId: app.id,
    summary: 'Duas fichas juntas depois de confirmação humana.',
    payload: { keepId, mergeId },
  });

  refreshOs();
  return { ok: true };
}

/* ── Definições ─────────────────────────────────────────────────────────── */

export async function toggleFlag(key: string, value: boolean): Promise<Result> {
  await requireUser();
  await setFlag(key as FlagKey, value);
  revalidatePath('/dashboard/settings');
  refreshOs();
  return { ok: true };
}

/** Devolve uma frase, não um objecto. A tela mostra o que vier daqui, e um
 *  `JSON.stringify` numa caixa de aviso é a máquina a falar com você própria. */
export async function triggerJob(job: string): Promise<Result & { message?: string }> {
  await requireUser();
  const { jobOutcome } = await import('@/modules/jobs/outcome');
  const result = await runJob(job as JobName, { manual: true });
  revalidatePath('/dashboard/settings');
  refreshOs();

  if (result.status === 'error') {
    const detail = result.detail as { error?: string } | null;
    return { error: detail?.error ?? 'O trabalho falhou.' };
  }
  // Saltado não é feito. Dizer «correu» quando nada correu é o pior resultado
  // possível: ela deixa de vigiar uma coisa que ninguém está fazendo.
  if (result.status === 'skipped') {
    const detail = result.detail as { reason?: string; detail?: string } | null;
    return { ok: true, message: `Não correu — ${detail?.reason ?? detail?.detail ?? 'está desligado.'}` };
  }
  return { ok: true, message: jobOutcome(job, result.detail) };
}

/** Corre a cadeia toda pela ordem certa, para quando ela não quer esperar pela
 *  próxima passagem do agendador nem carregar em sete botões. */
export async function triggerAllJobs(): Promise<Result & { message?: string }> {
  await requireUser();
  const { runAllJobs } = await import('@/modules/jobs/runner');
  const { jobOutcome } = await import('@/modules/jobs/outcome');

  const results = await runAllJobs({ manual: true });
  revalidatePath('/dashboard/settings');
  refreshOs();

  const { jobLabel } = await import('@/lib/labels');
  const failed = results.filter((r) => r.status === 'error');
  const skipped = results.filter((r) => r.status === 'skipped');
  const lines = results
    .filter((r) => r.status === 'success')
    .map((r) => jobOutcome(r.job, r.detail))
    // O que não teve nada a dizer não ocupa espaço no relatório.
    .filter((l) => !/^(Nada|Nenhum|Não hav)/.test(l));

  if (failed.length) {
    return { error: `${failed.map((f) => jobLabel(f.job)).join(', ')} falharam.` };
  }

  const parts: string[] = [];
  parts.push(lines.length ? lines.join(' ') : 'Corri tudo, não havia nada de novo.');
  // Saltado aparece sempre e com nome. Silenciar isto era dizer que correu.
  if (skipped.length) {
    parts.push(`Não correram: ${skipped.map((r) => jobLabel(r.job)).join(', ')}.`);
  }
  return { ok: true, message: parts.join(' ') };
}

/* ── Dossiê de marca ────────────────────────────────────────────────────── */

export async function researchBrand(brandId: string): Promise<Result & { fitScore?: number }> {
  await requireUser();
  const { buildDossier } = await import('@/modules/brands/dossier');
  const result = await buildDossier(brandId, await getFlags());
  if (!result.ok) return { error: result.message };
  revalidatePath(`/dashboard/brands/${brandId}`);
  revalidatePath('/dashboard/brands');
  return { ok: true, fitScore: result.fitScore };
}

/* ── Documentos ─────────────────────────────────────────────────────────── */

export async function buildProposal(
  opportunityId: string,
): Promise<Result & { id?: string; warnings?: string[] }> {
  const { app } = await requireUser();
  const { proposalFromOpportunity } = await import('@/modules/documents/service');
  const result = await proposalFromOpportunity(opportunityId, app.id);
  if (!result.ok) return { error: result.error };
  revalidatePath('/dashboard/documents');
  revalidatePath(`/dashboard/opportunities/${opportunityId}`);
  return { ok: true, id: result.id, warnings: result.warnings };
}

export async function sendDocument(documentId: string, opportunityId?: string): Promise<Result> {
  const { app } = await requireUser();
  const { markDocumentSent } = await import('@/modules/documents/service');
  const result = await markDocumentSent(documentId, app.id);
  if (!result.ok) return { error: result.error };
  revalidatePath('/dashboard/documents');
  if (opportunityId) revalidatePath(`/dashboard/opportunities/${opportunityId}`);
  refreshOs();
  return { ok: true };
}

export async function attachDocument(documentId: string, opportunityId: string): Promise<Result> {
  const { app } = await requireUser();
  const { linkDocument } = await import('@/modules/documents/service');
  const result = await linkDocument(documentId, opportunityId, app.id);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/dashboard/opportunities/${opportunityId}`);
  return { ok: true };
}

export async function buildUsageDoc(licenseId: string): Promise<Result & { id?: string }> {
  const { app } = await requireUser();
  const { usageDocFromLicense } = await import('@/modules/documents/service');
  const result = await usageDocFromLicense(licenseId, app.id);
  if (!result.ok) return { error: result.error };
  revalidatePath('/dashboard/documents');
  revalidatePath('/dashboard/revenue');
  return { ok: true, id: result.id };
}

/* ── Agendador (Supabase pg_cron) ───────────────────────────────────────── */

export async function setUpScheduler(): Promise<Result & { jobs?: number }> {
  await requireUser();
  const { configureScheduler } = await import('@/modules/jobs/scheduler');
  const result = await configureScheduler();
  revalidatePath('/dashboard/settings');
  return result.ok ? { ok: true, jobs: result.jobs } : { error: result.error };
}

export async function stopScheduler(): Promise<Result & { jobs?: number }> {
  await requireUser();
  const { clearSchedule } = await import('@/modules/jobs/scheduler');
  const result = await clearSchedule();
  revalidatePath('/dashboard/settings');
  return result.ok ? { ok: true, jobs: result.jobs } : { error: result.error };
}

/* ── Ler e responder um email sem sair do CarolOS ────────────────────────── */

export type MailMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  sentAt: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  body: string;
};

export type MailThread = {
  id: string;
  subject: string;
  brandId: string | null;
  brandName: string | null;
  opportunityId: string | null;
  /** Para quem vai a resposta: o último remetente de fora. */
  replyTo: string | null;
  messages: MailMessage[];
  /** O que a marca pediu, já classificado na ingestão. */
  asks: string[];
  /** O que o planeador decidiu que é o próximo passo desta oportunidade.
   *
   *  É a recomendação, e é determinística: sai das mesmas regras que enchem o
   *  Hoje. Não depende de haver chave de modelo — o que dependia disso era a
   *  frase escrita, não a decisão. */
  next: { title: string; reason: string; cta: string } | null;
  /** Há quantos dias a marca está à espera. Nulo se a bola não é dela. */
  waitingDays: number | null;
  /** O que a triagem da madrugada preparou: quem escreveu, o que quer, o que
   *  falta, o risco, a recomendação e a resposta já escrita.
   *
   *  Nulo quando a triagem ainda não correu para esta conversa — e nesse caso a
   *  gaveta continua funcionando como funcionava, com a recomendação
   *  determinística do planeador. */
  intel: {
    intentLabel: string;
    waitingOn: 'carol' | 'brand' | 'nobody';
    whoWrote: string;
    whatTheyWant: string;
    whatChanged: string;
    whatIsMissing: string;
    risk: string;
    riskLevel: string;
    recommendation: string;
    draftSubject: string;
    draftBody: string;
    draftState: string;
    draftReason: string;
    preparedAt: string | null;
  } | null;
};

/** O corpo das mensagens já está salvo na ingestão, por isso ler uma
 *  conversa não gasta uma ida ao Gmail nem depende de ele estar de pé. */
export async function readMailThread(threadId: string): Promise<MailThread | { error: string }> {
  await requireUser();
  if (!z.string().uuid().safeParse(threadId).success) return { error: 'Conversa inválida.' };

  const db = await supabaseServer();
  const { data: thread, error } = await db
    .from('source_thread')
    .select('id, subject, brand_id, opportunity_id, brand:brand_id ( name )')
    .eq('id', threadId)
    .maybeSingle();

  if (error) return { error: 'Não consegui ler a conversa.' };
  if (!thread) return { error: 'Conversa não encontrada.' };

  const { data: rows } = await db
    .from('source_message')
    .select('id, direction, sent_at, from_address, from_name, subject, body_text')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true });

  const messages = (rows ?? []).map((m) => ({
    id: m.id,
    direction: m.direction as 'inbound' | 'outbound',
    sentAt: m.sent_at,
    fromAddress: m.from_address,
    fromName: m.from_name,
    subject: m.subject,
    body: decodeEntities(m.body_text ?? ''),
  }));

  const brand = thread.brand as { name: string } | { name: string }[] | null;
  const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
  const last = messages[messages.length - 1];

  // A recomendação e os pedidos, em duas leituras pequenas e em paralelo.
  const [acoes, classificacao] = await Promise.all([
    thread.opportunity_id
      ? db
          .from('action_item')
          .select('title, reason, type')
          .eq('opportunity_id', thread.opportunity_id)
          .eq('status', 'open')
          .order('priority_score', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null }),
    thread.opportunity_id
      ? db
          .from('activity_event')
          .select('payload')
          .eq('opportunity_id', thread.opportunity_id)
          .eq('event_type', 'reply.classified')
          .order('occurred_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null }),
  ]);

  const proxima = acoes.data?.[0] ?? null;
  const payload = (classificacao.data?.[0]?.payload ?? {}) as { replyTypes?: string[] };

  const { intelForThread } = await import('@/modules/email/triage-service');
  const intel = await intelForThread(threadId).catch(() => null);

  return {
    id: thread.id,
    subject: thread.subject,
    brandId: thread.brand_id,
    brandName: Array.isArray(brand) ? (brand[0]?.name ?? null) : (brand?.name ?? null),
    opportunityId: thread.opportunity_id,
    replyTo: lastInbound?.fromAddress ?? null,
    messages,
    asks: payload.replyTypes ?? [],
    next: proxima
      ? {
          title: proxima.title,
          reason: proxima.reason,
          cta: ACTION_CTA[proxima.type as ActionType] ?? 'Abrir',
        }
      : null,
    waitingDays:
      last?.direction === 'inbound'
        ? Math.max(0, Math.round((Date.now() - new Date(last.sentAt).getTime()) / 86400000))
        : null,
    intel: intel
      ? {
          intentLabel: intel.intentLabel,
          waitingOn: intel.waitingOn,
          whoWrote: intel.whoWrote,
          whatTheyWant: intel.whatTheyWant,
          whatChanged: intel.whatChanged,
          whatIsMissing: intel.whatIsMissing,
          risk: intel.risk,
          riskLevel: intel.riskLevel,
          recommendation: intel.recommendation,
          draftSubject: intel.draftSubject,
          draftBody: intel.draftBody,
          draftState: intel.draftState,
          draftReason: intel.draftReason,
          preparedAt: intel.preparedAt,
        }
      : null,
  };
}

/** A resposta sai como rascunho na caixa dela, dentro da mesma conversa.
 *
 *  Regra 3 do CarolOS: nada sai para fora sozinho. Escrever aqui e enviar daqui
 *  seriam duas decisões diferentes, e a segunda não está tomada — por isso o
 *  botão prepara, e é ela que clica em enviar no Gmail. */
export async function replyToMailThread(threadId: string, body: string): Promise<Result> {
  await requireUser();

  const text = body.trim();
  if (!z.string().uuid().safeParse(threadId).success) return { error: 'Conversa inválida.' };
  if (text.length < 2) return { error: 'Escreve a resposta primeiro.' };
  if (text.length > 20000) return { error: 'Resposta demasiado longa para um email.' };

  const flags = await getFlags();
  if (!flags.gmail_draft_creation) {
    return { error: 'A bandeira «Criar rascunho no Gmail» está fechada.' };
  }

  const db = await supabaseServer();
  const { data: thread } = await db
    .from('source_thread')
    .select('id, subject, external_thread_id, connection_id')
    .eq('id', threadId)
    .maybeSingle();
  if (!thread) return { error: 'Conversa não encontrada.' };

  const { data: last } = await db
    .from('source_message')
    .select('from_address')
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!last?.from_address) return { error: 'Esta conversa não tem remetente para responder.' };

  const { accessTokenFor } = await import('@/modules/integrations/gmail/oauth');
  const { createDraft } = await import('@/modules/integrations/gmail/client');

  const auth = await accessTokenFor(thread.connection_id ?? undefined);
  if (!auth) return { error: 'Sem ligação válida ao Gmail.' };

  const subject = thread.subject.toLowerCase().startsWith('re:')
    ? thread.subject
    : `Re: ${thread.subject}`;

  try {
    await createDraft(auth.token, {
      to: last.from_address,
      subject,
      body: text,
      from: auth.account,
      threadId: thread.external_thread_id ?? undefined,
    });
  } catch {
    return { error: 'O Gmail recusou criar o rascunho. Verifica a ligação em Definições.' };
  }

  const { recordEvent } = await import('@/modules/activity/service');
  const { supabaseService } = await import('@/lib/supabase/service');
  await recordEvent(supabaseService(), {
    eventType: 'reply.drafted',
    actorType: 'carol',
    sourceThreadId: threadId,
    summary: `Rascunho de resposta preparado para ${last.from_address}.`,
    payload: { to: last.from_address, chars: text.length },
  });

  revalidatePath('/dashboard/inbox');
  return { ok: true };
}
