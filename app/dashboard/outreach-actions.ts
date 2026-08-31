'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { normalizeName } from '@/modules/brands/identity';

type Result = { ok?: true; error?: string };
const Uuid = z.string().uuid();

/** O lote de hoje, com tudo o que ela precisa para decidir em segundos. */
export async function todayOutreach() {
  await requireUser();
  const db = await supabaseServer();

  const { data: run } = await db
    .from('outreach_run')
    .select('id, run_date, status, strategy, discovered, screened, selected, partial_failures, finished_at')
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) return { run: null, candidates: [] };

  const { data: candidates } = await db
    .from('outreach_candidate')
    .select('*')
    .eq('run_id', run.id)
    .not('status', 'in', '(rejected,skipped)')
    .order('rank');

  return { run, candidates: candidates ?? [] };
}

export async function updateOutreachDraft(id: string, subject: string, body: string): Promise<Result> {
  await requireUser();
  if (!Uuid.safeParse(id).success) return { error: 'Candidata inválida.' };
  if (subject.trim().length < 3) return { error: 'O assunto ficou vazio.' };
  if (body.trim().length < 40) return { error: 'O corpo ficou curto de mais.' };

  const db = await supabaseServer();
  // `edited` e não `approved`: editar não é aprovar.
  const { error } = await db
    .from('outreach_candidate')
    .update({ subject: subject.trim(), body: body.trim(), status: 'edited' })
    .eq('id', id);
  if (error) return { error: 'Não consegui salvar.' };
  revalidatePath('/dashboard/outreach');
  return { ok: true };
}

export async function approveOutreach(id: string): Promise<Result> {
  await requireUser();
  if (!Uuid.safeParse(id).success) return { error: 'Candidata inválida.' };
  const db = await supabaseServer();
  const { error } = await db.from('outreach_candidate').update({ status: 'approved' }).eq('id', id);
  if (error) return { error: 'Não consegui aprovar.' };
  revalidatePath('/dashboard/outreach');
  return { ok: true };
}

const REASONS = [
  'NOT_MY_STYLE', 'NO_BUDGET_SIGNAL', 'BAD_PRODUCT', 'LOW_VALUE',
  'NO_CREATIVE_IDEA', 'ALREADY_CONTACTED', 'WRONG_NICHE', 'OTHER',
] as const;

/** Saltar é para hoje; rejeitar é para sempre. São decisões diferentes e
 *  salvam-se em sítios diferentes. */
export async function skipOutreach(id: string, reason?: string): Promise<Result> {
  await requireUser();
  if (!Uuid.safeParse(id).success) return { error: 'Candidata inválida.' };
  const db = await supabaseServer();
  const { error } = await db
    .from('outreach_candidate')
    .update({ status: 'skipped', reject_reason: REASONS.includes(reason as never) ? reason : null })
    .eq('id', id);
  if (error) return { error: 'Não consegui saltar.' };
  revalidatePath('/dashboard/outreach');
  return { ok: true };
}

export async function suppressBrand(
  id: string,
  mode: 'never' | 30 | 60 | 90,
  reason?: string,
): Promise<Result> {
  await requireUser();
  if (!Uuid.safeParse(id).success) return { error: 'Candidata inválida.' };

  const db = await supabaseServer();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  const { data: c } = await db
    .from('outreach_candidate')
    .select('name, domain')
    .eq('id', id)
    .maybeSingle();
  if (!me || !c) return { error: 'Candidata não encontrada.' };

  const { error } = await db.from('outreach_suppression').upsert(
    {
      app_user_id: me.id,
      normalized_name: normalizeName(c.name),
      domain: c.domain,
      kind: mode === 'never' ? 'never' : 'until',
      until: mode === 'never' ? null : new Date(Date.now() + mode * 86400000).toISOString(),
      reason: reason ?? '',
    },
    { onConflict: 'app_user_id,normalized_name' },
  );
  if (error) return { error: 'Não consegui salvar a decisão.' };

  await db.from('outreach_candidate').update({ status: 'rejected', reject_reason: reason ?? null }).eq('id', id);
  revalidatePath('/dashboard/outreach');
  return { ok: true };
}

/** Envia. É a única ação irreversível desta tela, e por isso é a única que a
 *  interface pede para confirmar. */
export async function sendOutreach(id: string): Promise<Result & { messageId?: string }> {
  await requireUser();
  if (!Uuid.safeParse(id).success) return { error: 'Candidata inválida.' };

  const { sendCandidate } = await import('@/modules/outreach/send');
  const r = await sendCandidate(id);
  revalidatePath('/dashboard/outreach');
  revalidatePath('/dashboard');
  return r.ok ? { ok: true, messageId: r.messageId } : { error: r.error };
}

export async function sendApprovedOutreach(): Promise<Result & { sent?: number; failed?: number }> {
  await requireUser();
  const db = await supabaseServer();
  const { data } = await db.from('outreach_candidate').select('id').eq('status', 'approved').limit(10);

  const { sendCandidate } = await import('@/modules/outreach/send');
  let sent = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const r = await sendCandidate(row.id);
    if (r.ok) sent++;
    else failed++;
  }
  revalidatePath('/dashboard/outreach');
  revalidatePath('/dashboard');
  return { ok: true, sent, failed };
}

/** «Procurar marcas agora», e a busca dirigida. Mesmo pipeline, sem duplicar. */
/** Uma busca que devolve «0» sem dizer porquê é inútil. Isto conta o funil:
 *  quantas apareceram, quantas sobreviveram à supressão, quantas foram
 *  pesquisadas, quantas ficaram. É onde ela vê que o problema é o filtro e não
 *  o mundo. */
export async function discoverNow(ask?: string): Promise<Result & { message?: string }> {
  await requireUser();
  const { runDailyOutreach } = await import('@/modules/outreach/pipeline');
  const r = await runDailyOutreach({ kind: ask ? 'targeted' : 'manual', ask });
  revalidatePath('/dashboard/outreach');

  if (r.status === 'error') {
    return { error: r.failures.join('; ') || 'A procura falhou.' };
  }

  if (r.selected > 0) {
    return {
      ok: true,
      message: `${r.selected} ${r.selected === 1 ? 'marca nova' : 'marcas novas'}, de ${r.discovered} encontradas.`,
    };
  }

  // Zero tem sempre uma razão, e a razão é útil.
  const why =
    r.discovered === 0
      ? 'A pesquisa não encontrou empresas. Tenta uma busca mais concreta.'
      : r.screened === 0
        ? `Encontrei ${r.discovered}, mas já as conhecias todas — ou já falaste com elas por email.`
        : r.researched === 0
          ? `Encontrei ${r.discovered} novas, mas a pesquisa de cada uma falhou.`
          : `Pesquisei ${r.researched} e nenhuma chegou ao mínimo de encaixe. Melhor assim do que encher a lista.`;

  const extra = r.failures.length ? ` (${r.failures.slice(0, 2).join('; ')})` : '';
  return { ok: true, message: why + extra };
}

export async function rebuildStyleProfile(): Promise<Result & { samples?: number }> {
  await requireUser();
  const { buildStyleProfile } = await import('@/modules/outreach/style');
  const profile = await buildStyleProfile('pt');
  if (!profile) return { error: 'Não encontrei emails de prospecção suficientes no Gmail.' };
  return { ok: true, samples: profile.sampleCount };
}
