'use server';

import { revalidatePath } from 'next/cache';
import { requireEditor } from '@/lib/auth';
import { CHANNELS, STAGES, type Brand } from '@/lib/brands';
import { supabaseServer } from '@/lib/supabase/server';
import type { Result } from './actions';

const isStage = (v: string) => STAGES.some((s) => s.id === v);
const isChannel = (v: string) => CHANNELS.some((c) => c.id === v);

export async function listBrands(): Promise<Brand[]> {
  await requireEditor();
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('brand')
    .select('*')
    .order('updated_at', { ascending: false });
  return (data ?? []) as Brand[];
}

function read(form: FormData) {
  const channel = String(form.get('channel') ?? 'instagram');
  const stage = String(form.get('stage') ?? 'abordada');
  const date = String(form.get('approached_on') ?? '');
  return {
    name: String(form.get('name') ?? '').trim(),
    instagram: String(form.get('instagram') ?? '').trim(),
    contact: String(form.get('contact') ?? '').trim(),
    channel: isChannel(channel) ? channel : 'instagram',
    stage: isStage(stage) ? stage : 'abordada',
    approached_on: date || null,
    next_step: String(form.get('next_step') ?? '').trim(),
    notes: String(form.get('notes') ?? '').trim(),
  };
}

export async function saveBrand(_prev: Result, form: FormData): Promise<Result> {
  await requireEditor();
  const id = String(form.get('id') ?? '');
  const values = read(form);
  if (!values.name) return { error: 'A marca precisa de um nome.' };

  const supabase = await supabaseServer();
  const { error } = id
    ? await supabase
        .from('brand')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', id)
    : await supabase.from('brand').insert(values);

  if (error) return { error: 'Não foi possível guardar a marca.' };
  revalidatePath('/dashboard/brands');
  revalidatePath('/dashboard/funnel');
  return { ok: true };
}

export async function moveBrand(id: string, stage: string): Promise<Result> {
  await requireEditor();
  if (!isStage(stage)) return { error: 'Etapa desconhecida.' };
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('brand')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: 'Não foi possível mudar a etapa.' };
  revalidatePath('/dashboard/brands');
  revalidatePath('/dashboard/funnel');
  return { ok: true };
}

export async function removeBrand(id: string): Promise<Result> {
  await requireEditor();
  const supabase = await supabaseServer();
  const { error } = await supabase.from('brand').delete().eq('id', id);
  if (error) return { error: 'Não foi possível apagar a marca.' };
  revalidatePath('/dashboard/brands');
  revalidatePath('/dashboard/funnel');
  return { ok: true };
}
