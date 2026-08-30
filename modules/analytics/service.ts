import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';

/** Analytics comercial.
 *
 *  Só conta o que foi mesmo registado. O histórico anterior ao CarolOS não é
 *  reconstruído nem estimado: o Handoff é explícito em que taxa de resposta,
 *  ticket médio e ciclo de venda são desconhecidos, e inventá-los daria à
 *  Carol números falsos para decidir preço. Onde não há base, a folha diz
 *  «desde que o sistema começou a registar». */

export type Funnel = { stage: string; label: string; count: number };

export type Analytics = {
  since: string;
  outreach: number;
  replies: number;
  positiveReplies: number;
  opportunitiesCreated: number;
  won: number;
  lost: number;
  paidJobs: number;
  barterJobs: number;
  cashCents: number;
  barterValueCents: number;
  usageRevenueCents: number;
  averageTicketCents: number | null;
  replyRate: number | null;
  winRate: number | null;
  medianCycleDays: number | null;
  followUpsSent: number;
  recoveredByFollowUp: number;
  byNiche: { niche: string; opportunities: number; won: number }[];
  byChannel: { channel: string; outreach: number; replies: number }[];
  /** Métricas que não é possível calcular, e porquê. */
  unavailable: { metric: string; why: string }[];
};

const POSITIVE = new Set([
  'interest', 'portfolio_request', 'rate_request', 'ads_rights', 'call_request', 'brief', 'approval',
]);

export async function commercialAnalytics(days = 90): Promise<Analytics> {
  const db = await supabaseServer();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [{ data: events }, { data: opps }, { data: payments }, { data: brands }] = await Promise.all([
    db.from('activity_event')
      .select('event_type, occurred_at, channel, payload, opportunity_id, brand_id')
      .gte('occurred_at', since),
    db.from('opportunity')
      .select('id, stage, commercial_model, created_at, won_at, lost_at, brand_id, source'),
    db.from('payment').select('kind, amount_cents, status, paid_at'),
    db.from('brand').select('id, category_primary'),
  ]);

  const rows = events ?? [];
  const outreachEvents = rows.filter((e) => e.event_type === 'outreach.sent');
  const replyEvents = rows.filter((e) => e.event_type === 'reply.received');
  const classified = rows.filter((e) => e.event_type === 'reply.classified');

  const positiveReplies = classified.filter((e) => {
    const types = ((e.payload ?? {}) as { replyTypes?: string[] }).replyTypes ?? [];
    return types.some((t) => POSITIVE.has(t));
  }).length;

  const inWindow = (opps ?? []).filter((o) => o.created_at >= since);
  const won = (opps ?? []).filter((o) => o.won_at && o.won_at >= since);
  const lost = (opps ?? []).filter((o) => o.lost_at && o.lost_at >= since);

  const cash = (payments ?? []).filter((p) => p.kind !== 'barter' && p.status === 'paid');
  const cashCents = cash.reduce((s, p) => s + p.amount_cents, 0);
  const barterValueCents = (payments ?? [])
    .filter((p) => p.kind === 'barter')
    .reduce((s, p) => s + p.amount_cents, 0);

  // Ciclo: só das oportunidades que fecharam mesmo. Mediana e não média —
  // uma negociação de seis meses não pode arrastar a leitura das outras.
  const cycles = won
    .map((o) => Math.round((new Date(o.won_at!).getTime() - new Date(o.created_at).getTime()) / 86400000))
    .sort((a, b) => a - b);
  const medianCycleDays = cycles.length ? cycles[Math.floor(cycles.length / 2)] : null;

  const nicheOf = new Map((brands ?? []).map((b) => [b.id, b.category_primary ?? 'other']));
  const byNicheMap = new Map<string, { opportunities: number; won: number }>();
  for (const o of opps ?? []) {
    const key = nicheOf.get(o.brand_id) ?? 'other';
    const entry = byNicheMap.get(key) ?? { opportunities: 0, won: 0 };
    entry.opportunities++;
    if (o.stage === 'won') entry.won++;
    byNicheMap.set(key, entry);
  }

  const byChannelMap = new Map<string, { outreach: number; replies: number }>();
  for (const e of [...outreachEvents, ...replyEvents]) {
    const key = e.channel ?? 'desconhecido';
    const entry = byChannelMap.get(key) ?? { outreach: 0, replies: 0 };
    if (e.event_type === 'outreach.sent') entry.outreach++;
    else entry.replies++;
    byChannelMap.set(key, entry);
  }

  const followUpsSent = rows.filter((e) => e.event_type === 'followup.sent').length;

  // Recuperado por follow-up: oportunidades onde uma resposta chegou depois de
  // um follow-up ter sido enviado.
  const followUpByOpp = new Map<string, string>();
  for (const e of rows.filter((x) => x.event_type === 'followup.sent')) {
    if (e.opportunity_id) followUpByOpp.set(e.opportunity_id, e.occurred_at);
  }
  const recoveredByFollowUp = new Set(
    replyEvents
      .filter((e) => {
        const sentAt = e.opportunity_id ? followUpByOpp.get(e.opportunity_id) : undefined;
        return sentAt && e.occurred_at > sentAt;
      })
      .map((e) => e.opportunity_id),
  ).size;

  const paidJobs = (opps ?? []).filter((o) => o.stage === 'won' && o.commercial_model === 'paid').length;
  const barterJobs = (opps ?? []).filter(
    (o) => o.stage === 'won' && (o.commercial_model === 'barter' || o.commercial_model === 'reimbursement'),
  ).length;

  const unavailable: Analytics['unavailable'] = [];
  if (!outreachEvents.length) {
    unavailable.push({
      metric: 'Taxa de resposta',
      why: 'Ainda não há abordagens registadas pelo sistema neste período.',
    });
  }
  if (!cash.length) {
    unavailable.push({
      metric: 'Ticket médio',
      why: 'Nenhum pagamento registado. O histórico anterior ao CarolOS não foi reconstruído.',
    });
  }
  if (!won.length) {
    unavailable.push({
      metric: 'Tempo de ciclo',
      why: 'Nenhuma oportunidade fechada dentro do período medido.',
    });
  }

  return {
    since,
    outreach: outreachEvents.length,
    replies: replyEvents.length,
    positiveReplies,
    opportunitiesCreated: inWindow.length,
    won: won.length,
    lost: lost.length,
    paidJobs,
    barterJobs,
    cashCents,
    barterValueCents,
    usageRevenueCents: cash.filter((p) => p.kind === 'usage_license').reduce((s, p) => s + p.amount_cents, 0),
    averageTicketCents: cash.length ? Math.round(cashCents / cash.length) : null,
    replyRate: outreachEvents.length ? Math.round((replyEvents.length / outreachEvents.length) * 100) : null,
    winRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
    medianCycleDays,
    followUpsSent,
    recoveredByFollowUp,
    byNiche: [...byNicheMap].map(([niche, v]) => ({ niche, ...v })).sort((a, b) => b.opportunities - a.opportunities),
    byChannel: [...byChannelMap].map(([channel, v]) => ({ channel, ...v })),
    unavailable,
  };
}

