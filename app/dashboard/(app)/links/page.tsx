import Links from '@/components/dashboard/Links';
import { requireEditor } from '@/lib/auth';
import { getDraft } from '@/lib/content-store';
import { PERIODOS, resumir, type LinkEventRow } from '@/lib/link-stats';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** ponytail: o teto existe para o dia em que corra bem de mais. Até lá são
 *  noventa dias de eventos de uma página só. */
const TETO = 20000;

async function lerEventos(): Promise<LinkEventRow[]> {
  const supabase = await supabaseServer();
  const desde = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data } = await supabase
    .from('link_event')
    .select('type, target, referrer, utm_source, device, country, session, created_at')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(TETO);
  return (data ?? []) as LinkEventRow[];
}

export default async function LinksPage() {
  await requireEditor();
  const [draft, eventos] = await Promise.all([getDraft(), lerEventos()]);
  return (
    <Links initial={draft} resumos={PERIODOS.map((d) => resumir(eventos, d))} />
  );
}
