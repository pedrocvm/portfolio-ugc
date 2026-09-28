import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';

/** Depois do reset editorial, só dois trabalhos continuam vivos.
 *
 * O Instagram continua a ser capturado porque o histórico não pode ser
 * reconstruído mais tarde, sobretudo Stories e curvas de performance. Gmail,
 * prospecção, CRM, receita e o Content Brain antigo não correm mais em
 * background nem por chamada manual ao endpoint de jobs. */
export const JOBS = ['instagram-sync', 'instagram-token'] as const;
export type JobName = (typeof JOBS)[number];

export const isJobName = (value: string): value is JobName =>
  (JOBS as readonly string[]).includes(value);

export type JobResult = {
  job: JobName;
  status: 'success' | 'error' | 'skipped';
  detail: Record<string, unknown>;
  processed?: number;
};

export function processedCount(result: JobResult): number {
  const detail = result.detail as Record<string, number | undefined>;
  return detail.processed ?? detail.snapshotsWritten ?? detail.mediaSeen ?? 0;
}

export async function runJob(job: JobName): Promise<JobResult> {
  const result = await execute(job);
  await record(result);
  return result;
}

async function record(result: JobResult): Promise<void> {
  try {
    const error =
      result.status === 'error' && typeof result.detail.error === 'string'
        ? result.detail.error.slice(0, 500)
        : null;
    await supabaseService().from('job_run').insert({
      job_type: result.job,
      status: result.status,
      finished_at: new Date().toISOString(),
      items_processed: processedCount(result),
      detail: asJson(result.detail),
      error_summary: error,
    });
  } catch {
    // Observabilidade não derruba um sync que correu bem.
  }
}

async function execute(job: JobName): Promise<JobResult> {
  try {
    if (job === 'instagram-token') {
      const { refreshInstagramToken } = await import('@/modules/integrations/instagram/sync');
      const result = await refreshInstagramToken();
      return {
        job,
        status: result.failures.length ? 'error' : 'success',
        detail: {
          ...result,
          processed: result.refreshed ? 1 : 0,
          ...(result.failures[0] ? { error: result.failures[0] } : {}),
        },
      };
    }

    const { syncInstagram } = await import('@/modules/integrations/instagram/sync');
    const result = await syncInstagram();
    return {
      job,
      status: result.status,
      detail: {
        ...result,
        processed: result.mediaSeen + result.snapshotsWritten,
        ...(result.failures[0] ? { error: result.failures[0] } : {}),
      },
    };
  } catch (error) {
    return {
      job,
      status: 'error',
      detail: { error: error instanceof Error ? error.message : 'Falha desconhecida.' },
    };
  }
}

export async function runAllJobs(): Promise<JobResult[]> {
  const results: JobResult[] = [];
  // Renova primeiro, coleta depois. Não existe mais “correr todo o CarolOS”.
  for (const job of ['instagram-token', 'instagram-sync'] as const) {
    results.push(await runJob(job));
  }
  return results;
}
