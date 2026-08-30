import { requireUser } from '@/lib/auth';
import Capture from '@/components/dashboard/os/Capture';
import { listCaptures } from '@/modules/capture/service';

export const dynamic = 'force-dynamic';

export default async function CapturePage() {
  await requireUser();
  const drafts = (await listCaptures()).filter((d) => d.status !== 'applied');
  return <Capture drafts={drafts} />;
}