/** Observabilidade da automação e da IA. Sem isto, uma sincronização que falha
 *  em silêncio corrói a confiança muito mais depressa do que um erro visível. */
export type AutomationHealth = {
  jobs: { jobType: string; success: number; error: number; lastAt: string | null }[];
  aiTasks: {
    taskType: string;
    runs: number;
    errors: number;
    accepted: number;
    edited: number;
    rejected: number;
    avgConfidence: number | null;
  }[];
  duplicatesPrevented: number;
  actionsOpen: number;
  followUpsScheduled: number;
};

export async function automationHealth(days = 30): Promise<AutomationHealth> {
  const db = await supabaseServer();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [{ data: jobs }, { data: runs }, { count: actionsOpen }, { count: followUpsOpen }, { count: messages }] =
    await Promise.all([
      db.from('job_run').select('job_type, status, started_at').gte('started_at', since),
      db.from('ai_run').select('task_type, status, human_decision, confidence').gte('created_at', since),
      db.from('action_item').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      db.from('follow_up').select('id', { count: 'exact', head: true }).in('status', ['scheduled', 'due']),
      db.from('source_message').select('id', { count: 'exact', head: true }),
    ]);

  const jobMap = new Map<string, { success: number; error: number; lastAt: string | null }>();
  for (const j of jobs ?? []) {
    const entry = jobMap.get(j.job_type) ?? { success: 0, error: 0, lastAt: null };
    if (j.status === 'success') entry.success++;
    if (j.status === 'error') entry.error++;
    if (!entry.lastAt || j.started_at > entry.lastAt) entry.lastAt = j.started_at;
    jobMap.set(j.job_type, entry);
  }

  const taskMap = new Map<string, { runs: number; errors: number; accepted: number; edited: number; rejected: number; conf: number[] }>();
  for (const r of runs ?? []) {
    const entry = taskMap.get(r.task_type) ?? { runs: 0, errors: 0, accepted: 0, edited: 0, rejected: 0, conf: [] };
    entry.runs++;
    if (r.status === 'error') entry.errors++;
    if (r.human_decision === 'accepted') entry.accepted++;
    if (r.human_decision === 'edited') entry.edited++;
    if (r.human_decision === 'rejected') entry.rejected++;
    if (typeof r.confidence === 'number') entry.conf.push(r.confidence);
    taskMap.set(r.task_type, entry);
  }

  return {
    jobs: [...jobMap].map(([jobType, v]) => ({ jobType, ...v })),
    aiTasks: [...taskMap].map(([taskType, v]) => ({
      taskType,
      runs: v.runs,
      errors: v.errors,
      accepted: v.accepted,
      edited: v.edited,
      rejected: v.rejected,
      avgConfidence: v.conf.length
        ? Math.round((v.conf.reduce((a, b) => a + b, 0) / v.conf.length) * 100) / 100
        : null,
    })),
    duplicatesPrevented: messages ?? 0,
    actionsOpen: actionsOpen ?? 0,
    followUpsScheduled: followUpsOpen ?? 0,
  };
}
