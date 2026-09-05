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
  'insights', 'outreach', 'imports',
  // Morning Autopilot. A ordem aqui não é o horário — é `runAllJobs`, abaixo.
  'triage', 'references', 'trends', 'milestones', 'content-plan', 'morning',
  // Content Brain + Instagram.
  'instagram-sync', 'instagram-token', 'content-learning', 'story-candidates', 'audio-cleanup',
] as const;
export type JobName = (typeof JOBS)[number];

export const isJobName = (v: string): v is JobName => (JOBS as readonly string[]).includes(v);

export type JobResult = {
  job: JobName;
  status: 'success' | 'error' | 'skipped';
  detail: Record<string, unknown>;
  /** Quantas coisas o trabalho tocou. Vai para o registro do disparo. */
  processed?: number;
};

/** O número que interessa mostrar por trabalho. Cada um conta uma coisa
 *  diferente, e somar tudo daria um número sem significado. */
export function processedCount(result: JobResult): number {
  const d = result.detail as Record<string, number | undefined>;
  return (
    d.processed ?? d.created ?? d.actions ?? d.markedDue ?? d.expired ?? d.requested ??
    d.references ?? d.saved ?? d.generated ?? d.decisions ?? d.derived ?? d.batches ?? 0
  );
}

/** O que correu mal, tirado do detalhe do trabalho.
 *
 *  Um trabalho pode devolver `success` e ter falhado metade — a prospeção
 *  encontra marcas e não consegue escrever três emails. Quem lê a manhã precisa
 *  de saber isso, e o único lugar onde essa informação existe é aqui. */
function failuresOf(result: JobResult): string[] {
  const d = result.detail as Record<string, unknown>;
  const list = Array.isArray(d.failures) ? d.failures : [];
  const out = list.map(String).filter(Boolean);
  if (typeof d.error === 'string' && d.error) out.unshift(d.error);
  if (typeof d.blocked === 'string' && d.blocked) out.unshift(d.blocked);
  return out;
}

/** `background_jobs` governa correr **sem ninguém abrir o painel** — é o que a
 *  própria bandeira diz. Um clique dela no botão não é isso: é uma pessoa a
 *  pedir. Antes disto, ela carregava em «Correr tudo» e sete dos oito trabalhos
 *  saltavam em silêncio. */
export async function runJob(job: JobName, opts: { manual?: boolean } = {}): Promise<JobResult> {
  const result = await execute(job, opts);
  await record(job, result);
  return result;
}

/** Uma linha por corrida, sempre — não só quando rebenta.
 *
 *  Antes só se gravava a excepção. Uma manhã em que a pesquisa de tendências
 *  devolvia zero era indistinguível de uma manhã em que ela não tinha corrido,
 *  e a consolidação não tinha como ser honesta sobre o que falhou. */
async function record(job: JobName, result: JobResult): Promise<void> {
  const falhas = failuresOf(result);
  try {
    await supabaseService().from('job_run').insert({
      job_type: job,
      status: result.status === 'skipped' ? 'skipped' : result.status,
      finished_at: new Date().toISOString(),
      items_processed: processedCount(result),
      detail: asJson({ ...result.detail, failures: falhas }),
      error_summary: falhas[0]?.slice(0, 500) ?? null,
    });
  } catch {
    // Um registro que falha não pode derrubar o trabalho que correu bem.
  }
}

