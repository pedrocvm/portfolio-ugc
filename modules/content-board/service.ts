import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import type { ContentBoardItem, ContentPillar, ContentStage } from './domain';

// A migration entra junto com este módulo. O arquivo gerado de tipos é regenerado
// depois que a migration estiver aplicada no projeto remoto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentDb = SupabaseClient<any>;

const contentDb = async () => (await supabaseServer()) as unknown as ContentDb;

const SELECT =
  'id, pillar, format, subject, script, scheduled_for, stage, position, created_at, updated_at';

type RawContentBoardItem = {
  id: string;
  pillar: ContentPillar;
  format: string;
  subject: string;
  script: string;
  scheduled_for: string;
  stage: ContentStage;
  position: number;
  created_at: string;
  updated_at: string;
};

const toItem = (row: RawContentBoardItem): ContentBoardItem => ({
  id: row.id,
  pillar: row.pillar,
  format: row.format,
  subject: row.subject,
  script: row.script,
  scheduledFor: row.scheduled_for,
  stage: row.stage,
  position: row.position,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function listContentBoard(input: {
  from: string;
  to: string;
}): Promise<ContentBoardItem[]> {
  const db = await contentDb();
  const { data, error } = await db
    .from('content_board_item')
    .select(SELECT)
    .gte('scheduled_for', input.from)
    .lte('scheduled_for', input.to)
    .order('scheduled_for')
    .order('position')
    .order('created_at');

  if (error) throw new Error(`Falha ao ler o gerenciador de conteúdo: ${error.message}`);
  return ((data ?? []) as unknown as RawContentBoardItem[]).map(toItem);
}

export async function saveContentBoardItem(input: {
  id?: string;
  pillar: ContentPillar;
  format: string;
  subject: string;
  script: string;
  scheduledFor: string;
  stage: ContentStage;
}): Promise<{ ok: true; item: ContentBoardItem } | { ok: false; error: string }> {
  const db = await contentDb();

  const row = {
    pillar: input.pillar,
    format: input.format.trim(),
    subject: input.subject.trim(),
    script: input.script,
    scheduled_for: input.scheduledFor,
    stage: input.stage,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await db
      .from('content_board_item')
      .update(row)
      .eq('id', input.id)
      .select(SELECT)
      .maybeSingle();

    if (error || !data) {
      return { ok: false, error: error?.message ?? 'Não foi possível atualizar o conteúdo.' };
    }

    return { ok: true, item: toItem(data as unknown as RawContentBoardItem) };
  }

  const { data: last } = await db
    .from('content_board_item')
    .select('position')
    .eq('scheduled_for', input.scheduledFor)
    .eq('stage', input.stage)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from('content_board_item')
    .insert({ ...row, position: (last?.position ?? -1) + 1 })
    .select(SELECT)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Não foi possível criar o conteúdo.' };
  }

  return { ok: true, item: toItem(data as unknown as RawContentBoardItem) };
}

export async function moveContentBoardItem(input: {
  id: string;
  stage: ContentStage;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await contentDb();

  const { data: current, error: currentError } = await db
    .from('content_board_item')
    .select('scheduled_for')
    .eq('id', input.id)
    .maybeSingle();

  if (currentError || !current) {
    return { ok: false, error: currentError?.message ?? 'Conteúdo não encontrado.' };
  }

  const { data: last } = await db
    .from('content_board_item')
    .select('position')
    .eq('scheduled_for', current.scheduled_for)
    .eq('stage', input.stage)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await db
    .from('content_board_item')
    .update({
      stage: input.stage,
      position: (last?.position ?? -1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteContentBoardItem(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await contentDb();
  const { error } = await db.from('content_board_item').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
