import 'server-only';

import { hashContent } from '@/lib/crypto';
import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { runPrompt } from '@/modules/ai/gateway';
import { aiSetup } from '@/modules/ai/provider';
import { brandCreativeIdea, findBrandReferences } from '@/modules/ai/prompts/registry';
import {
  asDate,
  dedupeReferences,
  freshnessOf,
  isReferencePlatform,
  normalizeReferenceUrl,
  rankReferences,
  referenceProblems,
  type Reference,
  type ReferenceLink,
} from './domain';

export * from './domain';

/** O Creative Reference Pack.
 *
 *  Para cada marca que chega a «pronta para abordagem», o CarolOS vai procurar
 *  dois a três vídeos reais que respondam a uma pergunta só: o que é que a
 *  Carol podia gravar para esta marca?
 *
 *  As referências servem sobretudo por dentro. Não vão para o cold email —
 *  mandar links de concorrentes a uma marca é uma forma rápida de não ter
 *  resposta. O que vai para o email é uma ideia melhor por causa delas.
 *
 *  Funil de custo: procurar é uma chamada de pesquisa por marca, estruturar é
 *  uma chamada barata, e a ideia pronta é uma chamada cara — só para quem tem
 *  referências utilizáveis. */

export type ReferenceRunResult = {
  candidates: number;
  withReferences: number;
  references: number;
  ideas: number;
  failures: string[];
};

/** Quantas marcas por corrida. A prospecção traz 5-10; isto acompanha. */
const MAX_CANDIDATES = 10;

export async function runReferencePass(
  opts: { limit?: number; deadline?: number } = {},
): Promise<ReferenceRunResult> {
  const db = supabaseService();
  const limit = opts.limit ?? MAX_CANDIDATES;
  const deadline = opts.deadline ?? Date.now() + 4.5 * 60 * 1000;
  const failures: string[] = [];

  const setup = aiSetup();
  if (!setup.provider) {
    return {
      candidates: 0,
      withReferences: 0,
      references: 0,
      ideas: 0,
      failures: ['A IA não está configurada, por isso não há como procurar referências.'],
    };
  }

  // Só quem chegou ao ponto de valer a pena. Uma candidata abaixo do corte não
  // gasta uma pesquisa.
  const { data: candidates } = await db
    .from('outreach_candidate')
    .select('id, name, product, niche_id, creative_opportunity, why_fit, status, references_state')
    .in('status', ['ready', 'needs_review'])
    .eq('references_state', 'pending')
    .order('rank', { ascending: true })
    .limit(limit);

  const rows = candidates ?? [];
  if (rows.length === 0) {
    return { candidates: 0, withReferences: 0, references: 0, ideas: 0, failures: [] };
  }

  let withReferences = 0;
  let total = 0;
  let ideas = 0;

  for (const c of rows) {
    if (Date.now() > deadline) {
      failures.push(`Faltou tempo: parei depois de ${withReferences} marcas.`);
      break;
    }

    const result = await referencesForCandidate({
      candidateId: c.id,
      name: c.name,
      product: c.product ?? '',
      category: c.niche_id ?? '',
      angle: c.creative_opportunity ?? c.why_fit ?? '',
    });

    if (result.error) {
      failures.push(`${c.name}: ${result.error}`);
      await db
        .from('outreach_candidate')
        .update({
          references_state: 'failed',
          references_at: new Date().toISOString(),
          references_note: result.error.slice(0, 300),
        })
        .eq('id', c.id);
      continue;
    }

    total += result.saved;
    if (result.saved > 0) {
      withReferences++;
      if (result.idea) ideas++;
    }
  }

  return { candidates: rows.length, withReferences, references: total, ideas, failures };
}

export type CandidateReferenceResult = {
  saved: number;
  idea: boolean;
  error: string | null;
};

