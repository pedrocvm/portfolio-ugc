import { requireUser } from '@/lib/auth';
import Opportunities from '@/components/dashboard/os/Opportunities';
import { listOpportunities } from '@/modules/opportunities/service';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  await requireUser();
  return <Opportunities rows={await listOpportunities()} />;
}
