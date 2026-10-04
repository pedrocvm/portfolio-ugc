'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { processPendingReferences, processReference } from '@/modules/saved-references/processor';
import {
  attachReferenceMedia, cancelReferenceUpload, completeReferenceUpload,
  createReferenceConnection, createReferenceDraft, createSavedReference, deleteSavedReference,
  getSavedReference, listReferenceScreen, referenceErrorMessage, retrySavedReference, saveReferenceSettings,
  setReferenceConnectionEnabled, updateSavedReference,
} from '@/modules/saved-references/service';
import type { ReferenceScreenQuery } from '@/modules/saved-references/query';

type Failure = { ok: false; error: string };
const failure = (error: unknown): Failure => ({ ok: false, error: referenceErrorMessage(error) });

function refresh() {
  revalidatePath('/dashboard/content/references');
  revalidatePath('/dashboard/content');
}

function schedule(id?: string) {
  after(async () => {
    try {
      if (id) await processReference(id);
      else await processPendingReferences(2);
    } catch {
      // A fila persistente permite tentar novamente na próxima visita.
    }
  });
}

export async function listReferenceScreenAction(query: ReferenceScreenQuery = {}) {
  await requireUser();
  try {
    const screen = await listReferenceScreen(undefined, query);
    schedule();
    return { ok: true as const, screen };
  } catch (error) { return failure(error); }
}

export async function getReferenceAction(id: string) {
  await requireUser();
  try {
    const reference = await getSavedReference(id);
    return { ok: true as const, reference };
  } catch (error) { return failure(error); }
}

export async function createReferenceAction(input: unknown) {
  const user = await requireUser();
  try {
    const result = await createSavedReference(input, { createdBy: user.app.id });
    if (result.uploads.length === 0) schedule(result.id);
    refresh();
    return { ok: true as const, ...result };
  } catch (error) { return failure(error); }
}

export async function attachReferenceMediaAction(id: string, assets: unknown, uploadBatchId?: string | null) {
  await requireUser();
  try {
    const result = await attachReferenceMedia(id, assets, undefined, uploadBatchId);
    if (result.uploads.length === 0) schedule(result.id);
    refresh();
    return { ok: true as const, ...result };
  } catch (error) { return failure(error); }
}

export async function completeReferenceUploadAction(id: string, uploadBatchId?: string | null) {
  await requireUser();
  try {
    await completeReferenceUpload(id, { uploadBatchId });
    schedule(id);
    refresh();
    return { ok: true as const };
  } catch (error) { return failure(error); }
}

export async function cancelReferenceUploadAction(id: string, uploadBatchId: string) {
  await requireUser();
  try {
    await cancelReferenceUpload(id, uploadBatchId);
    schedule(id);
    refresh();
    return { ok: true as const };
  } catch (error) { return failure(error); }
}

export async function retryReferenceAction(id: string) {
  await requireUser();
  try {
    await retrySavedReference(id);
    schedule(id);
    refresh();
    return { ok: true as const };
  } catch (error) { return failure(error); }
}

export async function updateReferenceAction(id: string, input: { caption: string; transcript: string; notes: string }) {
  await requireUser();
  try {
    await updateSavedReference(id, input);
    schedule(id);
    refresh();
    return { ok: true as const };
  } catch (error) { return failure(error); }
}

export async function saveReferenceSettingsAction(realityNotes: string) {
  await requireUser();
  try {
    await saveReferenceSettings(realityNotes);
    refresh();
    return { ok: true as const };
  } catch (error) { return failure(error); }
}

export async function createReferenceConnectionAction(collectionName: string) {
  const user = await requireUser();
  try {
    const result = await createReferenceConnection(collectionName, user.app.id);
    refresh();
    return { ok: true as const, ...result };
  } catch (error) { return failure(error); }
}

export async function setReferenceConnectionEnabledAction(enabled: boolean) {
  await requireUser();
  if (!z.boolean().safeParse(enabled).success) return { ok: false as const, error: 'Opção inválida.' };
  try {
    await setReferenceConnectionEnabled(enabled);
    refresh();
    return { ok: true as const };
  } catch (error) { return failure(error); }
}

export async function createReferenceDraftAction(input: unknown) {
  await requireUser();
  try {
    const itemId = await createReferenceDraft(input);
    refresh();
    return { ok: true as const, itemId };
  } catch (error) { return failure(error); }
}

export async function deleteReferenceAction(id: string) {
  await requireUser();
  try {
    await deleteSavedReference(id);
    refresh();
    return { ok: true as const };
  } catch (error) { return failure(error); }
}
