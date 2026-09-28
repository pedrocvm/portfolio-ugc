'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { TOPIC_STATES, type TopicState } from '@/modules/editorial/domain';
import {
  adjustPiece,
  approvePiece,
  generateWeek,
  replacePiece,
  setTopicState,
} from '@/modules/editorial/service';

const refresh = () => {
  revalidatePath('/dashboard/content');
  revalidatePath('/dashboard/content/map');
  revalidatePath('/dashboard/content/production');
};

export async function generateWeekAction() {
  const { app } = await requireUser();
  const result = await generateWeek(app.id);
  refresh();
  if (!result.ok) redirect(`/dashboard/content?error=${encodeURIComponent(result.error)}`);
  redirect('/dashboard/content');
}

export async function approveProposalAction(formData: FormData) {
  const { app } = await requireUser();
  const pieceId = String(formData.get('pieceId') ?? '');
  const result = await approvePiece(app.id, pieceId);
  refresh();
  if (!result.ok) redirect(`/dashboard/content?error=${encodeURIComponent(result.error)}`);
  redirect('/dashboard/content');
}

export async function replaceProposalAction(formData: FormData) {
  const { app } = await requireUser();
  const pieceId = String(formData.get('pieceId') ?? '');
  const result = await replacePiece(app.id, pieceId);
  refresh();
  if (!result.ok) redirect(`/dashboard/content?error=${encodeURIComponent(result.error)}`);
  redirect('/dashboard/content');
}

export async function adjustProposalAction(formData: FormData) {
  const { app } = await requireUser();
  const pieceId = String(formData.get('pieceId') ?? '');
  const feedback = String(formData.get('feedback') ?? '');
  const result = await adjustPiece(app.id, pieceId, feedback);
  refresh();
  if (!result.ok) redirect(`/dashboard/content?error=${encodeURIComponent(result.error)}`);
  redirect('/dashboard/content');
}

export async function setTopicStateAction(formData: FormData) {
  const { app } = await requireUser();
  const topicId = String(formData.get('topicId') ?? '');
  const rawState = String(formData.get('state') ?? '');
  if (!TOPIC_STATES.includes(rawState as TopicState)) redirect('/dashboard/content/map?error=Estado%20inválido');
  const result = await setTopicState(app.id, topicId, rawState as TopicState);
  refresh();
  if (!result.ok) redirect(`/dashboard/content/map?error=${encodeURIComponent(result.error)}`);
  redirect('/dashboard/content/map');
}
