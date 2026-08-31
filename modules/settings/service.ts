import 'server-only';

import { blankHealth, summariseHealth, type IntegrationHealth } from './domain';

import { cache } from 'react';
import { DEFAULT_FLAGS, readFlags, type FlagKey, type Flags } from '@/lib/flags';
import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { hasServiceRole, supabaseService } from '@/lib/supabase/service';

/** `cache` por pedido: o Hoje, a barra lateral e cada serviço perguntam pelas
 *  bandeiras, e sem isto era uma ida à base por cada pergunta. */
export const getFlags = cache(async (): Promise<Flags> => {
  const db = await supabaseServer();
  const { data } = await db.from('app_setting').select('value').eq('key', 'flags').maybeSingle();
  return readFlags(data?.value);
});

/** Versão para trabalhos de fundo, onde não há sessão de utilizador. */
export async function getFlagsService(): Promise<Flags> {
  if (!hasServiceRole()) return DEFAULT_FLAGS;
  const { data } = await supabaseService()
    .from('app_setting')
    .select('value')
    .eq('key', 'flags')
    .maybeSingle();
  return readFlags(data?.value);
}

export async function setFlag(key: FlagKey, value: boolean): Promise<Flags> {
  const db = await supabaseServer();
  const current = await getFlags();
  const next = { ...current, [key]: value };
  await db.from('app_setting').upsert({ key: 'flags', value: asJson(next) });
  return next;
}

export type { IntegrationHealth };

export async function integrationHealths(provider = 'google_gmail'): Promise<IntegrationHealth[]> {
  if (!hasServiceRole()) return [];

  const { data, error } = await supabaseService()
    .from('integration_connection')
    .select('id, account_identifier, status, scopes, cursor, last_sync_at, last_success_at, last_error_code, last_error_at')
    .eq('provider', provider)
    .neq('status', 'revoked')
    .order('created_at');

  if (error) {
    return [{ ...blankHealth(provider), status: 'error', lastErrorCode: error.code ?? 'read_failed' }];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    provider,
    account: row.account_identifier,
    status: row.status as IntegrationHealth['status'],
    scopes: row.scopes ?? [],
    cursor: row.cursor,
    lastSyncAt: row.last_sync_at,
    lastSuccessAt: row.last_success_at,
    lastErrorCode: row.last_error_code,
    lastErrorAt: row.last_error_at,
  }));
}


/** Resumo de todas as caixas. A regra de qual manda vive no domínio. */
export async function integrationHealth(provider = 'google_gmail'): Promise<IntegrationHealth> {
  return summariseHealth(await integrationHealths(provider), provider);
}

export type JobSummary = {
  id: string;
  jobType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  itemsProcessed: number;
  errorSummary: string | null;
};

export async function recentJobs(limit = 15): Promise<JobSummary[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('job_run')
    .select('id, job_type, status, started_at, finished_at, items_processed, error_summary')
    .order('started_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    jobType: r.job_type,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    itemsProcessed: r.items_processed,
    errorSummary: r.error_summary,
  }));
}
