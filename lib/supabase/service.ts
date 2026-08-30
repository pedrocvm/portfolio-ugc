import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { SUPABASE_URL } from './config';

/** O cliente que ignora o RLS. Só existe do lado do servidor, só para trabalho
 *  de fundo e para as tabelas que a sessão da editora não alcança — os tokens
 *  de integração, por exemplo. Nunca sai daqui para um componente de cliente.
 *
 *  A chave é lida na chamada e não no topo do módulo: sem ela o resto da
 *  aplicação continua a funcionar, e quem depende dela falha com uma mensagem
 *  que diz o que falta em vez de rebentar o build. */
let cached: SupabaseClient<Database> | null = null;

export function hasServiceRole() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function supabaseService(): SupabaseClient<Database> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY. É obrigatória para jobs, sincronização e tokens de integração.',
    );
  }
  cached ??= createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
