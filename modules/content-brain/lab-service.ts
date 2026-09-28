/** O Laboratório: referências, Radar e maturidade de formato.
 *
 *  Existe para responder o que a Carol ainda não sabe. Hoje há evidência
 *  insuficiente fora de Reels, e isso é baseline de uso — não prova de que
 *  Reel seja o melhor recipiente. A regra que governa este ficheiro inteiro é
 *  «ausência de alternativa não é validação».
 *
 *  Sobre referências: o que existe no projeto para olhar conteúdo público é a
 *  pesquisa do fornecedor de IA, e é essa que se usa. Não se introduz
 *  scraping nem fornecedor pago novo. O que a pesquisa não conseguir ver fica
 *  nulo e aparece na tela como «não consegui ver» — nunca preenchido por
 *  plausibilidade.
 *
 *  Server-only. */

import 'server-only';

import { hashContent } from '@/lib/crypto';
import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { strategyClient, type StrategyClient } from '@/lib/supabase/strategy';
import { aiSetup } from '@/modules/ai/provider';
import { runPrompt } from '@/modules/ai/gateway';
import { looksLikeVideoUrl, normalizeReferenceUrl } from '@/modules/references/domain';
import { FORMAT_LABEL, FORMATS, isFormat, type Format } from './editorial';
import {
  DNA_DIMENSIONS,
  DNA_DIMENSION_LABEL,
  DNA_VALUE_LABEL,
  MATURITY_LABEL,
  MATURITY_PHRASING,
  durationBandOf,
  formatMaturity,
  type DnaDimension,
  type MaturityState,
} from './format-dna';
import { isLadderState } from './learning';
import { OUTCOME_LABEL } from './experiments';
import { ladderView } from './outcome';
import { readReferenceEngineering } from './pack-prompts';

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

const client = async (c?: StrategyClient): Promise<StrategyClient> =>
  c ?? strategyClient(await supabaseServer());

async function me(c: StrategyClient): Promise<string | null> {
  const { data } = await c.from('app_user').select('id').limit(1).maybeSingle();
  return data?.id ?? null;
}

/* ── Referências ──────────────────────────────────────────────────────────── */

const PLATFORM_OF: { host: RegExp; platform: string }[] = [
  { host: /(^|\.)instagram\.com$/i, platform: 'instagram' },
  { host: /(^|\.)tiktok\.com$/i, platform: 'tiktok' },
  { host: /(^|\.)(youtube\.com|youtu\.be)$/i, platform: 'youtube' },
  { host: /(^|\.)facebook\.com$/i, platform: 'meta_ads' },
];

function platformOf(url: string): string {
  try {
    const host = new URL(url).hostname;
    return PLATFORM_OF.find((p) => p.host.test(host))?.platform ?? 'web';
  } catch {
    return 'other';
  }
}

function handleOf(url: string): string | null {
  const m = url.match(/(?:instagram\.com|tiktok\.com)\/@?([\w.]+)/i);
  return m && !['reel', 'reels', 'p', 'tv'].includes(m[1].toLowerCase()) ? m[1] : null;
}

/** Captura num toque: ela cola o endereço, o CarolOS guarda e tenta analisar.
 *
 *  A análise não bloqueia a captura. Um Reel salvo sem análise continua a ser
 *  um Reel salvo — a alternativa era perder a referência porque a pesquisa
 *  estava em baixo. */
export async function captureReference(input: {
  url: string;
  note?: string;
  radarCreatorId?: string | null;
}): Promise<Result<{ id: string; analysed: boolean }>> {
  const url = normalizeReferenceUrl(input.url);
  if (!/^https?:\/\/\S+\.\S+/.test(url)) return fail('Isso não parece um endereço.');
  if (!looksLikeVideoUrl(url)) return fail('Esse endereço não tem a forma de um vídeo daquela plataforma.');

  const db = await client();
  const hash = await hashContent(url);
  const { data: existente } = await db
    .from('creative_reference')
    .select('id')
    .eq('url_hash', hash)
    .maybeSingle();

  const id = existente?.id ?? (await insertReference(db, url, hash, input));
  if (!id) return fail('Não consegui guardar essa referência.');

  const analysed = await analyseReference(id, input.note ?? null, db);
  return { ok: true, data: { id, analysed } };
}

