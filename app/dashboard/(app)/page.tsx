import { requireUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { todayQueue, wakeSnoozed } from '@/modules/actions/service';
import { markDue } from '@/modules/followups/service';
import { getFlags, integrationHealth } from '@/modules/settings/service';
import Today from '@/components/dashboard/os/Today';

export const dynamic = 'force-dynamic';

/** A casa do CarolOS. Já não é o editor do site — é a fila do dia.
 *
 *  Antes de ler, acorda os adiados e marca os follow-ups vencidos. São duas
 *  escritas pequenas e idempotentes, e fazem com que a fila esteja certa mesmo
 *  que os trabalhos de fundo estejam desligados. */
export default async function TodayPage() {
  const { app } = await requireUser();
  const db = await supabaseServer();

  await Promise.all([wakeSnoozed(db), markDue(db)]);

  const [actions, flags, integration, counts] = await Promise.all([
    todayQueue(),
    getFlags(),
    integrationHealth(),
    loadCounts(),
  ]);

  return (
    <Today
      data={{
        actions,
        greeting: app.displayName,
        counts,
        flags,
        integration: {
          status: integration.status,
          lastSuccessAt: integration.lastSuccessAt,
          account: integration.account,
        },
      }}
    />
  );
}

/** Os contadores saem de consultas, não de um filtro no corpo do componente:
 *  ler o relógio durante o render torna o resultado dependente de quando o
 *  React calhou re-renderizar. */
async function loadCounts() {
  const db = await supabaseServer();
  const now = new Date().toISOString();

  const [{ count: open }, { count: due }, { count: review }, { count: overdue }] = await Promise.all([
    db.from('opportunity').select('id', { count: 'exact', head: true }).not('stage', 'in', '(won,lost)'),
    db.from('follow_up').select('id', { count: 'exact', head: true }).in('status', ['scheduled', 'due'])
      .lte('due_at', now),
    db.from('source_thread').select('id', { count: 'exact', head: true }).eq('classification', 'review'),
    db.from('action_item').select('id', { count: 'exact', head: true }).eq('status', 'open').lte('due_at', now),
  ]);

  return {
    openOpportunities: open ?? 0,
    dueFollowUps: due ?? 0,
    needsReview: review ?? 0,
    overdue: overdue ?? 0,
  };
}
