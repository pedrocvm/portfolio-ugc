import { requireUser } from '@/lib/auth';
import { getFlags } from '@/modules/settings/service';
import { getFocus, latestManualRun, referencesForCandidates, todayOutreach } from '@/app/dashboard/outreach-actions';
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
  // lote do dia. `latestManualRun` já devolve nulo quando a dirigida caducou.
  const visiveis = (manual.run ? manual.candidates : candidates) ?? [];
  const references = await referencesForCandidates(visiveis.map((c) => c.id));

  return (
    <Outreach
      candidates={visiveis as unknown as Candidate[]}
      references={references}
      runDate={run?.run_date ?? null}
      enabled={flags.daily_outreach}
      focus={focus}
      manualRun={manual.run as unknown as ManualRun | null}
    />
  );
}