/** Procura, analisa, ordena, guarda — e transforma numa ideia gravável. */
export async function referencesForCandidate(input: {
  candidateId: string;
  name: string;
  product: string;
  category: string;
  angle: string;
}): Promise<CandidateReferenceResult> {
  const db = supabaseService();
  const setup = aiSetup();
  if (!setup.provider) return { saved: 0, idea: false, error: 'A IA não está configurada.' };

  // ── 1. Procurar. Uma chamada de pesquisa, com o alvo bem estreito ───────
  let prose = '';
  try {
    prose = await setup.provider.search({
      model: setup.models.chat,
      system:
        'Procuras vídeos curtos REAIS que sirvam de referência criativa a uma criadora de UGC. ' +
        'Interessam Reels do Instagram, vídeos do TikTok, YouTube Shorts, criativos da biblioteca ' +
        'de anúncios da Meta e do TikTok Creative Center. ' +
        'Para cada vídeo que encontrares escreve: o endereço exacto, quem o publicou, a data se ' +
        'estiver visível, quanto dura, como começa (o gancho), a estrutura, o estilo de edição, e ' +
        'os números que estiverem à vista. ' +
        'NUNCA inventes um endereço. Se não tens o link, não escrevas o vídeo.',
      user: [
        `Marca: ${input.name}.`,
        input.product ? `Produto: ${input.product}.` : '',
        input.category ? `Categoria: ${input.category}.` : '',
        input.angle ? `Ângulo criativo já detectado: ${input.angle}` : '',
        '',
        'Procura vídeos que ajudem a responder a «o que é que eu gravaria para esta marca?».',
        'Podem ser de concorrentes, de creators, anúncios a correr, conteúdo da própria marca,',
        'ou um formato de outro segmento que se adapte.',
        'Prefere vídeos dos últimos três meses. Prefere coisas que uma pessoa sozinha consiga',
        'gravar em casa com telemóvel e tripé — não produções com equipa.',
      ]
        .filter(Boolean)
        .join('\n'),
      maxTokens: 3500,
    });
  } catch (error) {
    return { saved: 0, idea: false, error: error instanceof Error ? error.message : 'A pesquisa falhou.' };
  }

  if (!prose.trim()) {
    await db
      .from('outreach_candidate')
      .update({
        references_state: 'empty',
        references_at: new Date().toISOString(),
        references_note: 'A pesquisa não devolveu vídeos com endereço.',
      })
      .eq('id', input.candidateId);
    return { saved: 0, idea: false, error: null };
  }

  // ── 2. Estruturar. Barato, e é aqui que a análise ganha forma ───────────
  const extracted = await runPrompt(
    findBrandReferences,
    { brand: input.name, product: input.product, category: input.category, angle: input.angle, prose },
    { entityType: 'outreach_candidate', entityId: input.candidateId, cache: true },
  );

  if (!extracted.ok) return { saved: 0, idea: false, error: extracted.message };

  const shaped = dedupeReferences(
    extracted.output.references.map((r) => ({
      sourceUrl: (r.source_url ?? '').trim(),
      ref: {
        sourceUrl: (r.source_url ?? '').trim(),
        platform: isReferencePlatform(r.platform) ? r.platform : 'other',
        title: r.title,
        hook: r.hook,
        structure: r.structure,
        editingStyle: r.editing_style,
        whyItWorks: r.why_it_works,
        format: r.format,
        // O modelo devolve datas em prosa. O que não for legível é `null`.
        publishedAt: asDate(r.published_at),
        durationSeconds: r.duration_seconds,
        creatorHandle: r.creator_handle,
        brandName: r.brand_name,
        signals: r.signals,
        sourceConfidence: r.source_confidence,
      } satisfies Reference,
      link: {
        fitReason: r.why_it_matches,
        adaptation: r.adaptation,
        doNotCopy: r.do_not_copy,
      } satisfies ReferenceLink,
    })),
  );

  const rejeitadas = shaped.filter((s) => referenceProblems(s.ref).length > 0).length;
  const top = rankReferences(shaped, { max: 3 });

  if (top.length === 0) {
    await db
      .from('outreach_candidate')
      .update({
        references_state: 'empty',
        references_at: new Date().toISOString(),
        references_note: rejeitadas
          ? `Encontrei ${rejeitadas} vídeos mas nenhum tinha endereço e análise suficientes.`
          : 'Não encontrei referências utilizáveis para esta marca.',
      })
      .eq('id', input.candidateId);
    return { saved: 0, idea: false, error: null };
  }

  // ── 3. Guardar ──────────────────────────────────────────────────────────
  let saved = 0;
  const problemas: string[] = [];
  const guardadas: { ref: Reference; link: ReferenceLink }[] = [];

  for (const [i, item] of top.entries()) {
    const url = normalizeReferenceUrl(item.ref.sourceUrl);
    const urlHash = await hashContent(url);

    // O erro é lido, não ignorado. O cliente do Supabase devolve em vez de
    // lançar, e na primeira corrida real três referências analisadas
    // desapareceram entre a análise e a tela sem deixar rasto — porque uma data
    // em prosa fazia o INSERT falhar e ninguém olhava para o resultado.
    const { data: reference, error: refError } = await db
      .from('creative_reference')
      .upsert(
        {
          source_platform: item.ref.platform,
          source_url: item.ref.sourceUrl,
          url_hash: urlHash,
          creator_handle: item.ref.creatorHandle,
          brand_name: item.ref.brandName,
          title: item.ref.title,
          published_at: item.ref.publishedAt,
          content_type: item.ref.format,
          format: item.ref.format,
          hook: item.ref.hook,
          duration_seconds: item.ref.durationSeconds,
          structure: item.ref.structure,
          editing_style: item.ref.editingStyle,
          why_it_works: item.ref.whyItWorks,
          signals: asJson(item.ref.signals),
          freshness: freshnessOf(item.ref.publishedAt),
          source_confidence: item.ref.sourceConfidence,
          purpose: 'brand',
          ai_run_id: extracted.runId,
        },
        { onConflict: 'url_hash' },
      )
      .select('id')
      .maybeSingle();

    if (refError || !reference) {
      problemas.push(refError?.message ?? 'a base recusou a referência sem dizer porquê');
      continue;
    }

    const { error: linkError } = await db.from('candidate_reference').upsert(
      {
        outreach_candidate_id: input.candidateId,
        creative_reference_id: reference.id,
        rank: i + 1,
        fit_reason: item.link.fitReason,
        adaptation: item.link.adaptation,
        do_not_copy: item.link.doNotCopy,
      },
      { onConflict: 'outreach_candidate_id,creative_reference_id' },
    );

    if (linkError) {
      problemas.push(linkError.message);
      continue;
    }

    saved++;
    guardadas.push({ ref: item.ref, link: item.link });
  }

  // Guardar zero depois de analisar três não é «não encontrei»: é uma falha, e
  // tem de se ver na tela com o motivo.
  if (saved === 0) {
    await db
      .from('outreach_candidate')
      .update({
        references_state: 'failed',
        references_at: new Date().toISOString(),
        references_note: `Analisei ${top.length} mas não consegui guardar nenhuma: ${problemas[0] ?? 'motivo desconhecido'}`.slice(0, 300),
      })
      .eq('id', input.candidateId);
    return { saved: 0, idea: false, error: problemas[0] ?? 'Não consegui guardar as referências.' };
  }

  // ── 4. Da referência para o que ela grava ───────────────────────────────
  const idea = await readyIdeaFor(input, guardadas);

  await db
    .from('outreach_candidate')
    .update({
      references_state: 'done',
      references_at: new Date().toISOString(),
      references_note:
        [
          rejeitadas ? `Deixei ${rejeitadas} de fora por não terem endereço ou análise.` : '',
          problemas.length ? `${problemas.length} não entraram: ${problemas[0]}` : '',
        ]
          .filter(Boolean)
          .join(' ')
          .slice(0, 300) || null,
      creative_angle: idea?.creative_angle ?? null,
      ready_idea: idea ? asJson(idea) : null,
    })
    .eq('id', input.candidateId);

  return { saved, idea: Boolean(idea), error: null };
}

