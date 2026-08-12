'use server';

import { revalidatePath } from 'next/cache';
import { requireEditor } from '@/lib/auth';
import { DOCS, type DocKind, type DocRow } from '@/lib/documents';
import { merge } from '@/lib/merge';
import { supabaseServer } from '@/lib/supabase/server';
import type { Result } from './actions';

const PATH = '/dashboard/documents';

export async function listDocs(kind: DocKind): Promise<DocRow[]> {
  await requireEditor();
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('document')
    .select('*')
    .eq('kind', kind)
    .order('updated_at', { ascending: false });
  return (data ?? []) as DocRow[];
}

export async function createDoc(kind: DocKind): Promise<Result & { id?: string }> {
  await requireEditor();
  const supabase = await supabaseServer();
  const blank = { ...DOCS[kind].blank, date: new Date().toISOString().slice(0, 10) };
  const { data, error } = await supabase
    .from('document')
    .insert({ kind, title: DOCS[kind].titleOf(blank), data: blank })
    .select('id')
    .single();
  if (error) return { error: 'Não foi possível criar o documento.' };
  revalidatePath(PATH);
  return { ok: true, id: data.id };
}

export async function saveDoc(
  id: string,
  kind: DocKind,
  input: unknown,
): Promise<Result> {
  await requireEditor();
  const clean = merge(DOCS[kind].blank, input);
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('document')
    .update({
      data: clean,
      title: DOCS[kind].titleOf(clean),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { error: 'Não foi possível guardar.' };
  revalidatePath(PATH);
  return { ok: true };
}

export async function removeDoc(id: string): Promise<Result> {
  await requireEditor();
  const supabase = await supabaseServer();
  const { error } = await supabase.from('document').delete().eq('id', id);
  if (error) return { error: 'Não foi possível apagar.' };
  revalidatePath(PATH);
  return { ok: true };
}
