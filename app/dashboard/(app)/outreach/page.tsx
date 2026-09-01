import { requireUser } from '@/lib/auth';
import { getFlags } from '@/modules/settings/service';
import { getFocus, latestManualRun, todayOutreach } from '@/app/dashboard/outreach-actions';
import Outreach, { type Candidate } from '@/components/dashboard/os/Outreach';
import type { ManualRun } from '@/components/dashboard/os/ResultsBar';

export const dynamic = 'force-dynamic';

export default async function OutreachPage() {
  await requireUser();
  const [{ run, candidates }, flags, focus, manual] = await Promise.all([
    todayOutreach(),
    getFlags(),
    getFocus(),
    latestManualRun(),
  ]);

  // A busca dirigida mostra os seus próprios resultados; a automática mostra o
  // lote do dia. Misturá-los era o que fazia parecer que uma busca por hotéis
  // tinha devolvido os apps da corrida da manhã.
  const manualFresco =
    manual.run && Date.now() - new Date(manual.run.started_at).getTime() < 6 * 3600_000
      ? manual
      : null;

  return (
    <Outreach
      candidates={(manualFresco?.candidates ?? candidates) as unknown as Candidate[]}
      runDate={run?.run_date ?? null}
      enabled={flags.daily_outreach}
      focus={focus}
      manualRun={(manualFresco?.run ?? null) as unknown as ManualRun | null}
    />
  );
}
