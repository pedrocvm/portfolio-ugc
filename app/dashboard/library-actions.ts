'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { requireEditor } from '@/lib/auth';
import type { MediaItem } from '@/lib/library';
import { MEDIA_TAG } from '@/lib/content-store';
import { supabaseServer } from '@/lib/supabase/server';
import type { Result } from './actions';

export async function listMedia(): Promise<MediaItem[]> {
  await requireEditor();
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('media_item')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as MediaItem[];
}

export async function addMedia(item: {
  kind: 'video' | 'photo';
  url: string;
  storagePath: string;
  niche: string;
  title: string;
}): Promise<Result> {
  await requireEditor();
  if (!item.url) return { error: 'Falta o ficheiro.' };
  const supabase = await supabaseServer();
  const { error } = await supabase.from('media_item').insert({
    kind: item.kind,
    url: item.url,
    storage_path: item.storagePath,
    niche: item.niche,
    title: item.title,
  });
  if (error) return { error: 'Não foi possível guardar na biblioteca.' };
  revalidatePath('/dashboard/library');
  updateTag(MEDIA_TAG);
  return { ok: true };
}

export async function updateMedia(
  id: string,
  patch: { niche?: string; title?: string },
): Promise<Result> {
  await requireEditor();
  const supabase = await supabaseServer();
  const { error } = await supabase.from('media_item').update(patch).eq('id', id);
  if (error) return { error: 'Não foi possível guardar a alteração.' };
  revalidatePath('/dashboard/library');
  updateTag(MEDIA_TAG);
  return { ok: true };
}

/** Apaga o registo e também o ficheiro: deixar o ficheiro órfão no storage é
 *  como não apagar nada. */
export async function removeMedia(id: string): Promise<Result> {
  await requireEditor();
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('media_item')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('media_item').delete().eq('id', id);
  if (error) return { error: 'Não foi possível apagar.' };
  if (data?.storage_path) {
    await supabase.storage.from('media').remove([data.storage_path]);
  }
  revalidatePath('/dashboard/library');
  updateTag(MEDIA_TAG);
  return { ok: true };
}
