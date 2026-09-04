import { requireUser } from '@/lib/auth';
import { getFlags } from '@/modules/settings/service';
import {
  getFocus, latestImportRun, latestManualRun, referencesForCandidates, todayOutreach,
} from '@/app/dashboard/outreach-actions';
import Outreach, { type Candidate } from '@/components/dashboard/os/Outreach';
import type { ManualRun } from '@/components/dashboard/os/ResultsBar';

export const dynamic = 'force-dynamic';

export default async function OutreachPage() {
  await requireUser();
  const [{ run, candidates }, flags, focus, manual, importado] = await Promise.all([
    todayOutreach(),
    getFlags(),
    getFocus(),
    latestManualRun(),
    latestImportRun(),
  ]);

  // Cada modo mostra os seus próprios resultados; a automática mostra o lote do
  // dia. Entre uma busca dirigida e um lote colado ganha o mais recente — o que
  // ela fez por último é o que está à espera de decisão. As duas leituras já
  // devolvem nulo quando caducam.
  const maisRecente =
    importado.run && manual.run
      ? new Date(importado.run.started_at) >= new Date(manual.run.started_at)
        ? importado.candidates
        : manual.candidates
      : (importado.run ? importado.candidates : manual.run ? manual.candidates : null);

  const visiveis = (maisRecente ?? candidates) ?? [];
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
