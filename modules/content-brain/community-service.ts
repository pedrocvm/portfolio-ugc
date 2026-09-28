/** Qualidade de comunidade: classificar comentários e ler o conjunto.
 *
 *  O prompt de classificação existia desde 04/09 e nunca era chamado por
 *  ninguém. Isto é o que faltava: o trabalho que o corre, e a leitura agregada
 *  que a Auditoria mostra.
 *
 *  Duas coisas que o serviço nunca faz: não guarda nada sobre a pessoa que
 *  comentou além do que a API já devolveu, e não apresenta a intenção de um
 *  comentário como facto. A unidade de leitura é o conjunto.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { strategyClient, type StrategyClient } from '@/lib/supabase/strategy';
import { runPrompt } from '@/modules/ai/gateway';
import {
  INTENT_LABEL,
  aggregateIntents,
  isIntent,
  type CommentInput,
  type CommunityAggregate,
  type Intent,
} from './community';
import { classifyComments } from './prompts';

const client = async (c?: StrategyClient): Promise<StrategyClient> =>
  c ?? strategyClient(await supabaseServer());

/** Quantos comentários por chamada. Lotes pequenos porque uma falha no lote
 *  não pode levar os outros — e porque o `fast` tem limite de saída. */
const BATCH = 25;

export type ClassifyReport = { classified: number; batches: number; failures: string[] };

/** Classifica o que ainda não foi classificado. Idempotente: só toca linhas
 *  com `quality` nulo, e uma falha num lote não interrompe os seguintes. */
export async function classifyPendingComments(
  opts: { db?: StrategyClient; limit?: number } = {},
): Promise<ClassifyReport> {
  const db = opts.db ?? strategyClient(supabaseService());
  const failures: string[] = [];

  const { data: pendentes } = await db
    .from('instagram_comment')
    .select('id, text')
    .is('quality', null)
    .not('text', 'eq', '')
    .order('commented_at', { ascending: false })
    .limit(opts.limit ?? 100);

  const lista = pendentes ?? [];
  let classified = 0;
  let batches = 0;

  for (let i = 0; i < lista.length; i += BATCH) {
    const lote = lista.slice(i, i + BATCH);
    batches += 1;

    const r = await runPrompt(
      classifyComments,
      { comments: lote.map((c) => `[${c.id}] ${c.text.slice(0, 300)}`).join('\n') },
      { entityType: 'instagram_comment' },
    );
    if (!r.ok) {
      failures.push(`lote ${batches}: ${r.message}`);
      continue;
    }

    const agora = new Date().toISOString();
    for (const item of r.output.items) {
      if (!lote.some((c) => c.id === item.id)) continue;
      if (!isIntent(item.quality)) continue;
      const { error } = await db
        .from('instagram_comment')
        .update({
          quality: item.quality,
          quality_confidence: item.confidence,
          classified_at: agora,
          ai_run_id: r.runId,
        })
        .eq('id', item.id);
      if (error) failures.push(`comentário ${item.id}: ${error.message}`);
      else classified += 1;
    }
  }

  return { classified, batches, failures };
}

/* ── Leitura agregada ─────────────────────────────────────────────────────── */

export type CommunityView = CommunityAggregate & {
  mediaId: string | null;
  /** Ordenado, só o que aparece. A tela não mostra doze zeros. */
  breakdown: { intent: Intent; label: string; count: number }[];
};

