import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';
import { recordEvent, type Db } from '@/modules/activity/service';
import {
  FOLLOWUP_POLICY_VERSION, cancelsPendingFollowUp, scheduleFollowUp, situationFor,
  type Situation,
} from './policy';

export type FollowUpRow = {
  id: string;
  opportunityId: string;
  brandId: string | null;
  brandName: string;
  situation: Situation;
  sequenceIndex: number;
  dueAt: string;
  reason: string;
  status: string;
  draftText: string | null;
  policyVersion: string;
};

const SELECT = `
  id, opportunity_id, brand_id, situation, sequence_index, due_at, reason, status,
  draft_text, policy_version, brand:brand_id ( name )
`;

type RawFollowUp = {
  id: string; opportunity_id: string; brand_id: string | null; situation: string;
  sequence_index: number; due_at: string; reason: string; status: string;
  draft_text: string | null; policy_version: string; brand: { name: string } | null;
};

const toRow = (r: RawFollowUp): FollowUpRow => ({
  id: r.id,
  opportunityId: r.opportunity_id,
  brandId: r.brand_id,
  brandName: r.brand?.name ?? '—',
  situation: r.situation as Situation,
  sequenceIndex: r.sequence_index,
  dueAt: r.due_at,
  reason: r.reason,
  status: r.status,
  draftText: r.draft_text,
  policyVersion: r.policy_version,
});

export async function listFollowUps(): Promise<{
  due: FollowUpRow[];
  upcoming: FollowUpRow[];
  nurture: FollowUpRow[];
  sent: FollowUpRow[];
}> {
  const db = await supabaseServer();
  const now = new Date().toISOString();

  const [scheduled, nurture, sent] = await Promise.all([
    db.from('follow_up').select(SELECT).in('status', ['scheduled', 'due']).order('due_at'),
    db.from('follow_up').select(SELECT).eq('status', 'nurture').order('due_at'),
    db.from('follow_up').select(SELECT).eq('status', 'sent').order('sent_at', { ascending: false }).limit(20),
  ]);

  const all = ((scheduled.data ?? []) as unknown as RawFollowUp[]).map(toRow);
  return {
    due: all.filter((f) => f.dueAt <= now),
    upcoming: all.filter((f) => f.dueAt > now),
    nurture: ((nurture.data ?? []) as unknown as RawFollowUp[]).map(toRow),
    sent: ((sent.data ?? []) as unknown as RawFollowUp[]).map(toRow),
  };
}

/** Agenda ou reagenda depois de um evento.
 *
 *  Há um índice único que garante um só follow-up aberto por oportunidade, e
 *  esta função respeita-o cancelando o anterior antes de escrever o novo. Sem
 *  isso, dois eventos no mesmo dia produziam dois lembretes para a mesma
 *  conversa — que é como a automação passa a ruído. */
export async function scheduleFor(
  db: Db,
  input: {
    opportunityId: string;
    brandId: string | null;
    eventType: string;
    eventId?: string | null;
    occurredAt: Date;
    promisedAt?: Date | null;
    waitingUntil?: Date | null;
  },
): Promise<{ scheduled: boolean; dueAt?: string; reason: string }> {
  if (cancelsPendingFollowUp(input.eventType)) {
    await cancelOpen(db, input.opportunityId, 'A marca respondeu ou a oportunidade fechou.');
  }

  const situation = input.promisedAt ? 'promised_date' : situationFor(input.eventType);
  if (!situation) return { scheduled: false, reason: 'Este evento não justifica follow-up.' };

  const { count } = await db
    .from('follow_up')
    .select('id', { count: 'exact', head: true })
    .eq('opportunity_id', input.opportunityId)
    .eq('situation', situation)
    .eq('status', 'sent');

  const plan = scheduleFollowUp({
    situation,
    since: input.occurredAt,
    sentCount: count ?? 0,
    promisedAt: input.promisedAt ?? null,
    waitingUntil: input.waitingUntil ?? null,
  });

  if (plan.kind === 'none') return { scheduled: false, reason: plan.reason };

  await cancelOpen(db, input.opportunityId, 'Substituído por um agendamento mais recente.');

  const { data } = await db
    .from('follow_up')
    .insert({
      opportunity_id: input.opportunityId,
      brand_id: input.brandId,
      trigger_event_id: input.eventId ?? null,
      policy_version: plan.policyVersion,
      sequence_index: plan.sequenceIndex,
      situation: plan.situation,
      due_at: plan.dueAt,
      reason: plan.reason,
      status: plan.kind === 'nurture' ? 'nurture' : 'scheduled',
    })
    .select('id')
    .maybeSingle();

  await recordEvent(db, {
    eventType: plan.kind === 'nurture' ? 'opportunity.nurtured' : 'followup.scheduled',
    brandId: input.brandId,
    opportunityId: input.opportunityId,
    actorType: 'system',
    summary: `${plan.kind === 'nurture' ? 'Nurture' : 'Follow-up'} para ${plan.dueAt.slice(0, 10)}. ${plan.reason}`,
    payload: { dueAt: plan.dueAt, situation: plan.situation, sequenceIndex: plan.sequenceIndex },
    policyVersion: plan.policyVersion,
    dedupeKey: data?.id ? `followup:${data.id}:scheduled` : null,
  });

  return { scheduled: true, dueAt: plan.dueAt, reason: plan.reason };
}