async function insertReference(
  db: StrategyClient,
  url: string,
  hash: string,
  input: { note?: string; radarCreatorId?: string | null },
): Promise<string | null> {
  const { data } = await db
    .from('creative_reference')
    .insert({
      source_platform: platformOf(url),
      source_url: url,
      url_hash: hash,
      creator_handle: handleOf(url),
      purpose: 'creator',
      captured_by: input.radarCreatorId ? 'radar' : 'carol',
      radar_creator_id: input.radarCreatorId ?? null,
      why_it_works: input.note?.trim() ?? '',
      analysis_status: 'pending',
    })
    .select('id')
    .maybeSingle();
  return data?.id ?? null;
}

/** Tenta ler a engenharia. Duas chamadas: a pesquisa que procura o que se sabe
 *  sobre aquele vídeo, e o modelo que estrutura o que ela devolveu.
 *
 *  Sem fornecedor configurado, ou sem a pesquisa devolver nada, o estado fica
 *  `unsupported` e a tela diz que a análise automática não conseguiu ver o
 *  vídeo. Nada é inventado para preencher a ficha. */
export async function analyseReference(
  referenceId: string,
  note: string | null,
  c?: StrategyClient,
): Promise<boolean> {
  const db = await client(c);
  const { data: ref } = await db
    .from('creative_reference')
    .select('id, source_url')
    .eq('id', referenceId)
    .maybeSingle();
  if (!ref) return false;

  const setup = aiSetup();
  if (!setup.provider) {
    await db.from('creative_reference').update({ analysis_status: 'unsupported' }).eq('id', referenceId);
    return false;
  }

  let prose = '';
  try {
    prose = await setup.provider.search({
      model: setup.models.chat,
      system:
        'Você descreve a ENGENHARIA de um vídeo curto a partir do que está publicamente visível: ' +
        'duração, como abre, quantas cenas, se há fala à câmera ou narração, se há gravação de tela, ' +
        'se há B-roll, se há texto em tela, que ritmo tem e que chamada estrutural usa no fim. ' +
        'NÃO descreva o assunto nem a pessoa. Se não conseguir ver o vídeo, diga exatamente isso ' +
        'e não descreva nada. Nunca preencha por plausibilidade.',
      user: `Vídeo: ${ref.source_url}\n${note ? `Quem salvou reparou nisto: ${note}` : ''}`,
      maxTokens: 1200,
    });
  } catch {
    await db.from('creative_reference').update({ analysis_status: 'failed' }).eq('id', referenceId);
    return false;
  }

  if (!prose.trim()) {
    await db.from('creative_reference').update({ analysis_status: 'unsupported' }).eq('id', referenceId);
    return false;
  }

  const r = await runPrompt(
    readReferenceEngineering,
    { url: ref.source_url, prose, note },
    { entityType: 'creative_reference', entityId: referenceId },
  );
  if (!r.ok) {
    await db.from('creative_reference').update({ analysis_status: 'failed' }).eq('id', referenceId);
    return false;
  }

  const e = r.output;
  await db
    .from('creative_reference')
    .update({
      analysis: asJson(e as unknown as Record<string, unknown>),
      analysis_status: 'done',
      analysed_at: new Date().toISOString(),
      structure: e.structure ?? '',
      duration_seconds: e.duration_seconds,
      scene_count: e.scene_count,
      effort: e.effort,
      why_it_works: e.question ?? note ?? '',
      ai_run_id: r.runId,
    })
    .eq('id', referenceId);

  // A assinatura da referência entra na mesma tabela que a das peças dela. É
  // isso que permite perguntar «que abertura ainda não experimentei».
  await db.from('content_format_dna').upsert(
    {
      reference_id: referenceId,
      presentation:
        e.speech_type === 'none' ? null
        : e.screen_recording ? 'screen_recording'
        : e.speech_type,
      opening: e.opening,
      pace: e.pace,
      on_screen_text: e.on_screen_text,
      duration_band: durationBandOf(e.duration_seconds),
      construction: e.scene_count && e.scene_count > 1 ? 'multi_scene' : 'single_scene',
      source: 'inferred',
      confidence: e.unknown.length > 4 ? 'low' : 'medium',
    },
    { onConflict: 'reference_id' },
  );

  return true;
}

export type ReferenceView = {
  id: string;
  url: string;
  platform: string;
  handle: string | null;
  capturedAt: string;
  status: string;
  structure: string;
  question: string;
  durationSeconds: number | null;
  sceneCount: number | null;
  effort: string | null;
  /** O que a análise não conseguiu ver. Aparece como está. */
  unknown: string[];
  fromRadar: boolean;
};

