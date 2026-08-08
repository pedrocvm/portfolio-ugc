import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

export const EDITOR_EMAIL = 'carolxqueiroz@gmail.com';
export const EDITOR_USERNAME = 'carolxqueiroz';

export async function currentEditor() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email === EDITOR_EMAIL ? user : null;
}

export async function requireEditor() {
  const user = await currentEditor();
  if (!user) redirect('/dashboard/login');
  return user;
}
