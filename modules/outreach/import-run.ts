import 'server-only';

import { hashContent } from '@/lib/crypto';
import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { localDay } from '@/lib/time';
import { normalizeDomain, normalizeHandle, normalizeName } from '@/modules/brands/identity';
import { guessNiche } from '@/modules/brands/niches';
import { scoreBrandFit, type FitSignals } from '@/modules/brands/fit';
import type { Discovered } from './discovery';
import { scoreEmail } from './domain';
import { familyFor, opportunityFor } from './intent';
import {
  IMPORT_LIMITS, importKeyOf, parseBrandList, planFor, summarize, summaryText,
  type ImportedBrandCandidate, type ParsedList, type Resolution,
} from './import';
import { dedupFor, historyBrief } from './import-dedup';
import { chooseFromResearch } from './mailcheck';
import { gatherFacts, researchCandidate } from './research';

/** «Já tenho marcas»: o lote que ela colou, trabalhado até ao fim.
 *
 *  O princípio que governa este arquivo: **a Carol já escolheu**. Isto não é
 *  descoberta — não há portão de relevância, não se procura substituta, não se
 *  acrescenta nada à lista, e o encaixe comercial descreve sem excluir. Se ela
 *  colou dez hotéis, saem dez hotéis analisados, mesmo que hotelaria não seja o
 *  nicho prioritário do mês.
 *
 *  A ordem existe por causa do custo e do risco, por esta ordem: identificar é
 *  barato e sem ele tudo o resto é sobre a empresa errada; deduplicar evita
 *  abordar quem já foi abordado; pesquisar é caro; escrever é o mais caro de
 *  todos e só acontece para quem leva email.
 *
 *  Corre por lotes retomáveis. Um pedido HTTP morre aos 300 s e vinte e cinco
 *  marcas não cabem lá — por isso cada marca é reclamada antes de ser
 *  trabalhada, e quem entrar a seguir continua de onde ficou em vez de repetir
 *  o que já foi pago. */

/* ── Abrir o lote ────────────────────────────────────────────────────────── */

export type OpenResult =
  | { ok: true; runId: string; total: number; parsed: ParsedList; resumed: boolean }
  | { ok: false; error: string };

/** Quanto tempo um lote idêntico conta como o mesmo lote. Colar a mesma lista
 *  duas vezes seguidas é engano; colá-la daqui a uma semana é uma revisão. */
const MESMO_LOTE_MS = 6 * 3600_000;

export async function openImportBatch(raw: string): Promise<OpenResult> {
  const parsed = parseBrandList(raw);

  if (parsed.items.length === 0) {
    return { ok: false, error: 'Não encontrei nenhuma marca nessa lista.' };
  }
  if (parsed.items.length > IMPORT_LIMITS.max) {
    return {
      ok: false,
      error: `São ${parsed.items.length} marcas e eu trato até ${IMPORT_LIMITS.max} de cada vez. Divida em dois lotes.`,
    };
  }

  const db = supabaseService();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { ok: false, error: 'Sem usuário.' };

  // Idempotência do lote: a mesma lista não abre duas corridas nem paga duas
  // vezes a pesquisa. A chave é o conjunto de marcas, não o texto — trocar a
  // ordem das linhas não faz um lote novo.
  const hash = await hashContent(
    parsed.items.map(importKeyOf).sort().join('|'),
  );
  const { data: anterior } = await db
    .from('outreach_run')
    .select('id, started_at, total')
    .eq('app_user_id', me.id)
    .eq('kind', 'imported')
    .eq('input_hash', hash)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (anterior && Date.now() - new Date(anterior.started_at).getTime() < MESMO_LOTE_MS) {
    return { ok: true, runId: anterior.id, total: anterior.total, parsed, resumed: true };
  }

  const { data: run, error } = await db
    .from('outreach_run')
    .insert({
      app_user_id: me.id,
      run_date: localDay(new Date()),
      kind: 'imported',
      status: 'running',
      source: 'MANUAL_LIST',
      raw_input: raw.slice(0, 20000),
      input_hash: hash,
      total: parsed.items.length,
      processed: 0,
      discovered: parsed.items.length,
      strategy: asJson({ mode: 'imported', note: 'Marcas escolhidas por ela. Não se procuram substitutas.' }),
    })
    .select('id')
    .maybeSingle();

  if (error || !run) return { ok: false, error: 'Não consegui abrir o lote.' };

  const rows = parsed.items.map((c, i) => ({
    run_id: run.id,
    name: c.detectedName,
    normalized_name: normalizeName(c.detectedName) || `linha${i + 1}`,
    website: c.detectedWebsite,
    domain: c.detectedDomain,
    instagram: c.detectedInstagram,
    linkedin: c.detectedLinkedin ? `https://www.linkedin.com/company/${c.detectedLinkedin}` : null,
    country: c.countryHint,
    city: c.cityHint,
    niche_id: guessNiche(c.detectedName, c.detectedName)?.id ?? null,
    raw_input: c.rawInput,
    import_input: asJson(c),
    import_key: importKeyOf(c),
    // Escolhida por ela. É isto que separa `USER_SELECTED` de `SYSTEM_FIT` em
    // todo o resto do sistema.
    user_selected: true,
    // Uma marca que ela escolheu não é resultado de exploração: entra salva.
    saved: true,
    saved_at: new Date().toISOString(),
    rank: i + 1,
    status: 'discovered',
    language: 'pt',
  }));

  const { error: erroLinhas } = await db.from('outreach_candidate').insert(rows);
  if (erroLinhas) {
    await db.from('outreach_run').update({ status: 'error', error: erroLinhas.message }).eq('id', run.id);
    return { ok: false, error: 'Não consegui salvar as marcas do lote.' };
  }

  return { ok: true, runId: run.id, total: rows.length, parsed, resumed: false };
}