export async function references(opts: { db?: StrategyClient; limit?: number } = {}): Promise<ReferenceView[]> {
  const db = await client(opts.db);
  const { data } = await db
    .from('creative_reference')
    .select('id, source_url, source_platform, creator_handle, captured_at, analysis_status, analysis, structure, why_it_works, duration_seconds, scene_count, effort, radar_creator_id')
    .eq('purpose', 'creator')
    .order('captured_at', { ascending: false })
    .limit(opts.limit ?? 20);

  return (data ?? []).map((r) => {
    const analysis = (r.analysis ?? {}) as { unknown?: unknown };
    return {
      id: r.id,
      url: r.source_url,
      platform: r.source_platform,
      handle: r.creator_handle,
      capturedAt: r.captured_at,
      status: r.analysis_status,
      structure: r.structure,
      question: r.why_it_works,
      durationSeconds: r.duration_seconds,
      sceneCount: r.scene_count,
      effort: r.effort,
      unknown: Array.isArray(analysis.unknown) ? analysis.unknown.map(String) : [],
      fromRadar: Boolean(r.radar_creator_id),
    };
  });
}

/* ── Radar ────────────────────────────────────────────────────────────────── */

export type RadarCreator = {
  id: string;
  handle: string;
  platform: string;
  why: string;
  watchMode: string;
  lastCheckedAt: string | null;
};

/** Monitorização automática de um perfil externo precisa de um fornecedor que
 *  liste as publicações recentes de outra conta. A Graph API não o dá para
 *  contas de terceiros, e não existe nenhum contratado neste projeto.
 *
 *  Está registado como dependência externa real, não simulado: enquanto não
 *  existir, o Radar é a lista de quem observar e a captura é dela. */
export const RADAR_AUTOMATIC_BLOCKED =
  'Acompanhar sozinho o que essas creators publicam precisa de um fornecedor externo que ainda não existe aqui. Por enquanto, cole o link do que encontrar.';

export async function radarCreators(c?: StrategyClient): Promise<RadarCreator[]> {
  const db = await client(c);
  const { data } = await db
    .from('content_radar_creator')
    .select('id, handle, platform, why, watch_mode, last_checked_at')
    .eq('active', true)
    .order('handle');
  return (data ?? []).map((r) => ({
    id: r.id,
    handle: r.handle,
    platform: r.platform,
    why: r.why,
    watchMode: r.watch_mode,
    lastCheckedAt: r.last_checked_at,
  }));
}

export async function setRadarCreator(input: {
  handle: string;
  platform?: string;
  why?: string;
}): Promise<Result<{ id: string }>> {
  const handle = input.handle.trim().replace(/^@/, '');
  if (handle.length < 2) return fail('Preciso do @ da creator.');

  const db = await client();
  const userId = await me(db);
  if (!userId) return fail('Não encontrei o usuário.');

  // Pequeno e filtrado: o PDF é explícito em não construir um feed paralelo ao
  // Explore. O limite vive nas definições e pode mudar sem código.
  const atuais = await radarCreators(db);
  if (atuais.length >= 12 && !atuais.some((r) => r.handle === handle)) {
    return fail('O Radar é para poucas creators. Tire uma antes de acrescentar outra.');
  }

  const { data, error } = await db
    .from('content_radar_creator')
    .upsert(
      {
        app_user_id: userId,
        handle,
        platform: input.platform ?? 'instagram',
        why: input.why?.trim() ?? '',
        active: true,
        watch_mode: 'manual',
      },
      { onConflict: 'app_user_id,platform,handle' },
    )
    .select('id')
    .maybeSingle();
  if (error || !data) return fail(error?.message ?? 'Não consegui guardar.');
  return { ok: true, data: { id: data.id } };
}

export async function removeRadarCreator(id: string): Promise<Result> {
  const db = await client();
  const { error } = await db.from('content_radar_creator').update({ active: false }).eq('id', id);
  if (error) return fail(error.message);
  return { ok: true, data: undefined };
}

/* ── Maturidade de formato ────────────────────────────────────────────────── */

export type MaturityRow = {
  dimension: DnaDimension;
  dimensionLabel: string;
  value: string;
  valueLabel: string;
  state: MaturityState;
  stateLabel: string;
  phrasing: string;
  because: string;
  sampleSize: number;
  comparedWith: number;
};

const COLUMN: Partial<Record<DnaDimension, string>> = {
  format: 'format',
  presentation: 'presentation',
  construction: 'construction',
  presence: 'presence',
  opening: 'opening',
  pace: 'pace',
  audio: 'audio',
  durationBand: 'duration_band',
  onScreenText: 'on_screen_text',
  modality: 'modality',
};

/** Recalcula a maturidade de cada valor de cada dimensão, a partir das peças
 *  publicadas que têm assinatura e leitura de desempenho.
 *
 *  Idempotente e resistente: uma dimensão que falhe não leva as outras. */
