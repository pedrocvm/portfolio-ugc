import { requireUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import Revenue from '@/components/dashboard/os/Revenue';
import { listLicenses } from '@/modules/rights/service';
import { listPayments, listRelationships, revenueSummary } from '@/modules/revenue/service';

export const dynamic = 'force-dynamic';

export default async function RevenuePage() {
  await requireUser();
  const db = await supabaseServer();

  const [summary, payments, licenses, relationships, { data: brands }] = await Promise.all([
    revenueSummary(),
    listPayments(),
    listLicenses(),
    listRelationships(),
    db.from('brand').select('id, name').order('name'),
  ]);

  return (
    <Revenue
      summary={summary}
      payments={payments}
      licenses={licenses}
      relationships={relationships.filter((r) => r.totalCashCents > 0 || r.wonCount > 0)}
      brands={brands ?? []}
    />
  );
}
