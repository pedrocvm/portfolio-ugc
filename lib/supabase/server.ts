import { createServerClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

/** `next/headers` só se resolve quando alguém pede o cliente com sessão.
 *  Um script de auditoria que importa um serviço com este ficheiro por baixo
 *  — e passa o service role por parâmetro — não pode rebentar por causa de
 *  um import que nunca chega a usar. */
export async function supabaseServer() {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        // Server Components não podem escrever cookies; aí a renovação do
        // token fica a cargo da Server Action ou do Route Handler seguinte.
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {}
      },
    },
  });
}
