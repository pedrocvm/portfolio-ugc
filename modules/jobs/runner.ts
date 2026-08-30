import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { replanActions, replanGlobalActions, wakeSnoozed } from '@/modules/actions/service';
import { recordEvent } from '@/modules/activity/service';
import { markDue, seedMissingFollowUps } from '@/modules/followups/service';
import { syncGmail } from '@/modules/integrations/gmail/sync';
import { processPending } from '@/modules/inbox/ingest';
import { getFlagsService } from '@/modules/settings/service';
import { expireLicenses } from '@/modules/rights/service';
import { scanUpsells } from '@/modules/revenue/service';
import { requestPendingMetrics } from '@/modules/cases/service';

/** Os trabalhos de fundo. Nenhum depende de alguém abrir o painel.
 *
 *  Cada um regista uma linha em `job_run`: sem isso, uma sincronização que
 *  falha em silêncio destrói a confiança no sistema muito mais depressa do que
 *  um erro visível. */

export const JOBS = [
  'gmail-sync', 'process-pending', 'followups', 'rights', 'metrics', 'plan', 'upsell',
] as const;
export type JobName = (typeof JOBS)[number];

export const isJobName = (v: string): v is JobName => (JOBS as readonly string[]).includes(v);

export type JobResult = {
  job: JobName;
  status: 'success' | 'error' | 'skipped';
  detail: Record<string, unknown>;
  /** Quantas coisas o trabalho tocou. Vai para o registo do disparo. */
  processed?: number;
};

/** O número que interessa mostrar por trabalho. Cada um conta uma coisa
 *  diferente, e somar tudo daria um número sem significado. */
export function processedCount(result: JobResult): number {
  const d = result.detail as Record<string, number | undefined>;
  return (
    d.processed ?? d.created ?? d.actions ?? d.markedDue ?? d.expired ?? d.requested ?? 0
  );
}

export async function runJob(job: JobName): Promise<JobResult> {
  const flags = await getFlagsService();

  if (!flags.background_jobs && job !== 'gmail-sync') {
    return { job, status: 'skipped', detail: { reason: 'A bandeira background_jobs está fechada.' } };
  }

  const db = supabaseService();
  const started = Date.now();

  try {
    switch (job) {
      case 'gmail-sync': {
        const report = await syncGmail(flags);
        return { job, status: report.status, detail: { ...report } };
      }

      case 'process-pending': {
        const results = await processPending(db, flags, 40);
        const counts = results.reduce<Record<string, number>>((acc, r) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        }, {});
        return { job, status: 'success', detail: counts };
      }

      case 'followups': {
        const [due, seeded] = await Promise.all([markDue(db), seedMissingFollowUps(db)]);
        return { job, status: 'success', detail: { markedDue: due, seeded } };
      }

      case 'rights': {
        const expired = await expireLicenses(db);
        const global = await replanGlobalActions(db);
        return { job, status: 'success', detail: { expired, actions: global } };
      }

      case 'plan': {
        const woken = await wakeSnoozed(db);
        const plan = await replanActions(db);
        const global = await replanGlobalActions(db);
        return { job, status: 'success', detail: { woken, ...plan, globalActions: global } };
      }

      case 'metrics': {
        const asked = await requestPendingMetrics(db);
        return { job, status: 'success', detail: asked };
      }

      case 'upsell': {
        const scanned = await scanUpsells(db, flags);
        return { job, status: 'success', detail: scanned };
      }
    }
  } catch (error) {
    const summary = error instanceof Error ? error.message : 'Falha desconhecida.';
    await db.from('job_run').insert({
      job_type: job,
      status: 'error',
      finished_at: new Date().toISOString(),
      error_summary: summary.slice(0, 500),
      detail: asJson({ durationMs: Date.now() - started }),
    });

    // Uma integração partida não pode ficar invisível: vira ação prioritária.
    if (job === 'gmail-sync') {
      await recordEvent(db, {
        eventType: 'integration.failed',
        actorType: 'system',
        summary: `A sincronização do Gmail falhou: ${summary.slice(0, 160)}`,
        payload: { job },
      });
      await db.from('action_item').upsert(
        {
          type: 'integration_fix' as const,
          title: 'A ligação ao Gmail precisa de atenção',
          reason: summary.slice(0, 300),
          risk: 'high' as const,
          priority_score: 200,
          status: 'open' as const,
          requires_approval: false,
          dedupe_key: 'integration:google_gmail:failed',
        },
        { onConflict: 'dedupe_key' },
      );
    }

    return { job, status: 'error', detail: { error: summary } };
  }
}

/** Corre a cadeia toda pela ordem certa: sincronizar, processar o que ficou,
 *  actualizar prazos, expirar licenças e replanear. Uma só entrada de cron. */
export async function runAllJobs(): Promise<JobResult[]> {
  const order: JobName[] = [
    'gmail-sync', 'process-pending', 'followups', 'rights', 'metrics', 'upsell', 'plan',
  ];
  const results: JobResult[] = [];
  for (const job of order) results.push(await runJob(job));
  return results;
}
