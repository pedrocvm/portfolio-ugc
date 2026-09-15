import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { Content, DEFAULT_CONTENT, navLabels } from './content';
import { merge } from './merge';
import { SUPABASE_KEY, SUPABASE_URL } from './supabase/config';
import { supabaseServer } from './supabase/server';

export const CONTENT_TAG = 'site-content';
export const MEDIA_TAG = 'library-media';

/** Publicar e mexer na biblioteca invalidam logo pela etiqueta; isto é para o
 *  outro caso: uma leitura que falhou salva um resultado vazio, e sem prazo
 *  esse vazio ficava no site até alguém publicar de novo. Cinco minutos é o
 *  tempo máximo que um engano desses sobrevive. */
const REPESCAGEM = 300;

const anon = () => createClient(SUPABASE_URL, SUPABASE_KEY);

/** null quando não veio linha nenhuma, sem erro — esse é o estado legítimo de
 *  "ainda ninguém publicou nada". Um `error` de verdade (rede, 402, RLS
 *  quebrado) não cai nesse caso: sobe como excepção, para nunca virar
 *  DEFAULT_CONTENT em silêncio — foi exactamente essa troca que fez uma
 *  indisponibilidade do Storage parecer, na tela, uma perda do trabalho da
 *  Carol. Sem sessão de editora o RLS devolve zero linhas e nenhum erro, por
 *  isso a linha em falta continua a contar como "vazio", não como falha. */
async function read(key: 'draft' | 'published'): Promise<Content | null> {
  const db = key === 'published' ? anon() : await supabaseServer();
  const { data, error } = await db
    .from('site_content')
    .select('data')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao ler site_content(${key}): ${error.message}`);
  }
  if (!data) return null;
  const c = merge(DEFAULT_CONTENT, data.data);
  return { ...c, nav: { ...c.nav, labels: navLabels(c.nav.labels) } };
}

/** Uma leitura que rebenta não deve ficar em cache — `unstable_cache` só
 *  grava o resultado quando a função resolve, então deixar o erro subir
 *  daqui é o que evita um 402 de cinco minutos atrás transformar-se num
 *  DEFAULT_CONTENT de cinco minutos à frente. */
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

/** Só para metadata (título da aba, og:image): usada em generateMetadata, que
 *  roda também no build/deploy, antes de haver visita nenhuma para mostrar
 *  conteúdo errado a ninguém. Cair para DEFAULT_CONTENT aqui é cosmético — o
 *  <head> errado por uns minutos — e evita que uma leitura falhando durante o
 *  build derrube o deploy inteiro. */
export const getPublishedMeta = (): Promise<Content> =>
  getPublished().catch(() => DEFAULT_CONTENT);

/** Para as duas páginas públicas estáticas (`/` e `/contato`): pegar o erro
 *  aqui, fora da função em cache, é o que garante que o 402 nunca fica
 *  gravado como um "conteúdo publicado" válido por cinco minutos. Sem isto,
 *  a alternativa seria a página inteira rebentar — no build (derruba o
 *  deploy) e numa visita real (tela de erro sem motivo aparente) — pela
 *  mesma leitura que, se tivesse funcionado, seria só o site de sempre.
 *  `degraded: true` é o sinal para a página mostrar que aquilo pode não ser
 *  o conteúdo atual, em vez de deixar o DEFAULT_CONTENT passar por real. */
export async function getPublishedOrDefault(): Promise<{ content: Content; degraded: boolean }> {
  try {
    return { content: await getPublished(), degraded: false };
  } catch {
    return { content: DEFAULT_CONTENT, degraded: true };
  }
}

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
