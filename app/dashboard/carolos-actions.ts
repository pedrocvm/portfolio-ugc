'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import type { FlagKey } from '@/lib/flags';
import { supabaseServer } from '@/lib/supabase/server';
import { completeAction, dismissAction, replanActions, snoozeAction } from '@/modules/actions/service';
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

  if (error) return { error: 'Não foi possível guardar.' };
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
 *  fica escrita, o envio continua a ser um clique dela no Gmail. */
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

  if (!contact?.email) return { error: 'Esta marca ainda não tem um e-mail de contacto.' };

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
  if (!parsed.success) return { error: 'Âmbito inválido.' as const };
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
  if (!parsed.success) return { error: 'Âmbito inválido.' };

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

export async function capture(kind: string, raw: string, note: string): Promise<Result & { id?: string }> {
  await requireUser();
  const result = await createCapture({
    kind: (kind as CaptureKind) ?? 'text',
    raw,
    note,
    flags: await getFlags(),
  });
  revalidatePath('/dashboard/capture');
  return result.ok ? { ok: true, id: result.id } : { error: result.error };
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
  if (!assetUrl.trim()) return { error: 'Falta a ligação do ficheiro entregue.' };
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
  if (!mediaItemIds.length) return { error: 'Escolhe pelo menos um ficheiro da biblioteca.' };
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

export async function triggerJob(job: string): Promise<Result & { detail?: unknown }> {
  await requireUser();
  const result = await runJob(job as JobName);
  revalidatePath('/dashboard/settings');
  refreshOs();
  return result.status === 'error'
    ? { error: JSON.stringify(result.detail) }
    : { ok: true, detail: result.detail };
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
