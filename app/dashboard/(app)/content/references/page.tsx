import SavedReferences from '@/components/dashboard/SavedReferences';
import { listReferenceScreenAction } from '@/app/dashboard/reference-actions';
import { requireUser } from '@/lib/auth';
import { listContentPillars } from '@/modules/content-board/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const metadata = { title: 'Referências · CarolOS' };

export default async function ReferencesPage() {
  await requireUser();
  const [result, pillars] = await Promise.all([
    listReferenceScreenAction(),
    listContentPillars(),
  ]);

  if (!result.ok) throw new Error(result.error);

  return <SavedReferences initialScreen={result.screen} pillars={pillars} />;
}