/* ── Trabalhar o lote ────────────────────────────────────────────────────── */

/** Uma marca reclamada há mais de isto é uma marca cujo trabalhador morreu. */
const RECLAMACAO_PERDIDA_MS = 8 * 60_000;

export type ProcessResult = {
  runId: string;
  done: boolean;
  processed: number;
  total: number;
  failures: string[];
};

export async function processImportBatch(
  runId: string,
  opts: { deadline?: number } = {},
): Promise<ProcessResult> {
  const db = supabaseService();
  // A rota morre aos 300 s. Parar por decisão própria antes disso salva o que
  // já se fez e deixa o resto para a próxima entrada.
  const deadline = opts.deadline ?? Date.now() + 4.5 * 60 * 1000;
  const failures: string[] = [];

  const { data: run } = await db
    .from('outreach_run')
    .select('id, total, partial_failures')
    .eq('id', runId)
    .maybeSingle();
  if (!run) return { runId, done: true, processed: 0, total: 0, failures: ['Lote não encontrado.'] };

  // Reclamações perdidas voltam à fila. Sem isto, um trabalhador que morre a
  // meio deixa a marca presa em «a pesquisar» para sempre.
  await db
    .from('outreach_candidate')
    .update({ status: 'discovered' })
    .eq('run_id', runId)
    .eq('status', 'screened')
    .lt('updated_at', new Date(Date.now() - RECLAMACAO_PERDIDA_MS).toISOString());

  for (;;) {
    if (Date.now() > deadline) {
      failures.push('Faltou tempo; continuo no próximo passo.');
      break;
    }

    const item = await claimNext(runId);
    if (!item) break;

    try {
      await processOne(item);
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'Falha desconhecida.';
      failures.push(`${item.name}: ${motivo}`);
      await db
        .from('outreach_candidate')
        .update({ status: 'failed', resolution_note: motivo.slice(0, 300) })
        .eq('id', item.id);
    }

    await atualizarProgresso(runId, run.total);
  }

  const restantes = await pendentes(runId);
  const done = restantes === 0;
  const anteriores = ((run.partial_failures as string[] | null) ?? []).filter(
    (f) => f !== 'Faltou tempo; continuo no próximo passo.',
  );
  const todas = [...anteriores, ...failures];

  if (done) await fecharLote(runId, todas);
  else {
    await db
      .from('outreach_run')
      .update({ partial_failures: asJson(todas) })
      .eq('id', runId);
  }

  const processed = await processados(runId);
  return { runId, done, processed, total: run.total, failures: todas };
}

