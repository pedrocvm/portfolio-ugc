import { requireUser } from '@/lib/auth';
import Production from '@/components/dashboard/os/Production';
import { listCollaborations } from '@/modules/production/service';

export const dynamic = 'force-dynamic';

export default async function ProductionPage() {
  await requireUser();
  return <Production rows={await listCollaborations()} />;
}