export async function cancelOpen(db: Db, opportunityId: string, reason: string) {
  const { data } = await db
    .from('follow_up')
    .update({ status: 'cancelled', cancelled_reason: reason })
    .eq('opportunity_id', opportunityId)
    .in('status', ['scheduled', 'due'])
    .select('id, brand_id');

  for (const row of data ?? []) {
    await recordEvent(db, {
      eventType: 'followup.cancelled',
      brandId: row.brand_id,
      opportunityId,
      actorType: 'system',
      summary: reason,
      payload: { followUpId: row.id },
      dedupeKey: `followup:${row.id}:cancelled`,
    });
  }
}

export async function markSent(id: string, actorUserId: string, text?: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('follow_up')
    .update({ status: 'sent', sent_at: new Date().toISOString(), ...(text ? { draft_text: text } : {}) })
    .eq('id', id)
    .select('opportunity_id, brand_id, situation, sequence_index')
    .maybeSingle();

  if (!data) return;

  await recordEvent(db, {
    eventType: 'followup.sent',
    brandId: data.brand_id,
    opportunityId: data.opportunity_id,
    actorType: 'carol',
    actorUserId,
    summary: `Follow-up ${data.sequence_index} enviado (${data.situation}).`,
    payload: { followUpId: id, situation: data.situation, sequenceIndex: data.sequence_index },
    dedupeKey: `followup:${id}:sent`,
  });

  // Enviado um, agenda-se o seguinte pela cadência — ou passa a nurture, que é
  // como a sequência acaba em vez de continuar para sempre.
  await scheduleFor(db, {
    opportunityId: data.opportunity_id,
    brandId: data.brand_id,
    eventType: 'followup.sent',
    occurredAt: new Date(),
  }).catch(() => undefined);
}

export async function snoozeFollowUp(id: string, until: string, actorUserId: string) {
  const db = await supabaseServer();
  const { data } = await db
    .from('follow_up')
    .update({ due_at: until })
    .eq('id', id)
    .select('opportunity_id, brand_id')
    .maybeSingle();

  if (!data) return;
  await recordEvent(db, {
    eventType: 'followup.snoozed',
    brandId: data.brand_id,
    opportunityId: data.opportunity_id,
    actorType: 'carol',
    actorUserId,
    summary: `Follow-up adiado para ${until.slice(0, 10)}.`,
    payload: { followUpId: id, until },
  });
}

/** Marca como vencidos os que passaram da data. Chamado pelo trabalho de fundo
 *  e à entrada do Hoje, para o estado estar certo mesmo sem cron ligado. */
export async function markDue(db: Db): Promise<number> {
  const { data } = await db
    .from('follow_up')
    .update({ status: 'due' })
    .eq('status', 'scheduled')
    .lte('due_at', new Date().toISOString())
    .select('id');
  return data?.length ?? 0;
}

/** Cobre a lacuna do backfill: oportunidades activas importadas do painel
 *  antigo não têm follow-up nenhum, e sem isto continuavam a depender da
 *  memória da Carol — que é exactamente o que o produto existe para resolver. */
export async function seedMissingFollowUps(db: Db): Promise<number> {
  const { data: opps } = await db
    .from('opportunity')
    .select('id, brand_id, stage, last_activity_at, waiting_until, created_at')
    .in('stage', ['outreach', 'replied', 'commercial_qualification', 'proposal', 'negotiation']);

  let created = 0;
  for (const o of opps ?? []) {
    const { count } = await db
      .from('follow_up')
      .select('id', { count: 'exact', head: true })
      .eq('opportunity_id', o.id);
    if ((count ?? 0) > 0) continue;

    const eventType =
      o.stage === 'proposal' || o.stage === 'negotiation'
        ? 'proposal.sent'
        : o.stage === 'replied' || o.stage === 'commercial_qualification'
          ? 'portfolio.requested'
          : 'outreach.sent';

    const result = await scheduleFor(db, {
      opportunityId: o.id,
      brandId: o.brand_id,
      eventType,
      occurredAt: new Date(o.last_activity_at ?? o.created_at),
      waitingUntil: o.waiting_until ? new Date(o.waiting_until) : null,
    });
    if (result.scheduled) created++;
  }
  return created;
}

export { FOLLOWUP_POLICY_VERSION };
