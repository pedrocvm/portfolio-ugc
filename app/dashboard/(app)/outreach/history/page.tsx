import { requireUser } from '@/lib/auth';
import { outreachHistory } from '@/app/dashboard/outreach-actions';
import OutreachHistory, { type HistoryCandidate, type Run } from '@/components/dashboard/os/OutreachHistory';

export const dynamic = 'force-dynamic';

export default async function OutreachHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireUser();
  const { status } = await searchParams;
  const filter = status ?? 'todas';
  const { rows, runs } = await outreachHistory(filter);

  return (
    <OutreachHistory
      rows={rows as unknown as HistoryCandidate[]}
      runs={runs as unknown as Run[]}
      filter={filter}
    />
  );
}
