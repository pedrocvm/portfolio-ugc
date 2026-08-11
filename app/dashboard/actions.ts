'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { DEFAULT_CONTENT, type Content } from '@/lib/content';
import { CONTENT_TAG, getDraft } from '@/lib/content-store';
import { merge } from '@/lib/merge';
import { EDITOR_EMAIL, EDITOR_USERNAME, requireEditor } from '@/lib/auth';
import { MIN_PASSWORD, isPwned } from '@/lib/hibp';
import { supabaseServer } from '@/lib/supabase/server';

export type Result = { ok?: true; error?: string };

export async function signIn(_prev: Result, form: FormData): Promise<Result> {
  const id = String(form.get('id') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!id || !password) return { error: 'Preenche o utilizador e a palavra-passe.' };

  const email = id.includes('@')
    ? id
    : id.toLowerCase() === EDITOR_USERNAME
      ? EDITOR_EMAIL
      : id;

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Utilizador ou palavra-passe incorretos.' };
  redirect('/dashboard');
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/dashboard/login');
}

async function write(key: 'draft' | 'published', data: Content) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('site_content')
    .upsert({ key, data, updated_at: new Date().toISOString() });
  return error?.message;
}

/** Guarda só as secções tocadas, por cima do rascunho que está na base: o
 *  resto do site não depende do que esta janela tinha em memória. */
export async function saveDraft(patch: Record<string, unknown>): Promise<Result> {
  await requireEditor();
  const current = await getDraft().catch(() => null);
  if (!current) {
    return { error: 'Não foi possível guardar: o rascunho atual não pôde ser lido. Volta a tentar.' };
  }

  const error = await write('draft', merge(DEFAULT_CONTENT, { ...current, ...patch }));
  if (error) return { error: `Não foi possível guardar: ${error}` };
  revalidatePath('/preview');
  return { ok: true };
}

export async function publishDraft(): Promise<Result> {
  await requireEditor();
  const draft = await getDraft().catch(() => null);
  /* publicar o modelo de origem porque a leitura falhou apagava o site */
  if (!draft) {
    return { error: 'Não foi possível publicar: o rascunho não pôde ser lido. Volta a tentar.' };
  }

  const error = await write('published', draft);
  if (error) return { error: `Não foi possível publicar: ${error}` };
  updateTag(CONTENT_TAG);
  revalidatePath('/');
  revalidatePath('/contato');
  return { ok: true };
}

/** Volta a colocar no rascunho aquilo que está publicado. */
export async function discardDraft(): Promise<Result> {
  await requireEditor();
  const supabase = await supabaseServer();
  const { data, error: falha } = await supabase
    .from('site_content')
    .select('data')
    .eq('key', 'published')
    .maybeSingle();
  if (falha || !data) {
    return { error: 'Não foi possível repor: não consegui ler o que está publicado.' };
  }

  const error = await write('draft', merge(DEFAULT_CONTENT, data.data));
  if (error) return { error: `Não foi possível repor: ${error}` };
  revalidatePath('/preview');
  return { ok: true };
}

export async function changePassword(
  _prev: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireEditor();
  const current = String(form.get('current') ?? '');
  const next = String(form.get('next') ?? '');
  const repeat = String(form.get('repeat') ?? '');

  if (next !== repeat) return { error: 'A confirmação não é igual à nova palavra-passe.' };
  if (next.length < MIN_PASSWORD) {
    return { error: `A nova palavra-passe precisa de pelo menos ${MIN_PASSWORD} caracteres.` };
  }
  if (next === current) return { error: 'A nova palavra-passe é igual à atual.' };

  const supabase = await supabaseServer();
  const { error: wrong } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: current,
  });
  if (wrong) return { error: 'A palavra-passe atual não está correta.' };

  if (await isPwned(next)) {
    return {
      error:
        'Essa palavra-passe já apareceu em fugas de dados conhecidas. Escolhe outra.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: 'Não foi possível mudar a palavra-passe.' };
  return { ok: true };
}