export async function recomputeFormatStates(
  opts: { db?: StrategyClient } = {},
): Promise<{ written: number; failures: string[] }> {
  const db = opts.db ?? strategyClient(supabaseService());
  const failures: string[] = [];
  const userId = await me(db);
  if (!userId) return { written: 0, failures: ['Não encontrei o usuário.'] };

  const { data: dna } = await db
    .from('content_format_dna')
    .select('media_id, format, presentation, construction, presence, opening, pace, audio, duration_band, on_screen_text, modality')
    .not('media_id', 'is', null);

  const assinaturas = dna ?? [];
  const mediaIds = assinaturas.map((d) => d.media_id).filter((x): x is string => Boolean(x));

  // «Acima» é acima da mediana dela própria. O alcance vem da leitura mais
  // recente de cada peça; uma peça sem leitura conta para a amostra e não para
  // o acima — que é o que impede um formato de parecer bom por falta de
  // medição, em vez de por mérito.
  const { data: snaps } = mediaIds.length
    ? await db
        .from('instagram_media_snapshot')
        .select('media_id, snapshot_kind, reach')
        .in('media_id', mediaIds)
    : { data: [] as never[] };

  const alcance = new Map<string, number>();
  for (const s2 of snaps ?? []) {
    if (typeof s2.reach !== 'number') continue;
    // A leitura atual («latest») ganha; sem ela, a maior janela que existir.
    const atual = alcance.get(s2.media_id);
    if (s2.snapshot_kind === 'latest' || atual === undefined || s2.reach > atual) {
      alcance.set(s2.media_id, s2.reach);
    }
  }
  const valores = [...alcance.values()].sort((a, b) => a - b);
  const mediana = valores.length ? valores[Math.floor(valores.length / 2)] : null;

  const { data: medias } = mediaIds.length
    ? await db.from('instagram_media').select('id, published_at').in('id', mediaIds)
    : { data: [] as never[] };
  const monthById = new Map((medias ?? []).map((m) => [m.id, String(m.published_at).slice(0, 7)]));

  let written = 0;

  for (const dimension of DNA_DIMENSIONS) {
    const coluna = COLUMN[dimension];
    if (!coluna) continue;
    try {
      const porValor = new Map<string, { pieces: number; above: number; cohorts: Set<string> }>();
      for (const d of assinaturas) {
        const v = (d as unknown as Record<string, string | null>)[coluna];
        if (!v) continue;
        const bucket = porValor.get(v) ?? { pieces: 0, above: 0, cohorts: new Set<string>() };
        bucket.pieces += 1;
        const r = d.media_id ? alcance.get(d.media_id) : undefined;
        if (mediana !== null && r !== undefined && r >= mediana * 1.3) bucket.above += 1;
        if (d.media_id) bucket.cohorts.add(monthById.get(d.media_id) ?? '?');
        porValor.set(v, bucket);
      }

      const total = [...porValor.values()].reduce((a, b) => a + b.pieces, 0);

      // Um valor da dimensão que nunca apareceu tem de existir na tabela com
      // estado «não testado». É a diferença entre «não experimentámos» e a
      // ausência silenciosa que deixa Reel parecer o único caminho.
      const universo = dimension === 'format' ? [...FORMATS] : [...porValor.keys()];

      for (const value of universo) {
        const b = porValor.get(value) ?? { pieces: 0, above: 0, cohorts: new Set<string>() };
        const verdict = formatMaturity({
          dimension,
          value,
          pieces: b.pieces,
          above: b.above,
          alternatives: total - b.pieces,
          cohorts: b.cohorts.size,
        });
        const { error } = await db.from('content_format_state').upsert(
          {
            app_user_id: userId,
            dimension,
            value,
            state: verdict.state,
            sample_size: verdict.sampleSize,
            compared_with: verdict.comparedWith,
            because: verdict.because,
            evidence: asJson({ cohorts: b.cohorts.size, above: b.above }),
            policy_version: verdict.policyVersion,
          },
          { onConflict: 'app_user_id,dimension,value' },
        );
        if (error) failures.push(`${dimension}/${value}: ${error.message}`);
        else written += 1;
      }
    } catch (e) {
      failures.push(`${dimension}: ${e instanceof Error ? e.message : 'falhou'}`);
    }
  }

  return { written, failures };
}

