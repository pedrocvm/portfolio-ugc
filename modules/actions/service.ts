import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { recordEvent, type Db } from '@/modules/activity/service';
import { expiryStatus } from '@/modules/rights/engine';
import {
  planForOpportunity,
  priorityScore,
  staleActionIds,
  nextActionGroups,
  type ActionType,
  type OpportunitySnapshot,
  type PlannedAction,
  type Risk,
} from './planner';

/** O planeador corre aqui e escreve em `action_item`. A tela Hoje só lê.
 *
 *  Reentrante por desenho: correr duas vezes seguidas não duplica cartões
 *  (a `dedupe_key` trata disso) e fecha os que deixaram de fazer sentido. */

export type ActionRow = {
  id: string;
  type: ActionType;
  title: string;
  reason: string;
  cta: string;
  dueAt: string | null;
  risk: Risk;
  priorityScore: number;
  status: 'open' | 'done' | 'snoozed' | 'cancelled';
  snoozedUntil: string | null;
  requiresApproval: boolean;
  evidence: Record<string, unknown>;
  opportunityId: string | null;
  brandId: string | null;
  brandName: string;
  stage: string | null;
  createdAt: string;
};

const SELECT = `
  id, type, title, reason, due_at, risk, priority_score, status, snoozed_until,
  requires_approval, evidence, opportunity_id, brand_id, created_at,
  brand:brand_id ( name ),
  opportunity:opportunity_id ( stage )
`;

type RawAction = {
  id: string; type: string; title: string; reason: string; due_at: string | null;
  risk: string; priority_score: number; status: string; snoozed_until: string | null;
  requires_approval: boolean; evidence: unknown; opportunity_id: string | null;
  brand_id: string | null; created_at: string;
  brand: { name: string } | null;
  opportunity: { stage: string } | null;
};

import { ACTION_CTA } from './planner';

const toAction = (r: RawAction): ActionRow => ({
  id: r.id,
  type: r.type as ActionType,
  title: r.title,
  reason: r.reason,
  cta: ACTION_CTA[r.type as ActionType] ?? 'Abrir',
  dueAt: r.due_at,
  risk: r.risk as Risk,
  priorityScore: r.priority_score,
  status: r.status as ActionRow['status'],
  snoozedUntil: r.snoozed_until,
  requiresApproval: r.requires_approval,
  evidence: (r.evidence ?? {}) as Record<string, unknown>,
  opportunityId: r.opportunity_id,
  brandId: r.brand_id,
  brandName: r.brand?.name ?? '—',
  stage: r.opportunity?.stage ?? null,
  createdAt: r.created_at,
});

/** A fila do Hoje. Adiados só reaparecem quando a data passa. */
export async function todayQueue(limit = 40): Promise<ActionRow[]> {
  const db = await supabaseServer();
  const now = new Date().toISOString();
  const { data } = await db
    .from('action_item')
    .select(SELECT)
    .eq('status', 'open')
    .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
    .order('priority_score', { ascending: false })
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(limit);
  return ((data ?? []) as unknown as RawAction[]).map(toAction);
}

export async function snoozedQueue(): Promise<ActionRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('action_item')
    .select(SELECT)
    .eq('status', 'snoozed')
    .order('snoozed_until', { ascending: true });
  return ((data ?? []) as unknown as RawAction[]).map(toAction);
}

export async function actionsForOpportunity(opportunityId: string): Promise<ActionRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('action_item')
    .select(SELECT)
    .eq('opportunity_id', opportunityId)
    .eq('status', 'open')
    .order('priority_score', { ascending: false });
  return ((data ?? []) as unknown as RawAction[]).map(toAction);
}


/** Reúne o retrato de uma oportunidade a partir do estado já materializado.
 *  Uma consulta por oportunidade em vez de cinco: o Hoje carrega dezenas. */
