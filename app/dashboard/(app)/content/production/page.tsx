import { requireUser } from '@/lib/auth';
import { editorialScreen } from '@/modules/editorial/service';
import Production from '@/components/dashboard/editorial/Production';

export const dynamic = 'force-dynamic';

export default async function ContentProductionPage() {
  const { app } = await requireUser();
  return <Production data={await editorialScreen(app.id)} />;
}
