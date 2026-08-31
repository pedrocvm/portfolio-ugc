import { requireUser } from '@/lib/auth';
import { getFlags } from '@/modules/settings/service';
import { todayOutreach } from '@/app/dashboard/outreach-actions';
import Outreach, { type Candidate } from '@/components/dashboard/os/Outreach';

export const dynamic = 'force-dynamic';

export default async function OutreachPage() {
  await requireUser();
  const [{ run, candidates }, flags] = await Promise.all([todayOutreach(), getFlags()]);

  return (
    <Outreach
      candidates={candidates as unknown as Candidate[]}
      runDate={run?.run_date ?? null}
      enabled={flags.daily_outreach}
    />
  );
}