/* ── Uma marca ───────────────────────────────────────────────────────────── */

type Item = {
  id: string;
  run_id: string;
  name: string;
  website: string | null;
  domain: string | null;
  instagram: string | null;
  city: string | null;
  country: string | null;
  raw_input: string | null;
  import_input: ImportedBrandCandidate | null;
  niche_id: string | null;
};

/** Reclama a próxima marca por escrever no estado, e não em memória: dois
 *  trabalhadores a correr ao mesmo tempo não podem pesquisar a mesma marca
 *  duas vezes — é dinheiro pago duas vezes pela mesma resposta. */
async function claimNext(runId: string): Promise<Item | null> {
  const db = supabaseService();
  const { data: fila } = await db
    .from('outreach_candidate')
    .select('id')
    .eq('run_id', runId)
    .eq('status', 'discovered')
    .order('rank', { ascending: true })
    .limit(5);

  for (const linha of fila ?? []) {
    const { data: claimed } = await db
      .from('outreach_candidate')
      .update({ status: 'screened' })
      .eq('id', linha.id)
      .eq('status', 'discovered')
      .select('id, run_id, name, website, domain, instagram, city, country, raw_input, import_input, niche_id');
    if (claimed && claimed.length > 0) return claimed[0] as unknown as Item;
  }
  return null;
}

