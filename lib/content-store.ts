import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { Content, DEFAULT_CONTENT } from './content';
import { merge } from './merge';
import { SUPABASE_KEY, SUPABASE_URL } from './supabase/config';
import { supabaseServer } from './supabase/server';

export const CONTENT_TAG = 'site-content';

const anon = () => createClient(SUPABASE_URL, SUPABASE_KEY);

/** null quando não veio linha nenhuma. Sem sessão de editora o RLS devolve
 *  zero linhas e nenhum erro, por isso a linha em falta conta como falha. */
async function read(key: 'draft' | 'published'): Promise<Content | null> {
  const db = key === 'published' ? anon() : await supabaseServer();
  const { data, error } = await db
    .from('site_content')
    .select('data')
    .eq('key', key)
    .maybeSingle();
  if (error || !data) return null;
  return merge(DEFAULT_CONTENT, data.data);
}

/** O site público serve a versão publicada em cache; publicar invalida a tag. */
export const getPublished = unstable_cache(
  async () => (await read('published')) ?? DEFAULT_CONTENT,
  ['site-content-published'],
  { tags: [CONTENT_TAG] },
);

/** Aqui não há queda para o modelo de origem: o editor gravaria esse modelo
 *  por cima do trabalho real na primeira vez que guardasse. */
export async function getDraft(): Promise<Content> {
  const draft = await read('draft');
  if (!draft) throw new Error('Não foi possível ler o rascunho.');
  return draft;
}
