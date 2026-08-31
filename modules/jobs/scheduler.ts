import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { hasServiceRole, supabaseService } from '@/lib/supabase/service';
import type { SchedulerState } from './domain';

/** O agendador vive no Supabase, não na Vercel.
 *
 *  O plano Hobby só permite um cron por dia, e o CarolOS precisa de olhar o
 *  Gmail de quinze em quinze minutos: uma marca que responde às nove da manhã
 *  não pode esperar até ao dia seguinte. Baixar a frequência para caber no
 *  plano seria estragar o produto para poupar configuração.
 *
 *  O relógio é o pg_cron, a chamada é o pg_net, e o Bearer vive no Vault. Deste
 *  lado só há três coisas: escrever a configuração, aplicar o horário, e ler o
 *  estado. Tudo passa pelo service role — nenhuma destas funções é chamável
 *  por uma sessão de browser. */

export {
  DISPATCH_LABEL, DISPATCH_TONE, JOB_PURPOSE, readSchedule,
  type ScheduleRow, type SchedulerState,
} from './domain';

export async function schedulerState(): Promise<SchedulerState> {
  const blank: SchedulerState = {
    available: false,
    configured: false,
    baseUrl: null,
    configuredAt: null,
    hasSecret: false,
    rows: [],
    unavailableReason: null,
  };

  if (!hasServiceRole()) {
    return { ...blank, unavailableReason: 'Falta SUPABASE_SERVICE_ROLE_KEY no ambiente.' };
  }

  const db = supabaseService();

  const [{ data: setting }, { data: rows, error }] = await Promise.all([
    db.from('app_setting').select('value').eq('key', 'scheduler').maybeSingle(),
    db.rpc('carolos_schedule_status'),
  ]);

  if (error) {
    return {
      ...blank,
      unavailableReason:
        'O pg_cron ainda não está ativo neste projeto. Aplica as migrações do CarolOS.',
    };
  }

  const value = (setting?.value ?? {}) as { base_url?: string | null; configured_at?: string | null };
  const list = (rows ?? []) as {
    job_name: string; schedule: string; active: boolean; last_dispatch: string | null;
    last_status: string | null; last_error: string | null; processed_count: number | null;
    failures_24h: number;
  }[];

  return {
    available: true,
    configured: Boolean(value.base_url),
    baseUrl: value.base_url ?? null,
    configuredAt: value.configured_at ?? null,
    // Nunca o valor: só se existe. Um segredo não volta ao browser.
    hasSecret: await secretExists(),
    rows: list.map((r) => ({
      jobName: r.job_name,
      schedule: r.schedule,
      active: r.active,
      lastDispatch: r.last_dispatch,
      lastStatus: r.last_status,
      lastError: r.last_error,
      processedCount: r.processed_count,
      failures24h: Number(r.failures_24h ?? 0),
    })),
    unavailableReason: null,
  };
}

async function secretExists(): Promise<boolean> {
  const { data } = await supabaseService()
    .from('cron_dispatch')
    .select('id')
    .eq('status', 'unconfigured')
    .gte('dispatched_at', new Date(Date.now() - 86400000).toISOString())
    .limit(1);
  // Se houve um disparo a queixar-se de falta de configuração nas últimas 24h,
  // é sinal de que o segredo não está lá. Não há forma de o ler para verificar,
  // e é assim que deve ser.
  return (data ?? []).length === 0;
}

export type ConfigureResult = { ok: boolean; error?: string; jobs?: number };

/** Escreve a configuração e aplica o horário.
 *
 *  O segredo vem de `CRON_SECRET`, o mesmo que o endpoint valida — se fossem
 *  dois valores diferentes, o cron batia num 401 para sempre. Vai para o Vault
 *  através de uma função SECURITY DEFINER; nunca passa por SQL escrito à mão
 *  nem fica em `app_setting`. */
export async function configureScheduler(): Promise<ConfigureResult> {
  if (!hasServiceRole()) return { ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' };

  const secret = process.env.CRON_SECRET;
  const baseUrl = process.env.APP_BASE_URL;

  if (!secret) return { ok: false, error: 'Falta CRON_SECRET no ambiente.' };
  if (!baseUrl) return { ok: false, error: 'Falta APP_BASE_URL no ambiente.' };
  if (!/^https?:\/\//.test(baseUrl)) return { ok: false, error: 'APP_BASE_URL tem de começar por http(s)://.' };
  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    return {
      ok: false,
      error: 'APP_BASE_URL aponta para localhost: o Supabase não lhe consegue chegar. Usa o domínio público.',
    };
  }

  const db = supabaseService();

  const { error: secretError } = await db.rpc('carolos_set_cron_secret', { p_secret: secret });
  if (secretError) return { ok: false, error: 'Não foi possível salvar o segredo no Vault.' };

  const { error: settingError } = await db.from('app_setting').upsert({
    key: 'scheduler',
    value: asJson({ base_url: baseUrl.replace(/\/$/, ''), configured_at: new Date().toISOString() }),
  });
  if (settingError) return { ok: false, error: 'Não foi possível salvar a base do endereço.' };

  const { data, error } = await db.rpc('carolos_apply_schedule');
  if (error) return { ok: false, error: 'Não foi possível aplicar o horário no pg_cron.' };

  return { ok: true, jobs: (data ?? []).length };
}

export async function clearSchedule(): Promise<ConfigureResult> {
  if (!hasServiceRole()) return { ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' };
  const { data, error } = await supabaseService().rpc('carolos_clear_schedule');
  if (error) return { ok: false, error: 'Não foi possível remover o horário.' };
  return { ok: true, jobs: Number(data ?? 0) };
}

/** Chamado pelo endpoint quando o trabalho acaba. É o caminho normal de
 *  confirmação; a reconciliação no Postgres só apanha o que falhar aqui. */
export async function confirmDispatch(
  dispatchId: string,
  result: { ok: boolean; processed?: number; error?: string },
) {
  if (!hasServiceRole()) return;
  await supabaseService()
    .from('cron_dispatch')
    .update({
      status: result.ok ? 'ok' : 'failed',
      status_code: result.ok ? 200 : 500,
      processed_count: result.processed ?? null,
      error: result.error?.slice(0, 500) ?? null,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', dispatchId);
}

export type DispatchRow = {
  id: string;
  jobType: string;
  dispatchedAt: string;
  status: string;
  statusCode: number | null;
  processedCount: number | null;
  error: string | null;
};

export async function recentDispatches(limit = 20): Promise<DispatchRow[]> {
  if (!hasServiceRole()) return [];
  const { data } = await supabaseService()
    .from('cron_dispatch')
    .select('id, job_type, dispatched_at, status, status_code, processed_count, error')
    .order('dispatched_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((d) => ({
    id: d.id,
    jobType: d.job_type,
    dispatchedAt: d.dispatched_at,
    status: d.status,
    statusCode: d.status_code,
    processedCount: d.processed_count,
    error: d.error,
  }));
}