async function processOne(item: Item): Promise<void> {
  const db = supabaseService();
  const parsed = item.import_input;
  const hoje = new Date().toISOString();

  // ── 1. Identidade ───────────────────────────────────────────────────────
  const partida: Discovered = {
    name: item.name,
    normalizedName: normalizeName(item.name),
    website: item.website,
    domain: item.domain,
    country: item.country,
    description: '',
    why: '',
    source: item.raw_input,
    nicheId: item.niche_id,
  };

  const pistaHotelaria =
    familyFor([item.name, parsed?.rawInput ?? '', item.city ?? ''].join(' '))?.id === 'hospitality';

  let facts = await gatherFacts(partida, { identity: true, hospitality: pistaHotelaria });
  const identidade = await resolverIdentidade(item, parsed, facts);

  const nome = identidade?.official_name?.trim() || item.name;
  // Normalizar antes de comparar: a pesquisa devolve «https://www.x.pt/» e
  // «@quintadapacheca», o parse devolveu «x.pt» e «quintadapacheca». Se as duas
  // formas não coincidirem, a chave do lote não junta a mesma casa escrita de
  // duas maneiras — que é exatamente o que ela faz quando cola uma lista.
  const domain = normalizeDomain(identidade?.domain ?? identidade?.website) ?? item.domain;
  const website = identidade?.website ?? item.website ?? (domain ? `https://${domain}` : null);
  const instagram = normalizeHandle(identidade?.instagram) ?? item.instagram;
  const confianca = identidade?.confidence ?? 'low';
  const identityCertain = confianca === 'high' || (confianca === 'medium' && Boolean(domain || instagram));

  const categoria = identidade?.category ?? '';
  const hotelaria = pistaHotelaria || familyFor(`${categoria} ${nome}`)?.id === 'hospitality';

  const { error: erroIdentidade } = await db
    .from('outreach_candidate')
    .update({
      name: nome,
      normalized_name: normalizeName(nome) || item.name,
      website,
      domain,
      instagram,
      city: identidade?.city ?? item.city,
      country: identidade?.country ?? item.country,
      niche_id: guessNiche(categoria, nome)?.id ?? item.niche_id,
      identity_confidence: confianca,
      identity_evidence: asJson(identidade?.evidence ?? []),
      // A chave passa a ser a prova encontrada. O índice único do lote impede
      // que duas linhas diferentes — o nome numa, o @ da mesma casa noutra —
      // sobrevivam as duas.
      import_key: domain ? `domain:${domain}` : instagram ? `instagram:${instagram}` : `name:${normalizeName(nome)}`,
    })
    .eq('id', item.id);

  if (erroIdentidade) {
    // 23505: outra linha do mesmo lote já é esta marca. Não é falha — é a
    // deduplicação a funcionar depois de a identidade ser conhecida, que é o
    // único momento em que «Quinta da Pacheca» e o @ dela se sabem iguais.
    if (erroIdentidade.code !== '23505') throw new Error(erroIdentidade.message);
    await db
      .from('outreach_candidate')
      .update({
        status: 'skipped',
        resolution_note: `Esta linha era a mesma marca de outra da lista (${nome}).`,
      })
      .eq('id', item.id);
    return;
  }

  // ── 2. Deduplicação e histórico ─────────────────────────────────────────
  const dedup = await dedupFor({ name: nome, domain, website, instagram, identityCertain });
  const plano = planFor(dedup.resolution);

  await db
    .from('outreach_candidate')
    .update({
      resolution: dedup.resolution,
      resolution_note: dedup.note,
      resolution_evidence: asJson(dedup.lines),
      dedup_complete: dedup.dedupComplete,
      brand_id: dedup.brandId,
      opportunity_id: dedup.opportunityId,
    })
    .eq('id', item.id);

  if (plano === 'none') {
    await db
      .from('outreach_candidate')
      .update({
        // Identidade por confirmar é decisão dela, não lixo: fica à vista, com
        // as hipóteses que a pesquisa encontrou.
        status: dedup.resolution === 'IDENTITY_UNCERTAIN' ? 'needs_review' : 'researched',
        why_fit: dedup.note,
        researched_at: hoje,
        red_flags: asJson(
          identidade?.ambiguity?.length
            ? identidade.ambiguity.map((a) => `${a.name}: ${a.why}`)
            : [],
        ),
        sources: asJson(identidade?.evidence?.map((e) => ({ label: e.claim, url: e.url })) ?? []),
      })
      .eq('id', item.id);
    return;
  }

  // ── 3. Pesquisa, e o perfil da categoria ────────────────────────────────
  if (hotelaria && !pistaHotelaria) {
    // A primeira pesquisa não sabia que era hotelaria. Agora sabe.
    facts = `${facts}\n\n${await gatherFacts({ ...partida, name: nome, website }, { hospitality: true })}`;
  }

  const pesquisado = await researchCandidate(
    { ...partida, name: nome, normalizedName: normalizeName(nome), website, domain, description: identidade?.description ?? '' },
    { facts, hospitality: hotelaria },
  );
  if (!pesquisado) throw new Error('Não consegui pesquisar esta marca.');

  const r = pesquisado.research;

  // ── 4. Contato ──────────────────────────────────────────────────────────
  const escolha = chooseFromResearch(r.contact);
  const { checkEmail } = await import('./mailcheck-dns');
  const verificado = escolha.chosen
    ? await checkEmail(escolha.chosen.address, escolha.chosen.source ?? 'research').catch(() => null)
    : null;

  // ── 5. Avaliação comercial: descreve, nunca exclui ──────────────────────
  //     Ela escolheu a marca. O encaixe serve para ordenar e para lhe dizer o
  //     que espera do outro lado — não para vetar o que ela pediu.
  const fit = scoreBrandFit(r.fit_signals as FitSignals, { inFocus: true, focusLabel: categoria || undefined });
  const oportunidade = opportunityFor({
    paidMedia: r.paid_media_signal,
    ugc: r.ugc_signal,
    demonstrable: r.fit_signals?.demo_potential ?? null,
    creativeGap: r.fit_signals?.authentic_context ?? null,
    digitalPresence: r.fit_signals?.paid_maturity ?? null,
    reachable: Boolean(escolha.chosen || r.contact?.whatsapp || r.contact?.instagram),
    sameLanguage: true,
  });

  await db
    .from('outreach_candidate')
    .update({
      product: r.product,
      city: r.city?.trim() || identidade?.city || item.city,
      country: r.country ?? identidade?.country ?? item.country,
      socials: asJson(r.socials ?? {}),
      instagram: r.contact?.instagram ?? r.socials?.instagram ?? instagram,
      whatsapp: r.contact?.whatsapp ?? null,
      linkedin: r.socials?.linkedin ?? null,
      why_fit: r.why_fit,
      why_now: r.why_now,
      why_may_pay: r.why_may_pay,
      risk: r.risk,
      paid_media_signal: r.paid_media_signal,
      ugc_signal: r.ugc_signal,
      creative_opportunity: r.creative_opportunity,
      content_ideas: asJson(r.content_ideas),
      red_flags: asJson(r.red_flags),
      sources: asJson(r.sources),
      researched_at: hoje,
      fit_score: fit.score,
      fit_band: fit.band,
      fit_breakdown: asJson(fit.lines),
      ugc_opportunity: oportunidade.score,
      category_profile: asJson(pesquisado.hospitality),
      contact_name: r.contact?.name ?? null,
      contact_role: r.contact?.role ?? null,
      contact_email: escolha.chosen?.address ?? null,
      contact_email_options: asJson(escolha.alternatives),
      email_confidence: verificado?.confidence ?? r.contact?.confidence ?? 'unknown',
      contact_source: verificado
        ? `${r.contact?.source ?? 'pesquisa'} · ${verificado.reason}`
        : (r.contact?.source ?? null),
      status: 'researched',
    })
    .eq('id', item.id);

  // Sem endereço não há email para escrever. A marca fica pesquisada e à vista:
  // é dela a decisão de a abordar por outro canal.
  if (!escolha.chosen || (verificado && !verificado.valid)) return;

  // ── 6. Referências criativas e o conceito ───────────────────────────────
  const { referencesForCandidate } = await import('@/modules/references/service');
  const refs = await referencesForCandidate({
    candidateId: item.id,
    name: nome,
    product: r.product ?? '',
    category: categoria || item.niche_id || '',
    // Numa casa de hotelaria a pergunta é a experiência, não a instalação.
    angle: [
      r.creative_opportunity,
      pesquisado.hospitality?.content_experiences?.map((e) => e.experience).join('; ') ?? '',
    ]
      .filter(Boolean)
      .join(' — '),
  }).catch(() => ({ saved: 0, idea: false, error: 'falhou' }));

  // ── 7. O email ──────────────────────────────────────────────────────────
  const { latestStyleProfile } = await import('./style');
  const style = await latestStyleProfile('pt');
  const { writeOutreachEmail, writeReengagementEmail } = await import('./email');

  const escrito =
    plano === 'reengage'
      ? await writeReengagementEmail(
          { candidate: pesquisado.candidate, research: r },
          style,
          historyBrief(dedup),
        )
      : await writeOutreachEmail({ candidate: pesquisado.candidate, research: r }, style);

  if (!escrito) {
    await db
      .from('outreach_candidate')
      .update({ status: 'needs_review', resolution_note: `${dedup.note} O email não saiu; peça outra vez.` })
      .eq('id', item.id);
    return;
  }

  // ── 8. Porta de qualidade ───────────────────────────────────────────────
  const quality = scoreEmail({
    subject: escrito.subject,
    body: escrito.body,
    brandName: nome,
    product: r.product,
    claims: escrito.claims.map((c) => ({ text: c.text, sourceId: c.source })),
  });

  await db
    .from('outreach_candidate')
    .update({
      subject: escrito.subject,
      body: escrito.body,
      ai_subject: escrito.subject,
      ai_body: escrito.body,
      language: escrito.language,
      portfolio_match: asJson(escrito.portfolio),
      quality: asJson(quality),
      status: quality.pass ? 'ready' : 'needs_review',
      references_state: refs.saved > 0 ? 'done' : 'empty',
      references_at: hoje,
    })
    .eq('id', item.id);
}