async function snapshotOpportunities(db: Db, opportunityIds?: string[]) {
  let q = db
    .from('opportunity')
    .select(`
      id, brand_id, stage, product_name, expected_cash_cents, last_activity_at,
      waiting_until, next_action_text,
      brand:brand_id ( name, fit_score )
    `)
    .not('stage', 'in', '(won,lost)');
  if (opportunityIds?.length) q = q.in('id', opportunityIds);

  const { data: opps } = await q;
  const ids = (opps ?? []).map((o) => o.id);
  if (!ids.length) return [];

  const [{ data: followUps }, { data: threads }, { data: quotes }, { data: docs }] = await Promise.all([
    db.from('follow_up').select('id, opportunity_id, due_at, reason, status').in('opportunity_id', ids)
      .in('status', ['scheduled', 'due']),
    db.from('source_thread').select('id, opportunity_id, last_message_at').in('opportunity_id', ids),
    db.from('quote').select('id, opportunity_id').in('opportunity_id', ids),
    db.from('document').select('id, opportunity_id').in('opportunity_id', ids).eq('kind', 'proposal'),
  ]);

  // Última mensagem inbound sem resposta posterior da Carol.
  const threadIds = (threads ?? []).map((t) => t.id);
  const awaiting = new Map<string, string>();
  const asks = new Map<string, string[]>();
  const risks = new Map<string, string[]>();

  if (threadIds.length) {
    const { data: messages } = await db
      .from('source_message')
      .select('thread_id, direction, sent_at')
      .in('thread_id', threadIds)
      .order('sent_at', { ascending: false });

    const latestByThread = new Map<string, { direction: string; sentAt: string }>();
    for (const m of messages ?? []) {
      if (!latestByThread.has(m.thread_id)) {
        latestByThread.set(m.thread_id, { direction: m.direction, sentAt: m.sent_at });
      }
    }
    for (const t of threads ?? []) {
      const last = latestByThread.get(t.id);
      if (t.opportunity_id && last?.direction === 'inbound') awaiting.set(t.opportunity_id, last.sentAt);
    }
  }

  // Pedidos e riscos em aberto vêm dos eventos de extração mais recentes.
  const { data: extractions } = await db
    .from('activity_event')
    .select('opportunity_id, payload, occurred_at')
    .in('opportunity_id', ids)
    .eq('event_type', 'reply.classified')
    .order('occurred_at', { ascending: false });

  for (const e of extractions ?? []) {
    if (!e.opportunity_id || asks.has(e.opportunity_id)) continue;
    const payload = (e.payload ?? {}) as { replyTypes?: string[]; riskFlags?: string[] };
    asks.set(e.opportunity_id, payload.replyTypes ?? []);
    risks.set(e.opportunity_id, payload.riskFlags ?? []);
  }

  const followUpByOpp = new Map<string, { id: string; dueAt: string; reason: string }>();
  const now = Date.now();
  for (const f of followUps ?? []) {
    if (new Date(f.due_at).getTime() <= now) {
      followUpByOpp.set(f.opportunity_id, { id: f.id, dueAt: f.due_at, reason: f.reason });
    }
  }

  const quoteSet = new Set((quotes ?? []).map((q) => q.opportunity_id));
  const docSet = new Set((docs ?? []).map((d) => d.opportunity_id));

  return (opps ?? []).map((o): OpportunitySnapshot => {
    const brand = o.brand as unknown as { name: string; fit_score: number | null } | null;
    return {
      id: o.id,
      brandId: o.brand_id,
      brandName: brand?.name ?? '—',
      stage: o.stage as OpportunitySnapshot['stage'],
      productName: o.product_name,
      fitScore: brand?.fit_score ?? null,
      expectedCents: o.expected_cash_cents,
      lastActivityAt: o.last_activity_at,
      waitingUntil: o.waiting_until,
      nextActionText: o.next_action_text,
      awaitingReplySince: awaiting.get(o.id) ?? null,
      openAsks: asks.get(o.id) ?? [],
      riskFlags: risks.get(o.id) ?? [],
      dueFollowUp: followUpByOpp.get(o.id) ?? null,
      hasQuote: quoteSet.has(o.id),
      hasProposalDoc: docSet.has(o.id),
    };
  });
}

