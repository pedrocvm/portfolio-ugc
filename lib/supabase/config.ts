/** As variáveis têm de ser lidas com o nome literal: é assim que o bundler as
 *  substitui pelo valor no código que corre no browser. */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    'Faltam as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY',
  );
}

export const SUPABASE_URL = url;
export const SUPABASE_KEY = key;