async function resolverIdentidade(
  item: Item,
  parsed: ImportedBrandCandidate | null,
  facts: string,
) {
  const { runPrompt } = await import('@/modules/ai/gateway');
  const { resolveBrandIdentity } = await import('@/modules/ai/prompts/registry');

  const run = await runPrompt(
    resolveBrandIdentity,
    {
      raw: item.raw_input ?? item.name,
      name: item.name,
      domain: item.domain,
      instagram: item.instagram,
      tiktok: parsed?.detectedTiktok ?? null,
      linkedin: parsed?.detectedLinkedin ?? null,
      cityHint: item.city,
      countryHint: item.country,
      facts,
      today: new Date().toISOString().slice(0, 10),
    },
    { cache: true, entityType: 'outreach_candidate', entityId: item.id },
  );

  return run.ok ? run.output : null;
}

/* ── Contagens e fecho ───────────────────────────────────────────────────── */

const PENDENTES = '(discovered,screened)';

async function pendentes(runId: string): Promise<number> {
  const db = supabaseService();
  const { count } = await db
    .from('outreach_candidate')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId)
    .in('status', ['discovered', 'screened']);
  return count ?? 0;
}

async function processados(runId: string): Promise<number> {
  const db = supabaseService();
  const { count } = await db
    .from('outreach_candidate')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId)
    .not('status', 'in', PENDENTES);
  return count ?? 0;
}

