import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabaseServer } from './supabase/server';

/** O e-mail deixou de ser a autorização — agora é só o atalho de login, para
 *  ela poder escrever «carolxqueiroz» em vez do endereço todo. Quem manda é a
 *  linha em `app_user`, que é também o que o RLS lê. */
export const EDITOR_EMAIL = 'carolxqueiroz@gmail.com';
export const EDITOR_USERNAME = 'carolxqueiroz';

export type CarolUser = {
  id: string;
  authUserId: string;
  role: 'creator' | 'operator';
  displayName: string;
  email: string;
  timezone: string;
};

export async function currentUser(): Promise<{ auth: User; app: CarolUser } | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('app_user')
    .select('id, auth_user_id, role, display_name, email, timezone, active')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!data?.active) return null;

  return {
    auth: user,
    app: {
      id: data.id,
      authUserId: data.auth_user_id,
      role: data.role === 'operator' ? 'operator' : 'creator',
      displayName: data.display_name || user.email || '',
      email: data.email || user.email || '',
      timezone: data.timezone,
    },
  };
}

export async function requireUser() {
  const found = await currentUser();
  if (!found) redirect('/dashboard/login');
  return found;
}

/** Mantido porque metade da aplicação antiga chama por este nome. Devolve o
 *  usuário do Supabase, como sempre devolveu. */
export async function currentEditor() {
  return (await currentUser())?.auth ?? null;
}

export async function requireEditor() {
  return (await requireUser()).auth;
}
