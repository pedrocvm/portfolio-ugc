import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { Content, DEFAULT_CONTENT } from './content';
import { merge } from './merge';
import { SUPABASE_KEY, SUPABASE_URL } from './supabase/config';
import { supabaseServer } from './supabase/server';

export const CONTENT_TAG = 'site-content';
export const MEDIA_TAG = 'library-media';

/** Publicar e mexer na biblioteca invalidam logo pela etiqueta; isto é para o
 *  outro caso: uma leitura que falhou guarda um resultado vazio, e sem prazo
 *  esse vazio ficava no site até alguém voltar a publicar. Cinco minutos é o
 *  tempo máximo que um engano desses sobrevive. */
const REPESCAGEM = 300;

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

const publicado = unstable_cache(
  async () => (await read('published')) ?? DEFAULT_CONTENT,
  ['site-content-published'],
  { tags: [CONTENT_TAG], revalidate: REPESCAGEM },
);

/** O site público serve a versão publicada em cache; publicar invalida a tag.
 *  O merge repete-se à saída da cache porque a cache sobrevive ao deploy: sem
 *  isto, um campo novo do modelo só existiria depois de alguém voltar a
 *  publicar, e até lá chegaria ao site como indefinido. */
export const getPublished = async (): Promise<Content> =>
  merge(DEFAULT_CONTENT, await publicado());

/** Aqui não há queda para o modelo de origem: o editor gravaria esse modelo
 *  por cima do trabalho real na primeira vez que guardasse. */
export async function getDraft(): Promise<Content> {
  const draft = await read('draft');
  if (!draft) throw new Error('Não foi possível ler o rascunho.');
  return draft;
}

/** As media da biblioteca agrupadas por nicho. As que estão sem nicho ficam de
 *  fora: o RLS nem sequer as devolve a quem não é a editora. */
export const getNicheMedia = unstable_cache(
  async (): Promise<Record<string, string[]>> => {
    const { data, error } = await anon()
      .from('media_item')
      .select('url, niche')
      .neq('niche', '')
      .order('created_at', { ascending: false });
    if (error || !data) return {};
    const out: Record<string, string[]> = {};
    for (const m of data as { url: string; niche: string }[]) {
      (out[m.niche] ??= []).push(m.url);
    }
    return out;
  },
  ['library-niche-media'],
  { tags: [MEDIA_TAG], revalidate: REPESCAGEM },
);