async function atualizarProgresso(runId: string, total: number): Promise<void> {
  const db = supabaseService();
  const feitas = await processados(runId);
  await db
    .from('outreach_run')
    .update({ processed: Math.min(feitas, total), researched: feitas })
    .eq('id', runId);
}

async function fecharLote(runId: string, failures: string[]): Promise<void> {
  const db = supabaseService();
  const { resumo } = await lerLote(runId);

  await db
    .from('outreach_run')
    .update({
      status: failures.length ? 'partial' : 'success',
      processed: resumo.total,
      researched: resumo.total,
      selected: resumo.ready,
      partial_failures: asJson(failures),
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

/* ── O que a tela pergunta enquanto espera ───────────────────────────────── */

export type ImportProgress = {
  runId: string;
  status: string;
  total: number;
  processed: number;
  message: string;
  /** Uma linha por balde, só com os que têm marcas. */
  summary: ReturnType<typeof summarize> | null;
  /** Linhas que se revelaram a mesma marca de outra da lista. */
  duplicates: number;
};

export async function importProgress(runId: string): Promise<ImportProgress | null> {
  const db = supabaseService();
  const { data: run } = await db
    .from('outreach_run')
    .select('id, status, total, processed')
    .eq('id', runId)
    .eq('kind', 'imported')
    .maybeSingle();
  if (!run) return null;

  if (run.status === 'running') {
    return {
      runId, status: run.status, total: run.total, processed: run.processed,
      message: '', summary: null, duplicates: 0,
    };
  }

  const { resumo, duplicados } = await lerLote(runId);

  return {
    runId,
    status: run.status,
    total: run.total,
    processed: run.processed,
    message: summaryText(resumo, duplicados),
    summary: resumo,
    duplicates: duplicados,
  };
}

/** As marcas do lote, já sem as linhas repetidas.
 *
 *  Uma linha que se revelou ser a mesma marca de outra não é uma marca: contá-la
 *  daria «10 analisadas» quando só há nove empresas. Diz-se à parte. */
async function lerLote(runId: string) {
  const db = supabaseService();
  const { data: rows } = await db
    .from('outreach_candidate')
    .select('status, resolution, contact_email')
    .eq('run_id', runId);

  const todas = rows ?? [];
  const duplicados = todas.filter((r) => r.status === 'skipped').length;

  return {
    duplicados,
    resumo: summarize(
      todas
        .filter((r) => r.status !== 'skipped')
        .map((r) => ({ status: r.status, resolution: r.resolution, contactEmail: r.contact_email })),
    ),
  };
}

/** Os lotes que ficaram a meio.
 *
 *  A tela continua o lote enquanto ela a tiver aberta. Se fechar o browser com
 *  vinte e cinco marcas por pesquisar, é este trabalho que as acaba — e como
 *  cada marca é reclamada antes de ser trabalhada, retomar nunca repete uma
 *  pesquisa já paga. */
export async function continuePendingImports(): Promise<{
  batches: number;
  processed: number;
  failures: string[];
}> {
  const db = supabaseService();
  const { data: runs } = await db
    .from('outreach_run')
    .select('id')
    .eq('kind', 'imported')
    .eq('status', 'running')
    .order('started_at', { ascending: true })
    .limit(3);

  const failures: string[] = [];
  let processed = 0;
  const deadline = Date.now() + 4.5 * 60 * 1000;

  for (const run of runs ?? []) {
    if (Date.now() > deadline) break;
    const r = await processImportBatch(run.id, { deadline });
    processed += r.processed;
    failures.push(...r.failures);
  }

  return { batches: (runs ?? []).length, processed, failures };
}

export type { Resolution };