/** A ideia pronta a gravar, a partir das referências guardadas. */
async function readyIdeaFor(
  input: { candidateId: string; name: string; product: string },
  refs: readonly { ref: Reference; link: ReferenceLink }[],
) {
  if (refs.length === 0) return null;

  const { styleProfileFresh } = await import('@/modules/outreach/style');
  const style = await styleProfileFresh('pt');

  const descricao = refs
    .map(
      (r, i) =>
        [
          `${i + 1}. ${r.ref.title} (${r.ref.platform}) — ${r.ref.sourceUrl}`,
          `   Gancho: ${r.ref.hook}`,
          `   Estrutura: ${r.ref.structure}`,
          `   Edição: ${r.ref.editingStyle}`,
          `   Porque funciona: ${r.ref.whyItWorks}`,
          `   Porque encaixa nesta marca: ${r.link.fitReason}`,
          `   Adaptação sugerida: ${r.link.adaptation}`,
          `   O que NÃO copiar: ${r.link.doNotCopy}`,
        ].join('\n'),
    )
    .join('\n\n');

  const run = await runPrompt(
    brandCreativeIdea,
    {
      brand: input.name,
      product: input.product,
      angle: refs[0]?.link.adaptation ?? '',
      references: descricao,
      style: style ? JSON.stringify(style.observed ?? style.measured) : '(sem perfil de voz)',
    },
    { entityType: 'outreach_candidate', entityId: input.candidateId },
  );

  return run.ok ? run.output : null;
}

