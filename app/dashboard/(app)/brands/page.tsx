import { requireUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import Brands, { type BrandListRow } from '@/components/dashboard/os/Brands';
import { listBrandRows } from '@/modules/brands/service';

export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  await requireUser();
  const db = await supabaseServer();

  const [brands, { data: opps }, { data: relationships }] = await Promise.all([
    listBrandRows(),
    db.from('opportunity').select('brand_id, stage, next_action_text, last_activity_at')
      .not('stage', 'in', '(won,lost)'),
    db.from('relationship').select('brand_id, total_cash_cents'),
  ]);

  const openByBrand = new Map<string, { count: number; nextAction: string }>();
  for (const o of opps ?? []) {
    const entry = openByBrand.get(o.brand_id) ?? { count: 0, nextAction: '' };
    entry.count++;
    if (!entry.nextAction && o.next_action_text) entry.nextAction = o.next_action_text;
    openByBrand.set(o.brand_id, entry);
  }

  const cashByBrand = new Map((relationships ?? []).map((r) => [r.brand_id, r.total_cash_cents]));

  const rows: BrandListRow[] = brands.map((b) => ({
    ...b,
    openOpportunities: openByBrand.get(b.id)?.count ?? 0,
    nextAction: openByBrand.get(b.id)?.nextAction ?? '',
    totalCashCents: cashByBrand.get(b.id) ?? 0,
  }));

  return <Brands rows={rows} />;
}
