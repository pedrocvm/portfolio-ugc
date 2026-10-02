'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { PILLAR_KEYS, STAGE_KEYS } from '@/modules/content-board/domain';
import {
  deleteContentBoardItem,
  moveContentBoardItem,
  saveContentBoardItem,
} from '@/modules/content-board/service';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const contentSchema = z.object({
  id: z.string().uuid().optional(),
  pillar: z.enum(PILLAR_KEYS),
  format: z.string().max(80),
  subject: z.string().trim().min(1, 'Informe o assunto.').max(240),
  script: z.string().max(30000),
  scheduledFor: z.string().regex(datePattern, 'Data inválida.'),
  stage: z.enum(STAGE_KEYS),
});

const refresh = () => {
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/content');
};

export type ContentActionResult = { ok: true } | { ok: false; error: string };

export async function saveContentCard(input: z.input<typeof contentSchema>): Promise<ContentActionResult> {
  await requireUser();
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const result = await saveContentBoardItem(parsed.data);
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

export async function moveContentCard(input: {
  id: string;
  stage: string;
}): Promise<ContentActionResult> {
  await requireUser();
  const parsed = z
    .object({ id: z.string().uuid(), stage: z.enum(STAGE_KEYS) })
    .safeParse(input);

  if (!parsed.success) return { ok: false, error: 'Movimento inválido.' };

  const result = await moveContentBoardItem(parsed.data);
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

export async function removeContentCard(id: string): Promise<ContentActionResult> {
  await requireUser();
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: 'Conteúdo inválido.' };

  const result = await deleteContentBoardItem(parsed.data);
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}
