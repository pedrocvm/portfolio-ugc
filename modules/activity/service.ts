import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { eventLabel, type EventInput, type EventType } from './events';

export type Db = SupabaseClient<Database>;

/** Escreve um evento. Com `dedupeKey`, correr o mesmo processamento duas vezes
 *  devolve a linha que já existia em vez de criar outra — é o que torna a
 *  sincronização segura de repetir.
 *
 *  Devolve o id do evento, ou null se a escrita falhou (nunca atira: um evento
 *  perdido não pode derrubar uma sincronização inteira). */
export async function recordEvent(db: Db, input: EventInput): Promise<string | null> {
  const row = {
    event_type: input.eventType,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    brand_id: input.brandId ?? null,
    contact_id: input.contactId ?? null,
    opportunity_id: input.opportunityId ?? null,
    collaboration_id: input.collaborationId ?? null,
    source_thread_id: input.sourceThreadId ?? null,
    source_message_id: input.sourceMessageId ?? null,
    actor_type: input.actorType,
    actor_user_id: input.actorUserId ?? null,
    channel: input.channel ?? null,
    summary: input.summary ?? eventLabel(input.eventType),
    payload: asJson(input.payload ?? {}),
    confidence: input.confidence ?? null,
    policy_version: input.policyVersion ?? null,
    dedupe_key: input.dedupeKey ?? null,
  };

  const { data, error } = await db.from('activity_event').insert(row).select('id').maybeSingle();

  if (!error) return data?.id ?? null;

  // 23505: a chave de deduplicação já existe. Não é falha — é a garantia a
  // funcionar. Devolve o id que já lá está.
  if (error.code === '23505' && input.dedupeKey) {
    const { data: existing } = await db
      .from('activity_event')
      .select('id')
      .eq('dedupe_key', input.dedupeKey)
      .maybeSingle();
    return existing?.id ?? null;
  }

  console.error('[carolos] falha a registar evento', input.eventType, error.code);
  return null;
}

export type TimelineEntry = {
  id: string;
  eventType: string;
  label: string;
  occurredAt: string;
  actorType: string;
  channel: string | null;
  summary: string;
  payload: Record<string, unknown>;
  confidence: number | null;
  brandId: string | null;
  opportunityId: string | null;
};

const toEntry = (r: {
  id: string; event_type: string; occurred_at: string; actor_type: string;
  channel: string | null; summary: string; payload: unknown; confidence: number | null;
  brand_id: string | null; opportunity_id: string | null;
}): TimelineEntry => ({
  id: r.id,
  eventType: r.event_type,
  label: eventLabel(r.event_type),
  occurredAt: r.occurred_at,
  actorType: r.actor_type,
  channel: r.channel,
  summary: r.summary,
  payload: (r.payload ?? {}) as Record<string, unknown>,
  confidence: r.confidence,
  brandId: r.brand_id,
  opportunityId: r.opportunity_id,
});

const TIMELINE_COLUMNS =
  'id, event_type, occurred_at, actor_type, channel, summary, payload, confidence, brand_id, opportunity_id';

export async function brandTimeline(brandId: string, limit = 100): Promise<TimelineEntry[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('activity_event')
    .select(TIMELINE_COLUMNS)
    .eq('brand_id', brandId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(toEntry);
}

export async function opportunityTimeline(opportunityId: string, limit = 100): Promise<TimelineEntry[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('activity_event')
    .select(TIMELINE_COLUMNS)
    .eq('opportunity_id', opportunityId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(toEntry);
}

export async function recentActivity(limit = 40): Promise<TimelineEntry[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('activity_event')
    .select(TIMELINE_COLUMNS)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(toEntry);
}

/** Marca a actividade mais recente na marca e na oportunidade. Materializado
 *  de propósito: a alternativa é um MAX(occurred_at) em cada listagem. */
export async function touchActivity(
  db: Db,
  ids: { brandId?: string | null; opportunityId?: string | null },
  at: string,
) {
  if (ids.brandId) {
    await db.from('brand').update({ last_activity_at: at }).eq('id', ids.brandId);
    await db.from('relationship').update({ last_interaction_at: at }).eq('brand_id', ids.brandId);
  }
  if (ids.opportunityId) {
    await db.from('opportunity').update({ last_activity_at: at }).eq('id', ids.opportunityId);
  }
}

/** Conta eventos por tipo num intervalo. Base da folha de analytics — sem
 *  inventar histórico: só conta o que foi mesmo registado. */
export async function countEvents(
  types: readonly EventType[],
  since: Date,
): Promise<Record<string, number>> {
  const db = await supabaseServer();
  const { data } = await db
    .from('activity_event')
    .select('event_type')
    .in('event_type', types as unknown as string[])
    .gte('occurred_at', since.toISOString());

  const out: Record<string, number> = {};
  for (const t of types) out[t] = 0;
  for (const row of data ?? []) out[row.event_type] = (out[row.event_type] ?? 0) + 1;
  return out;
}
