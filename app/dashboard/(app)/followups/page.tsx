import { requireUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import FollowUps from '@/components/dashboard/os/FollowUps';
import { listFollowUps, markDue, seedMissingFollowUps } from '@/modules/followups/service';

export const dynamic = 'force-dynamic';

export default async function FollowUpsPage() {
  await requireUser();
  const db = await supabaseServer();

  // As oportunidades importadas do painel antigo chegaram sem lembrete nenhum.
  // Semear aqui é idempotente e evita depender do cron para a página ser útil.
  await Promise.all([markDue(db), seedMissingFollowUps(db)]);

  const { due, upcoming, nurture, sent } = await listFollowUps();
  return <FollowUps due={due} upcoming={upcoming} nurture={nurture} sent={sent} />;
}