export async function formatLab(c?: StrategyClient): Promise<{
  formats: MaturityRow[];
  others: MaturityRow[];
  untestedFormats: Format[];
}> {
  const db = await client(c);
  const { data } = await db
    .from('content_format_state')
    .select('dimension, value, state, sample_size, compared_with, because')
    .order('dimension')
    .order('value');

  const rows: MaturityRow[] = (data ?? []).map((r) => {
    const dimension = (DNA_DIMENSIONS as readonly string[]).includes(r.dimension)
      ? (r.dimension as DnaDimension)
      : 'format';
    const state = r.state as MaturityState;
    return {
      dimension,
      dimensionLabel: DNA_DIMENSION_LABEL[dimension],
      value: r.value,
      valueLabel: DNA_VALUE_LABEL[r.value] ?? r.value,
      state,
      stateLabel: MATURITY_LABEL[state] ?? r.state,
      phrasing: MATURITY_PHRASING[state] ?? '',
      because: r.because,
      sampleSize: r.sample_size,
      comparedWith: r.compared_with,
    };
  });

  const formats = rows.filter((r) => r.dimension === 'format');
  return {
    formats: formats.length
      ? formats
      : // Sem nenhuma corrida ainda, os quatro recipientes aparecem como não
        // testados em vez de a tela ficar vazia. Vazio parecia «nada a dizer»;
        // o que há a dizer é «ainda não experimentámos nenhum».
        FORMATS.map((f) => ({
          dimension: 'format' as DnaDimension,
          dimensionLabel: DNA_DIMENSION_LABEL.format,
          value: f,
          valueLabel: FORMAT_LABEL[f],
          state: 'untested' as MaturityState,
          stateLabel: MATURITY_LABEL.untested,
          phrasing: MATURITY_PHRASING.untested,
          because: 'Ainda não há assinatura de nenhuma peça.',
          sampleSize: 0,
          comparedWith: 0,
        })),
    others: rows.filter((r) => r.dimension !== 'format'),
    untestedFormats: formats.filter((r) => r.state === 'untested' && isFormat(r.value)).map((r) => r.value as Format),
  };
}

/* ── Testes ───────────────────────────────────────────────────────────────── */

export type ExperimentRow = {
  id: string;
  label: string;
  question: string;
  variable: string;
  constants: string[];
  status: string;
  outcome: string;
  outcomeLabel: string;
  because: string;
  sampleSize: number;
  reelTest: boolean;
};

export async function experiments(c?: StrategyClient): Promise<ExperimentRow[]> {
  const db = await client(c);
  const { data } = await db
    .from('content_experiment')
    .select('id, label, question, hypothesis, variable, constants, status, verdict, sample_size, reel_test_recommended')
    .in('status', ['planned', 'running', 'measured', 'learned'])
    .order('updated_at', { ascending: false })
    .limit(10);

  return (data ?? []).map((e) => {
    const verdict = (e.verdict ?? {}) as { outcome?: string; because?: string };
    const outcome = verdict.outcome ?? 'pending';
    return {
      id: e.id,
      label: e.label,
      question: e.question || e.hypothesis || '',
      variable: e.variable ?? '',
      constants: e.constants ?? [],
      status: e.status,
      outcome,
      outcomeLabel: OUTCOME_LABEL[outcome as keyof typeof OUTCOME_LABEL] ?? 'Ainda sem leitura',
      because: verdict.because ?? '',
      sampleSize: e.sample_size ?? 0,
      reelTest: Boolean(e.reel_test_recommended),
    };
  });
}

/* ── Aprendizados que mudam a próxima decisão ─────────────────────────────── */

export type LearningRow = {
  id: string;
  statement: string;
  level: string;
  because: string;
  sampleSize: number;
  demoted: boolean;
};

/** No máximo dois na Semana. Um aprendizado que não muda a próxima escolha é
 *  informação, e informação não precisa de espaço na homepage. */
export async function activeLearningRows(
  opts: { db?: StrategyClient; limit?: number } = {},
): Promise<LearningRow[]> {
  const db = await client(opts.db);
  const { data } = await db
    .from('content_learning')
    .select('id, statement, ladder_state, sample_size, evidence, active, demoted_at, demoted_because')
    .eq('active', true)
    .order('derived_at', { ascending: false })
    .limit(opts.limit ?? 6);

  return (data ?? [])
    .filter((l) => isLadderState(l.ladder_state))
    .map((l) => {
      const view = ladderView(l.ladder_state as never);
      const evidence = (l.evidence ?? {}) as { because?: string };
      return {
        id: l.id,
        statement: l.statement,
        level: view.label,
        because: l.demoted_at ? (l.demoted_because ?? 'Perdeu força com dados novos.') : (evidence.because ?? ''),
        sampleSize: l.sample_size ?? 0,
        demoted: Boolean(l.demoted_at),
      };
    });
}
