'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { strategyClient } from '@/lib/supabase/strategy';
import type { FocusItem, Pillar, TopicState } from '@/modules/content-brain/editorial';
import {
  addTopic,
  saveStrategySettings,
  setFocus,
  setTemplateToken,
  setTopicState,
} from '@/modules/content-brain/editorial-service';
import {
  adjustProposal,
  advanceProposal,
  approveProposal,
  dropProposal,
  runWeek,
  swapProposal,
  type AdjustableField,
} from '@/modules/content-brain/week-service';
import {
  attachStory,
  editPack,
  generatePack,
  reopenPack,
  setPackTemplate,
  validatePack,
  NEEDS_RAW_MATERIAL,
} from '@/modules/content-brain/pack-service';
import { captureReference, setRadarCreator, removeRadarCreator } from '@/modules/content-brain/lab-service';
import { buildSession, closeSession } from '@/modules/content-brain/session-service';
import type { ProposalStatus } from '@/modules/content-brain/pipeline';

/** As ações da Semana, do Mapa e da Produção.
 *
 *  Finas: autenticar, validar a forma, chamar o serviço, revalidar. A regra
 *  editorial vive no domínio — repeti-la aqui era garantir que as duas cópias
 *  divergiam na primeira mudança. */

export type Result = { ok: true } | { error: string };
export type ResultWith<T> = ({ ok: true } & T) | { error: string };

const refresh = () => {
  revalidatePath('/dashboard/content');
  revalidatePath('/dashboard');
};

/* ── Semana ───────────────────────────────────────────────────────────────── */

export async function buildThisWeek(force = false): Promise<ResultWith<{ created: number; summary: string }>> {
  await requireUser();
  // Com a sessão dela, não com a chave de service role. O botão tem de
  // funcionar hoje, e `SUPABASE_SERVICE_ROLE_KEY` ainda não está no ambiente:
  // sem isto, «Montar a semana» rebentava com «falta a chave».
  const r = await runWeek({ db: strategyClient(await supabaseServer()), force });
  refresh();
  return { ok: true, created: r.created, summary: r.summary };
}

export async function approveThis(proposalId: string): Promise<Result> {
  await requireUser();
  const r = await approveProposal(proposalId);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function adjustThis(
  proposalId: string,
  field: AdjustableField,
  value: string,
): Promise<Result> {
  await requireUser();
  const r = await adjustProposal(proposalId, field, value);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function swapThis(proposalId: string): Promise<ResultWith<{ replaced: boolean }>> {
  await requireUser();
  const r = await swapProposal(proposalId);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true, replaced: r.data.replaced };
}

export async function dropThis(proposalId: string): Promise<Result> {
  await requireUser();
  const r = await dropProposal(proposalId);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function moveProposal(proposalId: string, to: ProposalStatus): Promise<Result> {
  await requireUser();
  const r = await advanceProposal(proposalId, to);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

/* ── Material ─────────────────────────────────────────────────────────────── */

export async function prepareMaterial(
  proposalId: string,
): Promise<ResultWith<{ gaps: string[]; needsStory?: true }>> {
  await requireUser();
  const r = await generatePack(proposalId);
  if (!r.ok) {
    // Falta matéria-prima não é falha: é o passo seguinte. A tela leva ela a
    // contar o que aconteceu em vez de oferecer «tentar outra vez».
    if (r.error === NEEDS_RAW_MATERIAL) return { ok: true, gaps: [], needsStory: true };
    return { error: r.error };
  }
  refresh();
  return { ok: true, gaps: r.data.gaps };
}

export async function linkStoryToProposal(proposalId: string, storyId: string): Promise<Result> {
  await requireUser();
  const r = await attachStory(proposalId, storyId);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function saveMaterial(packId: string, payload: unknown): Promise<ResultWith<{ gaps: string[] }>> {
  await requireUser();
  const r = await editPack(packId, payload);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true, gaps: r.data.gaps };
}

export async function chooseTemplate(packId: string, templateKey: string): Promise<Result> {
  await requireUser();
  const r = await setPackTemplate(packId, templateKey);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function validateMaterial(packId: string): Promise<Result> {
  await requireUser();
  const r = await validatePack(packId);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function adjustMaterial(proposalId: string, note: string): Promise<Result> {
  await requireUser();
  const r = await reopenPack(proposalId, note);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

/* ── Mapa ─────────────────────────────────────────────────────────────────── */

export async function changeTopicState(topicId: string, state: TopicState, reason = ''): Promise<Result> {
  await requireUser();
  const r = await setTopicState(topicId, state, reason);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function createTopic(input: {
  pillar: Pillar;
  label: string;
  howToTreat?: string;
}): Promise<Result> {
  await requireUser();
  const r = await addTopic(input);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function changeFocus(items: FocusItem[], note?: string): Promise<Result> {
  await requireUser();
  const r = await setFocus(items, { note });
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function changeCapacity(weeklyCapacity: number): Promise<Result> {
  await requireUser();
  if (!Number.isInteger(weeklyCapacity) || weeklyCapacity < 1 || weeklyCapacity > 7) {
    return { error: 'A capacidade tem de ser entre 1 e 7.' };
  }
  const r = await saveStrategySettings({ weeklyCapacity });
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function changeStockTarget(stockTarget: number): Promise<Result> {
  await requireUser();
  if (!Number.isInteger(stockTarget) || stockTarget < 0 || stockTarget > 10) {
    return { error: 'O estoque tem de ser entre 0 e 10.' };
  }
  const r = await saveStrategySettings({ stockTarget });
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function decideToken(templateKey: string, token: string, value: string): Promise<Result> {
  await requireUser();
  const r = await setTemplateToken(templateKey, token, value);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

/* ── Laboratório ──────────────────────────────────────────────────────────── */

export async function saveReference(url: string, note?: string): Promise<ResultWith<{ id: string; analysed: boolean }>> {
  await requireUser();
  const r = await captureReference({ url, note });
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true, id: r.data.id, analysed: r.data.analysed };
}

export async function addRadarCreator(input: { handle: string; platform?: string; why?: string }): Promise<Result> {
  await requireUser();
  const r = await setRadarCreator(input);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

export async function dropRadarCreator(id: string): Promise<Result> {
  await requireUser();
  const r = await removeRadarCreator(id);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}

/* ── Sessão de produção ───────────────────────────────────────────────────── */

export async function groupSession(): Promise<ResultWith<{ sessions: number }>> {
  await requireUser();
  const r = await buildSession();
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true, sessions: r.data.sessions };
}

export async function finishSession(sessionId: string): Promise<Result> {
  await requireUser();
  const r = await closeSession(sessionId);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: true };
}