const toView = (mediaId: string | null, agg: CommunityAggregate): CommunityView => ({
  ...agg,
  mediaId,
  breakdown: (Object.entries(agg.counts) as [Intent, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([intent, count]) => ({ intent, label: INTENT_LABEL[intent], count })),
});

const rows = (data: readonly { id: string; quality: string | null; quality_confidence: string | null }[]): CommentInput[] =>
  data.map((c) => ({
    id: c.id,
    intent: isIntent(c.quality) ? c.quality : null,
    confidence: (c.quality_confidence as CommentInput['confidence']) ?? null,
  }));

export async function communityFor(mediaId: string, c?: StrategyClient): Promise<CommunityView> {
  const db = await client(c);
  const { data } = await db
    .from('instagram_comment')
    .select('id, quality, quality_confidence')
    .eq('media_id', mediaId);
  return toView(mediaId, aggregateIntents(rows(data ?? [])));
}

/** A leitura de várias peças numa consulta só.
 *
 *  Chamar `communityFor` em ciclo é uma consulta por peça, e a Auditoria lê
 *  trinta de uma vez. Uma peça sem comentários entra no mapa com a leitura
 *  vazia, para quem chama não ter de distinguir «sem comentários» de «não
 *  perguntei». */
export async function communityForMany(
  mediaIds: readonly string[],
  c?: StrategyClient,
): Promise<Map<string, CommunityView>> {
  const out = new Map<string, CommunityView>();
  if (mediaIds.length === 0) return out;

  const db = await client(c);
  const { data } = await db
    .from('instagram_comment')
    .select('id, media_id, quality, quality_confidence')
    .in('media_id', [...mediaIds]);

  const porMidia = new Map<string, CommentInput[]>();
  for (const comentario of data ?? []) {
    const lista = porMidia.get(comentario.media_id) ?? [];
    lista.push(rows([comentario])[0]);
    porMidia.set(comentario.media_id, lista);
  }

  for (const id of mediaIds) out.set(id, toView(id, aggregateIntents(porMidia.get(id) ?? [])));
  return out;
}

/** A leitura de uma janela. É a que a Auditoria mostra: o perfil, não a peça. */
export async function communityWindow(
  opts: { db?: StrategyClient; days?: number } = {},
): Promise<CommunityView> {
  const db = await client(opts.db);
  const desde = new Date(Date.now() - (opts.days ?? 30) * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from('instagram_comment')
    .select('id, quality, quality_confidence')
    .gte('commented_at', desde);
  return toView(null, aggregateIntents(rows(data ?? [])));
}

/** Grava a leitura por peça. Idempotente pela chave natural: correr duas vezes
 *  no mesmo dia atualiza a mesma linha em vez de duplicar. */
export async function persistInteractionInsights(
  opts: { db?: StrategyClient; days?: number } = {},
): Promise<{ written: number; failures: string[] }> {
  const db = opts.db ?? strategyClient(supabaseService());
  const failures: string[] = [];

  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (!me) return { written: 0, failures: ['Não encontrei o usuário.'] };

  const days = opts.days ?? 30;
  const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: medias } = await db
    .from('instagram_media')
    .select('id')
    .gte('published_at', desde)
    .order('published_at', { ascending: false })
    .limit(60);

  const dia = new Date().toISOString().slice(0, 10);
  const leituras = await communityForMany((medias ?? []).map((m) => m.id), db);
  let written = 0;

  for (const m of medias ?? []) {
    // Uma peça que falhe não leva o lote: o trabalho tem de ser idempotente e
    // resistente, e uma média sem comentários é caso normal, não erro.
    try {
      const view = leituras.get(m.id);
      if (!view || view.total === 0) continue;
      const { error } = await db.from('content_interaction_insight').upsert(
        {
          app_user_id: me.id,
          media_id: m.id,
          window_from: desde,
          window_to: new Date().toISOString(),
          counts: asJson(view.counts),
          total: view.total,
          classified: view.classified,
          unclassified: view.unclassified,
          reading: view.reading,
          dedupe_key: `media:${m.id}:${dia}`,
        },
        { onConflict: 'dedupe_key' },
      );
      if (error) failures.push(`${m.id}: ${error.message}`);
      else written += 1;
    } catch (e) {
      failures.push(`${m.id}: ${e instanceof Error ? e.message : 'falhou'}`);
    }
  }

  return { written, failures };
}
