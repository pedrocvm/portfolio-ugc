import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { Content, DEFAULT_CONTENT } from './content';
import { merge } from './merge';
import { SUPABASE_KEY, SUPABASE_URL } from './supabase/config';
import { supabaseServer } from './supabase/server';

export const CONTENT_TAG = 'site-content';

const anon = () => createClient(SUPABASE_URL, SUPABASE_KEY);

async function read(key: 'draft' | 'published'): Promise<Content> {
  const db = key === 'published' ? anon() : await supabaseServer();
  const { data, error } = await db
    .from('site_content')
    .select('data')
    .eq('key', key)
    .maybeSingle();
  if (error || !data) return DEFAULT_CONTENT;
  return merge(DEFAULT_CONTENT, data.data);
}

/** O site público serve a versão publicada em cache; publicar invalida a tag. */
export const getPublished = unstable_cache(
  () => read('published'),
  ['site-content-published'],
  { tags: [CONTENT_TAG] },
);

export const getDraft = async () => read('draft');