export type PlanReport = { opportunities: number; actions: number };

/** Recalcula a fila. `opportunityIds` limita o alcance depois de um evento;
 *  sem argumento corre sobre tudo o que está aberto, que é o que o trabalho
 *  nocturno faz. */
export async function replanActions(db: Db, opportunityIds?: string[]): Promise<PlanReport> {
  const snapshots = await snapshotOpportunities(db, opportunityIds);
  if (snapshots.length === 0) return { opportunities: 0, actions: 0 };

  // Em lote, e não uma oportunidade de cada vez. Eram três a quatro idas à base
  // por oportunidade, em série: com trinta oportunidades, cem viagens antes de a
  // tela responder — que era o «recalcular fila» a bloquear tudo. São quatro.
  const plans = snapshots.map((snap) => ({ snap, planned: planForOpportunity(snap) }));
  const ids = snapshots.map((s) => s.id);
  const keep = new Set(plans.flatMap((p) => p.planned.map((a) => a.dedupeKey)));

  const { data: open } = await db
    .from('action_item')
    .select('id, dedupe_key')
    .in('opportunity_id', ids)
    .eq('status', 'open');

  // Cancelado, não apagado: o cartão existiu e a razão de ter desaparecido importa.
  const stale = staleActionIds(open ?? [], keep);
  if (stale.length) {
    await db.from('action_item').update({ status: 'cancelled' }).in('id', stale);
  }

  const rows = plans.flatMap(({ snap, planned }) =>
    planned.map((p) => ({
      opportunity_id: snap.id,
      brand_id: snap.brandId,
      type: p.type,
      title: p.title,
      reason: p.reason,
      evidence: asJson(p.evidence),
      risk: p.risk,
      due_at: p.dueAt,
      priority_score: p.priorityScore,
      status: 'open' as const,
      requires_approval: p.requiresApproval,
      dedupe_key: p.dedupeKey,
    })),
  );
  if (rows.length) {
    await db.from('action_item').upsert(rows, { onConflict: 'dedupe_key' });
  }

  // O texto da próxima ação é materializado na oportunidade: é o que a listagem
  // do funil mostra sem ir buscar a fila toda. Quase todas ficam com o mesmo
  // valor, por isso escrevem-se agrupadas.
  const groups = nextActionGroups(
    plans.map(({ snap, planned }) => ({
      id: snap.id,
      text: planned[0]?.title ?? '',
      dueAt: planned[0]?.dueAt ?? null,
    })),
  );
  await Promise.all(
    groups.map((g) =>
      db
        .from('opportunity')
        .update({ next_action_text: g.text, next_action_due_at: g.dueAt })
        .in('id', g.ids),
    ),
  );

  return { opportunities: snapshots.length, actions: rows.length };
}

/** Ações que não nascem de uma oportunidade: licenças a expirar, pagamentos
 *  em atraso, integrações partidas. */