/* ── Leituras ─────────────────────────────────────────────────────────────── */

export type BrandReference = {
  id: string;
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
  rank: number;
};

export async function referencesFor(candidateId: string): Promise<BrandReference[]> {
  const db = supabaseService();
  const { data } = await db
    .from('candidate_reference')
    .select(
      'rank, fit_reason, adaptation, do_not_copy, reference:creative_reference_id ( id, source_platform, source_url, title, creator_handle, published_at, freshness, hook, structure, editing_style, why_it_works )',
    )
    .eq('outreach_candidate_id', candidateId)
    .order('rank', { ascending: true });

  type Row = {
    rank: number;
    fit_reason: string;
    adaptation: string;
    do_not_copy: string;
    reference:
      | {
          id: string;
          source_platform: string;
          source_url: string;
          title: string;
          creator_handle: string | null;
          published_at: string | null;
          freshness: string;
          hook: string;
          structure: string;
          editing_style: string;
          why_it_works: string;
        }
      | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.reference)
    .map((r) => ({
      id: r.reference!.id,
      platform: r.reference!.source_platform,
      url: r.reference!.source_url,
      title: r.reference!.title,
      creatorHandle: r.reference!.creator_handle,
      publishedAt: r.reference!.published_at,
      freshness: r.reference!.freshness,
      hook: r.reference!.hook,
      structure: r.reference!.structure,
      editingStyle: r.reference!.editing_style,
      whyItWorks: r.reference!.why_it_works,
      fitReason: r.fit_reason,
      adaptation: r.adaptation,
      doNotCopy: r.do_not_copy,
      rank: r.rank,
    }));
}

export async function referenceCountsByCandidate(
  candidateIds: readonly string[],
): Promise<Map<string, number>> {
  if (candidateIds.length === 0) return new Map();
  const db = supabaseService();
  const { data } = await db
    .from('candidate_reference')
    .select('outreach_candidate_id')
    .in('outreach_candidate_id', candidateIds as string[]);

  const out = new Map<string, number>();
  for (const r of data ?? []) {
    out.set(r.outreach_candidate_id, (out.get(r.outreach_candidate_id) ?? 0) + 1);
  }
  return out;
}
