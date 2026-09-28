/** Reconciliar o que já existe com o domínio editorial novo.
 *
 *  A regra que governa o ficheiro: **desconhecido fica desconhecido**. Uma
 *  peça antiga não ganha pilar por palpite, e um objetivo só nasce de um
 *  mapeamento defensável — não de «parece que era para atrair».
 *
 *  O que se classifica fica marcado como `inferred`. A tela nunca mostra um
 *  palpite como se fosse escolha dela, e ela pode corrigir.
 *
 *  Idempotente: só toca linhas onde a coluna ainda está vazia. Corre quantas
 *  vezes quiser, e uma peça que falhe não leva as outras.
 *
 *  Server-only. */

import 'server-only';

import { supabaseService } from '@/lib/supabase/service';
import { strategyClient, type StrategyClient } from '@/lib/supabase/strategy';
import {
  LEGACY_PILLAR_TO_OBJECTIVE,
  inferLens,
  isPillar,
  pillarFromTerritories,
  type Lens,
  type Pillar,
} from './editorial';
import { dnaFromMedia } from './format-dna';
import type { FunctionalPillar } from './pillars';

export type BackfillReport = {
  dna: number;
  ideas: number;
  stories: number;
  unknown: number;
  failures: string[];
};

export async function backfillContentStrategy(
  opts: { db?: StrategyClient } = {},
): Promise<BackfillReport> {
  const db = opts.db ?? strategyClient(supabaseService());
  const failures: string[] = [];

  const [dna, ideas, stories] = await Promise.all([
    backfillMediaDna(db).catch((e) => {
      failures.push(`assinaturas: ${msg(e)}`);
      return { written: 0, unknown: 0 };
    }),
    backfillIdeas(db).catch((e) => {
      failures.push(`peças: ${msg(e)}`);
      return { written: 0, unknown: 0 };
    }),
    backfillStories(db).catch((e) => {
      failures.push(`histórias: ${msg(e)}`);
      return { written: 0, unknown: 0 };
    }),
  ]);

  return {
    dna: dna.written,
    ideas: ideas.written,
    stories: stories.written,
    unknown: dna.unknown + ideas.unknown + stories.unknown,
    failures,
  };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'falhou');

/** Assinatura das peças já publicadas.
 *
 *  Só o formato sai daqui com confiança: o tipo de mídia é um facto da API. O
 *  resto fica nulo, e é por isso que a fonte é `inferred` e a confiança é
 *  baixa — sem pack, ninguém sabe qual era a abertura. */
async function backfillMediaDna(db: StrategyClient): Promise<{ written: number; unknown: number }> {
  const { data: existentes } = await db
    .from('content_format_dna')
    .select('media_id')
    .not('media_id', 'is', null);
  const jaTem = new Set((existentes ?? []).map((d) => d.media_id));

  const { data: medias } = await db
    .from('instagram_media')
    .select('id, media_type, media_product_type, caption')
    .order('published_at', { ascending: false })
    .limit(400);

  const novos = (medias ?? []).filter((m) => !jaTem.has(m.id));
  let written = 0;
  let unknown = 0;

  for (const m of novos) {
    const dna = dnaFromMedia({
      mediaType: m.media_type,
      mediaProductType: m.media_product_type,
      caption: m.caption ?? '',
    });
    if (!dna.format) {
      unknown += 1;
      continue;
    }
    const { error } = await db.from('content_format_dna').insert({
      media_id: m.id,
      format: dna.format,
      duration_band: dna.durationBand,
      source: 'inferred',
      confidence: 'low',
    });
    if (!error) written += 1;
  }

  return { written, unknown };
}

/** Classificação editorial das peças que já existiam.
 *
 *  Objetivo vem do pilar funcional antigo, que era função. Pilar vem dos
 *  territórios, e só quando eles apontam para um só. Lente infere-se do
 *  título e do gancho, e só entra acima de confiança baixa. */
async function backfillIdeas(db: StrategyClient): Promise<{ written: number; unknown: number }> {
  const { data } = await db
    .from('creator_content_idea')
    .select('id, title, hook, functional_pillar, territories, pillar_slug, editorial_objective, content_lens, lifecycle')
    .eq('lifecycle', 'active')
    .is('editorial_objective', null)
    .limit(300);

  let written = 0;
  let unknown = 0;

  for (const i of data ?? []) {
    const objective = i.functional_pillar
      ? LEGACY_PILLAR_TO_OBJECTIVE[i.functional_pillar as FunctionalPillar]
      : undefined;
    const pillar = pillarFromTerritories(i.territories ?? []);
    const lens = guessLens(pillar, `${i.title ?? ''} ${i.hook ?? ''}`);

    if (!objective && !pillar && !lens) {
      unknown += 1;
      continue;
    }

    const { error } = await db
      .from('creator_content_idea')
      .update({
        editorial_objective: objective ?? null,
        pillar_slug: pillar ?? null,
        content_lens: lens ?? null,
        classification_source: 'inferred',
      })
      .eq('id', i.id);
    if (!error) written += 1;
  }

  return { written, unknown };
}

async function backfillStories(db: StrategyClient): Promise<{ written: number; unknown: number }> {
  const { data } = await db
    .from('creator_story')
    .select('id, territories, pillar_slug')
    .is('pillar_slug', null)
    .limit(300);

  let written = 0;
  let unknown = 0;

  for (const s of data ?? []) {
    const pillar = pillarFromTerritories(s.territories ?? []);
    if (!pillar) {
      unknown += 1;
      continue;
    }
    const { error } = await db.from('creator_story').update({ pillar_slug: pillar }).eq('id', s.id);
    if (!error) written += 1;
  }

  return { written, unknown };
}

function guessLens(pillar: Pillar | null, text: string): Lens | null {
  if (!pillar || !isPillar(pillar)) return null;
  const g = inferLens({ pillar, angle: text });
  // Confiança baixa não entra. Entre um palpite fraco e nada, nada é melhor:
  // a tela consegue dizer «ainda não classificado», e não consegue desfazer
  // uma classificação errada que ela nunca viu acontecer.
  return g && g.confidence !== 'low' ? g.lens : null;
}
