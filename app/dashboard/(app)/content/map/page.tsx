import { requireUser } from '@/lib/auth';
import { editorialScreen } from '@/modules/editorial/service';
import EditorialMap from '@/components/dashboard/editorial/Map';

export const dynamic = 'force-dynamic';

export default async function ContentMapPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { app } = await requireUser();
  const [{ error }, data] = await Promise.all([searchParams, editorialScreen(app.id)]);
  return <EditorialMap data={data} error={error} />;
}
