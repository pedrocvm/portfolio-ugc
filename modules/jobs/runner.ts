import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';

/** Trabalhos que ainda pertencem ao CarolOS.
 *
 * O CRM foi retirado do produto. O agendador agora existe apenas para manter a
 * memória do Instagram, aprender com o que foi publicado e preparar a semana. */
export const JOBS = [
  'instagram-sync',
  'instagram-token',
  'content-learning',
  'content-audit',
  'content-week',
  'content-community',
] as const;

export type JobName = (typeof JOBS)[number];

export const isJobName = (v: string): v is JobName =>
  (JOBS as readonly string[]).includes(v);

export type JobResult = {
  job: JobName;
  status: 'success' | 'error' | 'skipped';
  detail: Record<string, unknown>;
  processed?: number;
};

export function processedCount(result: JobResult): number {
  const d = result.detail as Record<string, number | undefined>;
  return d.processed ?? d.created ?? d.derived ?? d.classified ?? d.insights ?? 0;
}

function failuresOf(result: JobResult): string[] {
  const d = result.detail as Record<string, unknown>;
  const list = Array.isArray(d.failures) ? d.failures : [];
  const out = list.map(String).filter(Boolean);
  if (typeof d.error === 'string' && d.error) out.unshift(d.error);
  return out;
}

export async function runJob(job: JobName): Promise<JobResult> {
  const result = await execute(job);
  await record(job, result);
  return result;
}

async function record(job: JobName, result: JobResult): Promise<void> {
  const failures = failuresOf(result);
  try {
    await supabaseService().from('job_run').insert({
      job_type: job,
      status: result.status === 'skipped' ? 'skipped' : result.status,
      finished_at: new Date().toISOString(),
      items_processed: processedCount(result),
      detail: asJson({ ...result.detail, failures }),
      error_summary: failures[0]?.slice(0, 500) ?? null,
    });
  } catch {
    // Observabilidade não derruba o trabalho que acabou de correr.
  }
}

async function execute(job: JobName): Promise<JobResult> {
  const started = Date.now();

  try {
    switch (job) {
      case 'instagram-sync': {
        const { syncInstagram } = await import('@/modules/integrations/instagram/sync');
        const r = await syncInstagram();
        return {
          job,
          status: r.status,
          detail: { ...r, processed: r.mediaSeen + r.snapshotsWritten },
        };
      }

      case 'instagram-token': {
        const { refreshInstagramToken } = await import('@/modules/integrations/instagram/sync');
        const r = await refreshInstagramToken();
        return {
          job,
          status: r.failures.length ? 'error' : 'success',
          detail: { ...r, processed: r.refreshed ? 1 : 0 },
        };
      }

      case 'content-learning': {
        const {
          auditFeedCaptions,
          deriveLearnings,
          rebuildStorySequences,
        } = await import('@/modules/content-brain/performance-service');

        const labels = await auditFeedCaptions().catch((e: unknown) => ({
          audited: 0,
          skipped: 0,
          failures: [e instanceof Error ? e.message : 'A classificação do feed falhou.'],
        }));
        const sequences = await rebuildStorySequences().catch(() => ({
          sequences: 0,
          frames: 0,
        }));
        const r = await deriveLearnings();

        return {
          job,
          status: 'success',
          detail: {
            ...r,
            audited: labels.audited,
            storySequences: sequences.sequences,
            failures: [...r.failures, ...labels.failures],
            processed: r.written,
          },
        };
      }

      case 'content-audit': {
        const { runContentAudit } = await import('@/modules/content-brain/audit-service');
        const r = await runContentAudit();
        return {
          job,
          status: r.status === 'failed' ? 'error' : 'success',
          detail: { ...r, processed: r.conclusions },
        };
      }

      case 'content-week': {
        const { backfillContentStrategy } = await import('@/modules/content-brain/backfill-service');
        const { recomputeFormatStates } = await import('@/modules/content-brain/lab-service');
        const { runWeek } = await import('@/modules/content-brain/week-service');

        const reconciliation = await backfillContentStrategy().catch((e: unknown) => ({
          dna: 0,
          ideas: 0,
          stories: 0,
          unknown: 0,
          failures: [e instanceof Error ? e.message : 'A reconciliação falhou.'],
        }));
        const maturity = await recomputeFormatStates().catch((e: unknown) => ({
          written: 0,
          failures: [e instanceof Error ? e.message : 'A maturidade de formatos falhou.'],
        }));
        const r = await runWeek();

        return {
          job,
          status: 'success',
          detail: {
            ...r,
            reconciled: reconciliation.dna + reconciliation.ideas + reconciliation.stories,
            unknownLeft: reconciliation.unknown,
            formatStates: maturity.written,
            failures: [...r.breaches, ...reconciliation.failures, ...maturity.failures],
            processed: r.created,
          },
        };
      }

      case 'content-community': {
        const {
          classifyPendingComments,
          persistInteractionInsights,
        } = await import('@/modules/content-brain/community-service');
        const classification = await classifyPendingComments();
        const reading = await persistInteractionInsights();

        return {
          job,
          status: 'success',
          detail: {
            classified: classification.classified,
            insights: reading.written,
            failures: [...classification.failures, ...reading.failures],
            processed: classification.classified + reading.written,
          },
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida.';
    return {
      job,
      status: 'error',
      detail: { error: message, durationMs: Date.now() - started },
    };
  }
}

export async function runAllJobs(): Promise<JobResult[]> {
  const order: JobName[] = [
    'instagram-token',
    'instagram-sync',
    'content-community',
    'content-learning',
    'content-audit',
    'content-week',
  ];

  const results: JobResult[] = [];
  for (const job of order) results.push(await runJob(job));
  return results;
}
