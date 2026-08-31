import 'server-only';

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

/** Estado de saúde das integrações. Passa pelo service role porque
 *  `integration_connection` guarda tokens e não tem policy nenhuma — e devolve
 *  só os campos que podem ser mostrados. */
export type IntegrationHealth = {
  provider: string;
  account: string;
  status: 'connected' | 'error' | 'revoked' | 'paused' | 'disconnected';
  scopes: string[];
  cursor: string | null;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
};

export async function integrationHealth(provider = 'google_gmail'): Promise<IntegrationHealth> {
  const blank: IntegrationHealth = {
    provider,
    account: '',
    status: 'disconnected',
    scopes: [],
    cursor: null,
    lastSyncAt: null,
    lastSuccessAt: null,
    lastErrorCode: null,
    lastErrorAt: null,
  };
  if (!hasServiceRole()) return blank;

  const { data, error } = await supabaseService()
    .from('integration_connection')
    .select('account_identifier, status, scopes, cursor, last_sync_at, last_success_at, last_error_code, last_error_at')
    .eq('provider', provider)
    .maybeSingle();

  // Não conseguir ler não é o mesmo que não estar ligado. Dizer «desligado»
  // quando a resposta certa é «não sei» manda-a ligar outra vez uma coisa que
  // talvez já esteja ligada, e esconde a avaria real.
  if (error) {
    return { ...blank, status: 'error', lastErrorCode: error.code ?? 'read_failed' };
  }

  if (!data) return blank;
  return {
    provider,
    account: data.account_identifier,
    status: data.status as IntegrationHealth['status'],
    scopes: data.scopes ?? [],
    cursor: data.cursor,
    lastSyncAt: data.last_sync_at,
    lastSuccessAt: data.last_success_at,
    lastErrorCode: data.last_error_code,
    lastErrorAt: data.last_error_at,
  };
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