export async function replanGlobalActions(db: Db): Promise<number> {
  let created = 0;

  const { data: licenses } = await db
    .from('rights_license')
    .select('id, brand_id, opportunity_id, end_at, platforms')
    .eq('status', 'active')
    .not('end_at', 'is', null);

  for (const l of licenses ?? []) {
    const status = expiryStatus(l.end_at);
    if (status.state !== 'expiring' && status.state !== 'expired') continue;
    const score = priorityScore({ type: 'renew_rights', dueAt: `${l.end_at}T12:00:00Z`, risk: 'medium' });
    await db.from('action_item').upsert(
      {
        opportunity_id: l.opportunity_id,
        brand_id: l.brand_id,
        type: 'renew_rights' as const,
        title: status.state === 'expired' ? 'Licença de uso expirada' : 'Licença de uso a expirar',
        reason:
          status.state === 'expired'
            ? `A licença terminou há ${status.daysAgo} dias. Se ainda está rodando, é uso não autorizado.`
            : `Faltam ${status.daysLeft} dias. É o momento de propor renovação com contexto de campanha.`,
        evidence: asJson({ licenseId: l.id, endAt: l.end_at, platforms: l.platforms }),
        risk: 'medium' as const,
        due_at: `${l.end_at}T12:00:00Z`,
        priority_score: score,
        status: 'open' as const,
        requires_approval: true,
        dedupe_key: `rights:${l.id}:renewal`,
      },
      { onConflict: 'dedupe_key' },
    );
    created++;
  }

  const { data: overdue } = await db
    .from('payment')
    .select('id, brand_id, opportunity_id, amount_cents, currency, due_at')
    .in('status', ['due', 'invoiced'])
    .not('due_at', 'is', null)
    .lte('due_at', new Date().toISOString().slice(0, 10));

  for (const p of overdue ?? []) {
    await db.from('action_item').upsert(
      {
        opportunity_id: p.opportunity_id,
        brand_id: p.brand_id,
        type: 'chase_payment' as const,
        title: 'Pagamento em atraso',
        reason: `Vencido a ${p.due_at}. ${(p.amount_cents / 100).toFixed(2)} ${p.currency}.`,
        evidence: asJson({ paymentId: p.id, dueAt: p.due_at, amountCents: p.amount_cents }),
        risk: 'high' as const,
        due_at: `${p.due_at}T12:00:00Z`,
        priority_score: priorityScore({ type: 'chase_payment', dueAt: `${p.due_at}T12:00:00Z`, risk: 'high' }),
        status: 'open' as const,
        requires_approval: true,
        dedupe_key: `payment:${p.id}:chase`,
      },
      { onConflict: 'dedupe_key' },
    );
    created++;
  }

  return created;
}

export async function completeAction(id: string, actorUserId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('action_item')
    .select('brand_id, opportunity_id, title, type')
    .eq('id', id)
    .maybeSingle();

  await db.from('action_item').update({ status: 'done' }).eq('id', id);

  if (data) {
    await recordEvent(db, {
      eventType: 'opportunity.stage_changed',
      brandId: data.brand_id,
      opportunityId: data.opportunity_id,
      actorType: 'carol',
      actorUserId,
      summary: `Ação concluída: ${data.title}`,
      payload: { actionType: data.type, resolved: true },
    });
  }
}

export async function snoozeAction(id: string, until: string, actorUserId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('action_item')
    .select('brand_id, opportunity_id, title')
    .eq('id', id)
    .maybeSingle();

  await db.from('action_item').update({ status: 'snoozed', snoozed_until: until }).eq('id', id);

  if (data) {
    await recordEvent(db, {
      eventType: 'followup.snoozed',
      brandId: data.brand_id,
      opportunityId: data.opportunity_id,
      actorType: 'carol',
      actorUserId,
      summary: `Adiado até ${until.slice(0, 10)}: ${data.title}`,
      payload: { until },
    });
  }
}

export async function dismissAction(id: string) {
  const db = await supabaseServer();
  await db.from('action_item').update({ status: 'cancelled' }).eq('id', id);
}

/** Um adiado cuja data já passou volta à fila. Corre no trabalho de fundo e
 *  também à entrada do Hoje, para a fila estar certa mesmo sem cron. */
export async function wakeSnoozed(db: Db): Promise<number> {
  const { data } = await db
    .from('action_item')
    .update({ status: 'open', snoozed_until: null })
    .eq('status', 'snoozed')
    .lte('snoozed_until', new Date().toISOString())
    .select('id');
  return data?.length ?? 0;
}
