import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { runPrompt } from '@/modules/ai/gateway';
import { aiSetup } from '@/modules/ai/provider';
import { readTrends } from '@/modules/ai/prompts/registry';
import { RESEARCH_MARKET } from '@/modules/creator/strategy';
import {
  dedupeTrends,
  shortlistForDeepAnalysis,
  trendFingerprint,
  trendFit,
  trendFreshness,
  trendProblems,
  type Trend,
} from './domain';

export * from './domain';

/** A descoberta de tendências.
 *
 *  Uma pesquisa por dia, não cem. O funil: descobrir candidatas com uma
 *  chamada de pesquisa, estruturar com uma chamada barata, deduplicar e tirar
 *  as velhas em código, e só depois calcular o encaixe — que também é código.
 *
 *  Nenhum vídeo vai a um modelo para ser «analisado a fundo» um a um. O que se
 *  analisa é o padrão, e o padrão vem do texto da pesquisa. */

export type TrendRunResult = {
  discovered: number;
  fresh: number;
  saved: number;
  usable: number;
  failures: string[];
};

/** Onde procurar. Não é só UGC: editores, social media, freelancers e
 *  profissionais criativos são a mesma audiência a fazer coisas diferentes. */
const SEARCHES = [
  'formatos de vídeo curto que estão bombando esta semana entre creators brasileiros no Instagram e TikTok',
  'padrões de edição, transições e templates de CapCut que os creators brasileiros estão usando agora',
  'ganchos e estruturas de história que estão segurando o watch time em Reels e TikTok no Brasil este mês',
];