async function execute(job: JobName, opts: { manual?: boolean }): Promise<JobResult> {
  const flags = await getFlagsService();

  if (!opts.manual && !flags.background_jobs && job !== 'gmail-sync') {
    return { job, status: 'skipped', detail: { reason: 'Os trabalhos em segundo plano estão desligados.' } };
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

      case 'insights': {
        const { refreshInsights } = await import('@/modules/assistant/insights-service');
        return { job, status: 'success', detail: await refreshInsights() };
      }

      case 'outreach': {
        if (!flags.daily_outreach) {
          return { job, status: 'skipped', detail: { reason: 'o interruptor «Prospeção diária» está desligado.' } };
        }
        const { runDailyOutreach } = await import('@/modules/outreach/pipeline');
        const r = await runDailyOutreach({ kind: 'daily' });
        return {
          job,
          status: r.status === 'error' ? 'error' : r.status === 'empty' ? 'skipped' : 'success',
          detail: { ...r },
        };
      }

      case 'imports': {
        // Os lotes que ela colou e ficaram a meio. Vinte e cinco marcas não
        // cabem num pedido HTTP, e a tela só continua o lote enquanto ela a
        // tiver aberta — se fechar o browser, é aqui que o lote acaba.
        const { continuePendingImports } = await import('@/modules/outreach/import-run');
        const r = await continuePendingImports();
        return { job, status: r.batches === 0 ? 'skipped' : 'success', detail: { ...r } };
      }

      /* ── Morning Autopilot ────────────────────────────────────────────── */

      case 'triage': {
        const { triageThreads } = await import('@/modules/email/triage-service');
        const r = await triageThreads(flags);
        return { job, status: 'success', detail: { ...r } };
      }

      case 'references': {
        const { runReferencePass } = await import('@/modules/references/service');
        const r = await runReferencePass();
        return { job, status: r.candidates === 0 ? 'skipped' : 'success', detail: { ...r } };
      }

      case 'trends': {
        const { runTrendDiscovery } = await import('@/modules/trends/service');
        const r = await runTrendDiscovery();
        return { job, status: r.saved === 0 && r.failures.length ? 'error' : 'success', detail: { ...r } };
      }

      case 'milestones': {
        const { refreshMilestones } = await import('@/modules/milestones/service');
        const r = await refreshMilestones();
        return { job, status: 'success', detail: { ...r } };
      }

      case 'content-plan': {
        // Deixou de gerar ideias. Monta a semana a partir das histórias reais
        // confirmadas — e quando não há material, o plano diz que falta
        // matéria-prima em vez de inventar peças para encher slots.
        const { buildWeekPlan } = await import('@/modules/content-brain/plan-service');
        const r = await buildWeekPlan();
        return {
          job,
          status: r.ok ? 'success' : 'error',
          detail: r.ok
            ? {
                weekStart: r.plan.weekStart,
                pillar: r.plan.primaryPillar,
                slots: r.plan.slots.length,
                mappingOnly: r.plan.mappingOnly,
                processed: r.plan.slots.length,
              }
            : { error: r.error },
        };
      }

      /* ── Content Brain ────────────────────────────────────────────────── */

      case 'instagram-sync': {
        // Um trabalho só faz perfil, mídia, stories, snapshots devidos e o
        // retrato da conta. Seis crons por Reel era o desenho errado.
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
        return { job, status: r.failures.length ? 'error' : 'success', detail: { ...r, processed: r.refreshed ? 1 : 0 } };
      }

      case 'content-learning': {
        const { deriveLearnings } = await import('@/modules/content-brain/performance-service');
        const r = await deriveLearnings();
        return { job, status: 'success', detail: { ...r, processed: r.written } };
      }

      case 'story-candidates': {
        const { deriveStoryCandidates } = await import('@/modules/content-brain/plan-service');
        const r = await deriveStoryCandidates();
        return { job, status: 'success', detail: { ...r, processed: r.created } };
      }

      case 'audio-cleanup': {
        // O áudio bruto é o dado mais sensível que isto guarda. Depois da
        // transcrição confirmada não serve para nada.
        const { cleanupExpiredAudio } = await import('@/modules/content-brain/service');
        const r = await cleanupExpiredAudio();
        return { job, status: 'success', detail: { ...r, processed: r.deleted } };
      }

      case 'morning': {
        // A consolidação corre por último e refaz o plano antes de ler: assim
        // não depende de o `plan` de hora a hora ter calhado passar primeiro.
        await wakeSnoozed(db);
        await replanActions(db);
        await replanGlobalActions(db);
        const { consolidateMorning } = await import('@/modules/morning/service');
        const brief = await consolidateMorning();
        return {
          job,
          status: brief ? 'success' : 'error',
          detail: brief
            ? {
                decisions: brief.decisionCount,
                minutes: brief.estimatedMinutes,
                briefStatus: brief.status,
                failures: brief.gaps.map((g) => g.message),
              }
            : { error: 'Não consegui consolidar a manhã.' },
        };
      }
    }
  } catch (error) {
    const summary = error instanceof Error ? error.message : 'Falha desconhecida.';
    // A linha em `job_run` é escrita por `record`, à saída de `runJob`. Antes
    // era escrita aqui também, e uma falha ficava contada duas vezes.

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

    return { job, status: 'error', detail: { error: summary, durationMs: Date.now() - started } };
  }
}

/** Corre a cadeia toda pela ordem certa: sincronizar, processar o que ficou,
 *  atualizar prazos, expirar licenças e replanear. Uma só entrada de cron. */
export async function runAllJobs(opts: { manual?: boolean } = {}): Promise<JobResult[]> {
  // A ordem é o grafo de dependências, não o alfabeto: a triagem precisa do
  // Gmail sincronizado, as referências precisam das marcas escolhidas, e a
  // consolidação precisa de tudo o resto.
  const order: JobName[] = [
    'gmail-sync', 'process-pending', 'triage', 'followups', 'rights', 'metrics', 'upsell', 'plan',
    'insights', 'outreach', 'imports', 'references', 'trends', 'milestones',
    // Content Brain: saúde do token, depois sync, depois o que aprende com o
    // que o sync trouxe. Trocar a ordem faz o aprendizado ler dados de ontem.
    'instagram-token', 'instagram-sync', 'content-learning', 'story-candidates', 'audio-cleanup',
    'content-plan', 'morning',
  ];
  const results: JobResult[] = [];
  for (const job of order) results.push(await runJob(job, opts));
  return results;
}
