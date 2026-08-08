import Brands from '@/components/dashboard/Brands';
import { listBrands } from '@/app/dashboard/brand-actions';

export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  return <Brands brands={await listBrands()} />;
}