export async function runTrendDiscovery(
  opts: { now?: Date; deadline?: number } = {},
): Promise<TrendRunResult> {
  const db = supabaseService();
  const now = opts.now ?? new Date();
  const deadline = opts.deadline ?? Date.now() + 4 * 60 * 1000;
  const failures: string[] = [];

  const setup = aiSetup();
  if (!setup.provider) {
    return { discovered: 0, fresh: 0, saved: 0, usable: 0, failures: ['A IA não está configurada.'] };
  }

  const profile = await readCreatorProfileRow();

  const prosas: string[] = [];
  for (const ask of SEARCHES) {
    if (Date.now() > deadline) {
      failures.push('Faltou tempo para todas as pesquisas de tendências.');
      break;
    }
    try {
      const prose = await setup.provider.search({
        model: setup.models.chat,
        system:
          'Você procura o que está funcionando AGORA em vídeo curto entre criadores BRASILEIROS. ' +
          RESEARCH_MARKET.instruction +
          ' Para cada coisa que encontrar, escreva o endereço de pelo menos um exemplo, quem publicou, ' +
          'a data se estiver visível, e por que parece estar subindo. ' +
          'Se não tem link para um exemplo, não escreva essa tendência. Não invente endereços.',
        user: [
          ask,
          '',
          `Hoje é ${now.toISOString().slice(0, 10)}. Interessa só o que é recente.`,
          `Mercado: ${RESEARCH_MARKET.primary}. Idioma: ${RESEARCH_MARKET.language}.`,
          profile.topics.length ? `Territórios dela: ${profile.topics.slice(0, 6).join(', ')}.` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        maxTokens: 3000,
      });
      if (prose.trim()) prosas.push(prose);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Uma pesquisa de tendências falhou.');
    }
  }

  if (prosas.length === 0) {
    return { discovered: 0, fresh: 0, saved: 0, usable: 0, failures: failures.length ? failures : ['A pesquisa não devolveu nada.'] };
  }

  const extracted = await runPrompt(
    readTrends,
    { prose: prosas.join('\n\n---\n\n'), today: now.toISOString().slice(0, 10) },
    { entityType: 'creator_trend' },
  );

  if (!extracted.ok) {
    return { discovered: 0, fresh: 0, saved: 0, usable: 0, failures: [...failures, extracted.message] };
  }

  const candidatas: Trend[] = extracted.output.trends.map((t) => ({
    title: t.title,
    kind: t.kind,
    platform: t.platform,
    description: t.description,
    whyTrending: t.why_trending,
    evidence: t.evidence.map((e) => ({ url: e.url, note: e.note ?? undefined })),
    publishedAt: t.published_at,
    detectedAt: now.toISOString(),
  }));

  const comProva = candidatas.filter((t) => trendProblems(t).length === 0);
  const semRepetidas = dedupeTrends(comProva);
  const frescas = shortlistForDeepAnalysis(semRepetidas, { max: 15, now });

  let saved = 0;
  let usable = 0;

  for (const t of frescas) {
    const fit = trendFit({
      trend: t,
      topics: profile.topics,
      avoidedFormats: profile.avoidedFormats,
      talkingHeadTolerance: profile.talkingHeadTolerance,
      editingComplexity: profile.editingComplexity,
      now,
    });

    const { error } = await db.from('creator_trend').upsert(
      {
        platform: t.platform,
        title: t.title,
        kind: t.kind,
        description: t.description,
        why_trending: t.whyTrending,
        evidence: asJson(t.evidence),
        source_url: t.evidence[0]?.url ?? null,
        published_at: t.publishedAt,
        detected_at: now.toISOString(),
        freshness: trendFreshness(t.publishedAt ?? t.detectedAt, now),
        fit_score: fit.score,
        fit_reason: fit.reason,
        fit_verdict: fit.verdict,
        adaptation: '',
        fingerprint: trendFingerprint(t),
      },
      { onConflict: 'fingerprint' },
    );

    if (!error) {
      saved++;
      if (fit.verdict !== 'skip') usable++;
    }
  }

  if (comProva.length < candidatas.length) {
    failures.push(
      `Deixei ${candidatas.length - comProva.length} tendências de fora por não trazerem prova clicável.`,
    );
  }

  return { discovered: candidatas.length, fresh: frescas.length, saved, usable, failures };
}

type ProfileBits = {
  topics: string[];
  avoidedFormats: string[];
  talkingHeadTolerance: number | null;
  editingComplexity: number | null;
};

async function readCreatorProfileRow(): Promise<ProfileBits> {
  const db = supabaseService();
  const { data } = await db
    .from('creator_profile')
    .select('topics, avoided_formats, dimensions')
    .limit(1)
    .maybeSingle();

  const dims = (data?.dimensions ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : null);

  return {
    topics: ((data?.topics ?? []) as string[]) ?? [],
    avoidedFormats: ((data?.avoided_formats ?? []) as string[]) ?? [],
    talkingHeadTolerance: num(dims.talking_head_tolerance),
    editingComplexity: num(dims.editing_complexity),
  };
}

export type TrendRow = {
  id: string;
  title: string;
  platform: string;
  kind: string;
  description: string;
  whyTrending: string;
  sourceUrl: string | null;
  evidence: { url: string; note?: string }[];
  freshness: string;
  fitVerdict: 'adopt' | 'adapt' | 'skip';
  fitReason: string;
  detectedAt: string;
};

/** As que interessam a ela. As `skip` ficam guardadas — é assim que se sabe
 *  que a pesquisa correu e devolveu coisas que não serviam. */
export async function usableTrends(limit = 6): Promise<TrendRow[]> {
  const db = supabaseService();
  const { data } = await db
    .from('creator_trend')
    .select('id, title, platform, kind, description, why_trending, source_url, evidence, freshness, fit_verdict, fit_reason, detected_at')
    .neq('fit_verdict', 'skip')
    .in('freshness', ['fresh', 'recent'])
    .order('fit_score', { ascending: false })
    .limit(limit);

  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    platform: t.platform,
    kind: t.kind,
    description: t.description,
    whyTrending: t.why_trending,
    sourceUrl: t.source_url,
    evidence: (t.evidence ?? []) as { url: string; note?: string }[],
    freshness: t.freshness,
    fitVerdict: t.fit_verdict as TrendRow['fitVerdict'],
    fitReason: t.fit_reason,
    detectedAt: t.detected_at,
  }));
}

export async function trendsById(ids: readonly string[]): Promise<TrendRow[]> {
  if (ids.length === 0) return [];
  const db = supabaseService();
  const { data } = await db
    .from('creator_trend')
    .select('id, title, platform, kind, description, why_trending, source_url, evidence, freshness, fit_verdict, fit_reason, detected_at')
    .in('id', ids as string[]);

  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    platform: t.platform,
    kind: t.kind,
    description: t.description,
    whyTrending: t.why_trending,
    sourceUrl: t.source_url,
    evidence: (t.evidence ?? []) as { url: string; note?: string }[],
    freshness: t.freshness,
    fitVerdict: t.fit_verdict as TrendRow['fitVerdict'],
    fitReason: t.fit_reason,
    detectedAt: t.detected_at,
  }));
}
