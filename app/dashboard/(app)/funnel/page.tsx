import Funnel from '@/components/dashboard/Funnel';
import { listBrands } from '@/app/dashboard/brand-actions';

export const dynamic = 'force-dynamic';

export default async function FunnelPage() {
  return <Funnel brands={await listBrands()} />;
}
