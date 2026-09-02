'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
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
    .select('id, run_date, status, strategy, discovered, screened, selected, partial_failures, finished_at, started_at')
    // Por `run_date` não chega: várias corridas do mesmo dia empatam e o
    // Postgres devolve uma qualquer — foi por isso que a busca parecia não
    // aparecer na tela. O instante é único.
    .order('started_at', { ascending: false })
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

export type BrandReferenceRow = {
  candidateId: string;
  id: string;
  rank: number;
  platform: string;
  url: string;
  title: string;
  creatorHandle: string | null;
  publishedAt: string | null;
  freshness: string;
  hook: string;
  structure: string;
  editingStyle: string;
  whyItWorks: string;
  fitReason: string;
  adaptation: string;
  doNotCopy: string;
};

/** As referências de várias candidatas numa consulta.
 *
 *  Uma por candidata dava dez idas à base para desenhar uma lista; e carregá-las
 *  só quando o cartão abre obrigava a um estado de espera dentro do cartão,
 *  que é exatamente a frição que a revisão sequencial não tem. */
export async function referencesForCandidates(ids: readonly string[]): Promise<BrandReferenceRow[]> {
  if (ids.length === 0) return [];
  const db = await supabaseServer();
  const { data } = await db
    .from('candidate_reference')
    .select(
      'outreach_candidate_id, rank, fit_reason, adaptation, do_not_copy, reference:creative_reference_id ( id, source_platform, source_url, title, creator_handle, published_at, freshness, hook, structure, editing_style, why_it_works )',
    )
    .in('outreach_candidate_id', ids as string[])
    .order('rank', { ascending: true });

  type Ref = {
    id: string; source_platform: string; source_url: string; title: string;
    creator_handle: string | null; published_at: string | null; freshness: string;
    hook: string; structure: string; editing_style: string; why_it_works: string;
  };
  type Row = {
    outreach_candidate_id: string; rank: number; fit_reason: string; adaptation: string;
    do_not_copy: string; reference: Ref | Ref[] | null;
  };

  const one = (v: Ref | Ref[] | null): Ref | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  return ((data ?? []) as unknown as Row[]).flatMap((r) => {
    const ref = one(r.reference);
    if (!ref) return [];
    return [
      {
        candidateId: r.outreach_candidate_id,
        id: ref.id,
        rank: r.rank,
        platform: ref.source_platform,
        url: ref.source_url,
        title: ref.title,
        creatorHandle: ref.creator_handle,
        publishedAt: ref.published_at,
        freshness: ref.freshness,
        hook: ref.hook,
        structure: ref.structure,
        editingStyle: ref.editing_style,
        whyItWorks: ref.why_it_works,
        fitReason: r.fit_reason,
        adaptation: r.adaptation,
        doNotCopy: r.do_not_copy,
      },
    ];
  });
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

/** Trocar o destinatário antes de enviar.
 *
 *  A pesquisa acerta na maior parte das vezes e às vezes não: a Shopkit tem o
 *  email de marketing na primeira página do Google e a abordagem saiu para
 *  «suporte@». Quando ela o encontra em dez segundos, corrigir tem de demorar
 *  os mesmos dez — não uma nova pesquisa do sistema.
 *
 *  Um endereço escrito por ela é a fonte mais forte que existe, e fica marcado
 *  como tal: `contact_email_set_by_carol` separa o que ela sabe do que o
 *  sistema achou. */
export async function updateOutreachEmail(id: string, email: string): Promise<Result & { note?: string }> {
  await requireUser();
  if (!Uuid.safeParse(id).success) return { error: 'Candidata inválida.' };

  const endereco = email.trim().toLowerCase();
  const { mailboxFit, MAILBOX_FIT_NOTE } = await import('@/modules/outreach/mailcheck');
  const { checkEmail } = await import('@/modules/outreach/mailcheck-dns');

  // O DNS é a única verificação real que existe sem serviço pago, e é rápida.
  // Um endereço que o domínio não recebe é uma devolução garantida.
  const verificado = await checkEmail(endereco, 'website').catch(() => null);
  if (verificado && !verificado.valid) return { error: verificado.reason };

  const db = await supabaseServer();
  const { error } = await db
    .from('outreach_candidate')
    .update({
      contact_email: endereco,
      contact_email_set_by_carol: true,
      email_confidence: 'verified',
      contact_source: 'escrito por ela',
    })
    .eq('id', id);
  if (error) return { error: 'Não consegui salvar o endereço.' };

  revalidatePath('/dashboard/outreach');
  const fit = mailboxFit(endereco);
  return { ok: true, note: fit === 'target' ? undefined : `Atenção: ${MAILBOX_FIT_NOTE[fit]}.` };
}

/** Rever as caixas de email das marcas que já estão na base.
 *
 *  A escolha da caixa passou a ser código, mas as marcas pesquisadas antes
 *  disso ficaram com o que o modelo tinha escolhido. Isto vai buscar o email de
 *  marketing de quem ficou numa caixa errada — e não toca em quem já está na
 *  caixa certa nem no que ela escreveu à mão. */
export async function recheckOutreachEmails(): Promise<
  Result & { message?: string; changed?: number; remaining?: number }
> {
  await requireUser();
  const { recheckOutreachEmails: rever } = await import('@/modules/outreach/recheck');
  const r = await rever();
  revalidatePath('/dashboard/outreach');

  if (r.looked === 0) {
    return { ok: true, message: 'Todas as marcas já estão numa caixa de quem decide.', changed: 0 };
  }

  const linhas = [
    r.changed.length
      ? `${r.changed.length} trocadas: ${r.changed.map((c) => `${c.name} → ${c.to}`).join('; ')}`
      : 'Nenhuma trocada',
    r.kept ? `${r.kept} ficaram como estavam` : '',
    r.failed.length ? `${r.failed.length} sem resposta` : '',
    r.remaining ? `faltam ${r.remaining} — carregue outra vez` : '',
  ].filter(Boolean);

  return { ok: true, message: `${linhas.join(' · ')}.`, changed: r.changed.length, remaining: r.remaining };
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
 *  salvam-se em sites diferentes. */
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
 *  interface pede para confirmar.
 *
 *  Devolve de onde saiu e para onde foi. Um «enviado» sozinho não prova nada a
 *  quem está do outro lado da tela — e o envio esteve semanas a falhar sem que
 *  ninguém percebesse, porque a resposta não dizia nem que tinha falhado. */
export async function sendOutreach(
  id: string,
): Promise<Result & { messageId?: string; from?: string; to?: string; sentAt?: string }> {
  await requireUser();
  if (!Uuid.safeParse(id).success) return { error: 'Candidata inválida.' };

  const { sendCandidate } = await import('@/modules/outreach/send');
  const r = await sendCandidate(id);
  revalidatePath('/dashboard/outreach');
  revalidatePath('/dashboard');
  return r.ok
    ? { ok: true, messageId: r.messageId, from: r.from, to: r.to, sentAt: new Date().toISOString() }
    : { error: r.error };
}

export async function sendApprovedOutreach(): Promise<
  Result & { sent?: number; failed?: number; firstError?: string }
> {
  await requireUser();
  const db = await supabaseServer();
  const { data } = await db.from('outreach_candidate').select('id').eq('status', 'approved').limit(10);

  const { sendCandidate } = await import('@/modules/outreach/send');
  let sent = 0;
  let failed = 0;
  // A razão da primeira falha volta com a contagem: «2 enviados, 3 falharam» é
  // um número, não uma informação — e enquanto o erro ficou por dizer, ninguém
  // soube que nenhuma abordagem saía.
  let firstError: string | undefined;
  for (const row of data ?? []) {
    const r = await sendCandidate(row.id);
    if (r.ok) sent++;
    else {
      failed++;
      firstError ??= r.error;
    }
  }
  revalidatePath('/dashboard/outreach');
  revalidatePath('/dashboard');
  return { ok: true, sent, failed, firstError };
}

/** «Procurar marcas agora», e a busca dirigida. Mesmo pipeline, sem duplicar. */
/** Começa a procura e devolve já.
 *
 *  Uma corrida faz até 52 chamadas ao modelo, espaçadas para não estourar a
 *  cota: são três a quatro minutos. Esperar por ela dentro da ação prendia a
 *  aplicação inteira — a Carol carregava em «procurar» e não conseguia sequer ir
 *  ao Inbox. O trabalho segue depois da resposta, com `after`, e a tela pergunta
 *  de vez em quando se já acabou. */
export async function startDiscovery(ask?: string): Promise<Result & { since?: string }> {
  await requireUser();
  const db = await supabaseServer();

  // Duas corridas ao mesmo tempo duplicavam marcas e cota. Uma de cada vez.
  const { data: running } = await db
    .from('outreach_run')
    .select('id')
    .eq('status', 'running')
    .gt('started_at', new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (running) return { error: 'Já há uma procura a decorrer. Esta acaba primeiro.' };

  const since = new Date().toISOString();
  after(async () => {
    const { runDailyOutreach } = await import('@/modules/outreach/pipeline');
    await runDailyOutreach({ kind: ask ? 'targeted' : 'manual', ask });
  });
  return { ok: true, since };
}

/** Já acabou? A tela pergunta a cada poucos segundos enquanto espera. */
export async function discoveryStatus(since: string): Promise<{
  state: 'running' | 'done' | 'unknown';
  message?: string;
}> {
  await requireUser();
  const db = await supabaseServer();

  const { data: run } = await db
    .from('outreach_run')
    .select('status, discovered, screened, researched, selected, partial_failures')
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Ainda não há linha: o `after` arranca depois da resposta chegar ao cliente.
  if (!run) return { state: 'unknown' };
  if (run.status === 'running') return { state: 'running' };

  const { runMessage } = await import('@/modules/outreach/domain');
  const below = await db
    .from('outreach_candidate')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
    .eq('status', 'researched');

  const out = runMessage({
    status: run.status as 'success' | 'partial' | 'empty' | 'error',
    discovered: run.discovered,
    screened: run.screened,
    researched: run.researched,
    selected: run.selected,
    below: below.count ?? 0,
    failures: (run.partial_failures as string[] | null) ?? [],
    blocked: null,
  });
  return { state: 'done', message: out.message };
}

/** Uma busca que devolve «0» sem dizer porquê é inútil. Isto conta o funil:
 *  quantas apareceram, quantas sobreviveram à supressão, quantas foram
 *  pesquisadas, quantas ficaram. É onde ela vê que o problema é o filtro e não
 *  o mundo. */
export async function discoverNow(ask?: string): Promise<Result & { message?: string }> {
  await requireUser();
  const { runDailyOutreach } = await import('@/modules/outreach/pipeline');
  const r = await runDailyOutreach({ kind: ask ? 'targeted' : 'manual', ask });
  revalidatePath('/dashboard/outreach');

  const { runMessage } = await import('@/modules/outreach/domain');
  const out = runMessage(r);
  return out.ok ? { ok: true, message: out.message } : { error: out.message };
}

export async function rebuildStyleProfile(): Promise<Result & { samples?: number }> {
  await requireUser();
  const { buildStyleProfile } = await import('@/modules/outreach/style');
  const profile = await buildStyleProfile('pt');
  if (!profile) return { error: 'Não encontrei emails de prospeção suficientes no Gmail.' };
  return { ok: true, samples: profile.sampleCount };
}

/** O histórico completo, para ela ver quem já foi prospectado e se presta.
 *
 *  Lê tudo — incluindo as recusadas e as postas de lado, que a revisão diária
 *  esconde. É esse o ponto: o que ficou de fora é metade do que diz se a
 *  prospeção está acertando. */
export async function outreachHistory(status?: string) {
  await requireUser();
  const db = await supabaseServer();

  let q = db
    .from('outreach_candidate')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (status && status !== 'todas') q = q.eq('status', status);

  const [{ data: rows }, { data: runs }] = await Promise.all([
    q,
    db
      .from('outreach_run')
      .select('id, run_date, kind, status, discovered, screened, researched, selected, partial_failures, started_at')
      .order('started_at', { ascending: false })
      .limit(30),
  ]);

  return { rows: rows ?? [], runs: runs ?? [] };
}

/** Escreve o email de uma marca que ficou abaixo do corte.
 *
 *  A corrida diária só escreve para quem passa o encaixe mínimo — escrever para
 *  todas gastava a cota em emails que ninguém ia mandar. Quando ela olha para
 *  uma das outras e decide que vale a pena, é aqui que o email nasce: uma
 *  chamada, pedida por ela, e não vinte por dia à espera de serem lidas. */
export async function draftOutreach(id: string): Promise<Result & { subject?: string; body?: string }> {
  await requireUser();
  const db = await supabaseServer();

  const { data: c } = await db.from('outreach_candidate').select('*').eq('id', id).maybeSingle();
  if (!c) return { error: 'Não encontrei essa marca.' };
  if (c.subject) return { error: 'O email desta marca já está escrito.' };

  const [{ writeOutreachEmail }, { scoreEmail }, { latestStyleProfile }] = await Promise.all([
    import('@/modules/outreach/email'),
    import('@/modules/outreach/domain'),
    import('@/modules/outreach/style'),
  ]);

  const written = await writeOutreachEmail(
    {
      candidate: {
        name: c.name,
        normalizedName: c.normalized_name,
        website: c.website,
        domain: c.domain,
        country: c.country,
        nicheId: c.niche_id,
        description: c.product ?? '',
        why: c.why_fit,
        source: null,
      } as never,
      research: {
        product: c.product,
        country: c.country,
        why_fit: c.why_fit,
        why_now: c.why_now,
        why_may_pay: c.why_may_pay,
        risk: c.risk,
        paid_media_signal: c.paid_media_signal,
        ugc_signal: c.ugc_signal,
        creative_opportunity: c.creative_opportunity,
        content_ideas: c.content_ideas,
        red_flags: c.red_flags,
        sources: c.sources,
        contact: c.contact_email
          ? {
              name: c.contact_name,
              role: c.contact_role,
              email: c.contact_email,
              confidence: c.email_confidence,
              source: c.contact_source,
            }
          : null,
      } as never,
    },
    await latestStyleProfile(c.language === 'en' ? 'en' : 'pt'),
  );

  if (!written) return { error: 'Não consegui escrever este email agora.' };

  const quality = scoreEmail({
    subject: written.subject,
    body: written.body,
    brandName: c.name,
    product: c.product,
    claims: written.claims.map((x) => ({ text: x.text, sourceId: x.source })),
  });

  const { error } = await db
    .from('outreach_candidate')
    .update({
      subject: written.subject,
      body: written.body,
      ai_subject: written.subject,
      ai_body: written.body,
      language: written.language,
      portfolio_match: written.portfolio as never,
      quality: quality as never,
      status: quality.pass ? 'ready' : 'needs_review',
    })
    .eq('id', id);
  if (error) return { error: 'Escrevi o email mas não o consegui salvar.' };

  revalidatePath('/dashboard/outreach');
  return { ok: true, subject: written.subject, body: written.body };
}

/** Descarta várias de uma vez.
 *
 *  As que ficam abaixo do corte são as que enchem a lista, e mandá-las embora
 *  uma a uma é trabalho a sério quando são doze. Continuam existindo na base de
 *  propósito: é isso que impede a descoberta de amanhã de as encontrar outra vez
 *  e pagar a pesquisa de novo. Ficam no histórico, em «De lado». */
export async function discardMany(ids: string[]): Promise<Result & { discarded?: number }> {
  await requireUser();
  const validos = ids.filter((id) => Uuid.safeParse(id).success);
  if (validos.length === 0) return { error: 'Nada para descartar.' };

  const db = await supabaseServer();
  const { error, count } = await db
    .from('outreach_candidate')
    .update({ status: 'skipped' }, { count: 'exact' })
    .in('id', validos)
    // Uma que já saiu não se descarta: o email está enviado e o registro é o que
    // prova isso.
    .neq('status', 'sent');
  if (error) return { error: 'Não consegui descartar.' };

  revalidatePath('/dashboard/outreach');
  return { ok: true, discarded: count ?? validos.length };
}

/* ── Prospeção v2 ───────────────────────────────────────────────────────── */

/** Começa uma busca dirigida. Devolve já; o trabalho segue depois da resposta. */
export async function startManualSearch(
  query: string,
  country: string,
): Promise<Result & { since?: string }> {
  await requireUser();
  const q = query.trim();
  if (q.length < 2) return { error: 'Escreva o que quer procurar.' };

  const db = await supabaseServer();
  const { data: running } = await db
    .from('outreach_run')
    .select('id')
    .eq('status', 'running')
    .gt('started_at', new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (running) return { error: 'Já há uma procura a decorrer. Esta acaba primeiro.' };

  const since = new Date().toISOString();
  after(async () => {
    const { runManualSearch } = await import('@/modules/outreach/manual');
    await runManualSearch(q, country.trim() || 'Portugal');
  });
  return { ok: true, since };
}

/** Quanto tempo uma busca dirigida continua sendo «a busca de agora». Passado
 *  isto, o tela volta ao lote automático do dia. */
const MANUAL_FRESH_MS = 6 * 3600_000;

/** Os resultados da última busca dirigida, com o que foi pedido e o que foi
 *  descartado. Sem isto ela não tem como saber porque é que a lista é curta.
 *
 *  A validade decide-se aqui e não em quem mostra: ler o relógio durante o
 *  render torna o resultado dependente de quando o React calhou re-renderizar,
 *  e a busca dirigida é justamente a que não pode misturar-se com a automática
 *  — era o que fazia uma procura por hotéis parecer ter devolvido os apps da
 *  corrida da manhã. */
export async function latestManualRun() {
  await requireUser();
  const db = await supabaseServer();

  const { data: run } = await db
    .from('outreach_run')
    .select('*')
    .eq('kind', 'targeted')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) return { run: null, candidates: [] };
  if (Date.now() - new Date(run.started_at).getTime() >= MANUAL_FRESH_MS) {
    return { run: null, candidates: [] };
  }

  const { data: candidates } = await db
    .from('outreach_candidate')
    .select('*')
    .eq('run_id', run.id)
    .not('status', 'in', '(rejected,skipped)')
    .order('rank');

  return { run, candidates: candidates ?? [] };
}


/** Salvar é o que faz um resultado de busca virar candidata a sério.
 *  Sem isto, uma busca exploratória sujava o CRM com tudo o que apareceu. */
export async function saveCandidates(ids: string[]): Promise<Result & { saved?: number }> {
  await requireUser();
  const validos = ids.filter((id) => Uuid.safeParse(id).success);
  if (validos.length === 0) return { error: 'Nada para salvar.' };

  const db = await supabaseServer();
  const { error, count } = await db
    .from('outreach_candidate')
    .update({ saved: true, saved_at: new Date().toISOString() }, { count: 'exact' })
    .in('id', validos);
  if (error) return { error: 'Não consegui salvar.' };

  revalidatePath('/dashboard/outreach');
  return { ok: true, saved: count ?? validos.length };
}

/** Limpa os resultados desta busca da tela — não o histórico.
 *  O que ela guardou fica; o resto era exploração e não tem de ficar. */
export async function clearManualSearch(): Promise<Result & { cleared?: number }> {
  await requireUser();
  const db = await supabaseServer();

  const { data: run } = await db
    .from('outreach_run')
    .select('id')
    .eq('kind', 'targeted')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return { ok: true, cleared: 0 };

  const { error, count } = await db
    .from('outreach_candidate')
    .delete({ count: 'exact' })
    .eq('run_id', run.id)
    .eq('saved', false);
  if (error) return { error: 'Não consegui limpar.' };

  revalidatePath('/dashboard/outreach');
  return { ok: true, cleared: count ?? 0 };
}

export async function getFocus() {
  await requireUser();
  const { readFocus } = await import('@/modules/outreach/focus-service');
  return readFocus();
}

export async function saveFocus(input: {
  niches: { id: string; label: string; favourite: boolean }[];
  countries: string[];
  perDay: number;
}): Promise<Result> {
  await requireUser();
  try {
    const { writeFocus } = await import('@/modules/outreach/focus-service');
    await writeFocus(input);
    revalidatePath('/dashboard/outreach');
    return { ok: true };
  } catch {
    return { error: 'Não consegui salvar o foco.' };
  }
}
