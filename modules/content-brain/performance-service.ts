/** Performance Intelligence: mediana própria, sinais e a escada da evidência.
 *
 *  O que este serviço protege, além das regras já puras:
 *
 *  - a baseline é sempre da coorte certa (plataforma, tipo, idade do snapshot);
 *  - uma peça só entra como evidência de um mecanismo se esse mecanismo
 *    estiver registado na estrutura dela — nunca inferido depois;
 *  - nada sobe a `validated` sem os limiares da política v1.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import {
  LEARNING_POLICY_V1,
  PILLAR_SPEC,
  buildBaseline,
  classifyLadder,
  formatMetric,
  lensById,
  presentMetric,
  relativeToMedian,
  type Baseline,
  type FunctionalPillar,
  type LadderVerdict,
  type MetricValue,
  type PieceEvidence,
  type RelativeReading,
  type SnapshotKind,
} from './domain';

const METRIC_LABEL: Record<string, string> = {
  views: 'Views',
  reach: 'Alcance',
  likes: 'Curtidas',
  comments: 'Comentários',
  saves: 'Salvamentos',
  shares: 'Compartilhamentos',
  follows: 'Seguidores',
  avg_watch_time_seconds: 'Retenção média',
};

export type PublishedPiece = {
  mediaId: string;
  externalMediaId: string;
  permalink: string | null;
  caption: string;
  publishedAt: string;
  mediaProductType: string;
  trialStatus: string;
  storyId: string | null;
  storyTitle: string | null;
  contentIdeaId: string | null;
  pillar: FunctionalPillar | null;
  mechanism: string | null;
  snapshots: { kind: SnapshotKind; ageSeconds: number; capturedAt: string; metrics: Record<string, number | null> }[];
  latest: { kind: SnapshotKind; readings: RelativeReading[] } | null;
};

type SnapRow = {
  media_id: string; snapshot_kind: string; captured_at: string; age_seconds: number;
  views: number | null; reach: number | null; likes: number | null; comments: number | null;
  saves: number | null; shares: number | null; follows: number | null;
  avg_watch_time_seconds: string | number | null;
};

const numeric = (v: string | number | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : Number(v);

/* ── Baseline ─────────────────────────────────────────────────────────────── */

export type BaselineSet = {
  cohort: { mediaProductType: string; snapshotKind: SnapshotKind };
  metrics: Record<string, Baseline>;
};

/** A mediana dela, por coorte.
 *
 *  Comparar T+6h com o fecho de 30 dias faz o segundo ganhar sempre, por isso
 *  a coorte inclui a janela. E só entram valores disponíveis: um NULL não
 *  pode puxar a mediana para baixo como se fosse zero. */
export async function baselineFor(
  mediaProductType: string,
  snapshotKind: SnapshotKind,
  opts: { excludeMediaId?: string } = {},
): Promise<BaselineSet> {
  const db = await supabaseServer();
  const { data } = await db
    .from('instagram_media_snapshot')
    .select('media_id, snapshot_kind, captured_at, age_seconds, views, reach, likes, comments, saves, shares, follows, avg_watch_time_seconds, instagram_media!inner(media_product_type)')
    .eq('snapshot_kind', snapshotKind)
    .eq('instagram_media.media_product_type', mediaProductType)
    .limit(200);

  const rows = ((data ?? []) as unknown as SnapRow[]).filter((r) => r.media_id !== opts.excludeMediaId);
  const metrics: Record<string, Baseline> = {};

  for (const nome of ['views', 'reach', 'likes', 'comments', 'saves', 'shares', 'follows', 'avg_watch_time_seconds']) {
    const amostras: MetricValue[] = rows.map((r) => {
      const bruto = nome === 'avg_watch_time_seconds' ? numeric(r.avg_watch_time_seconds) : (r as unknown as Record<string, number | null>)[nome];
      return bruto === null || bruto === undefined
        ? { metric: nome, valueRaw: null, unitRaw: 'unknown' as const, valueNormalizedSeconds: null, available: false, apiVersion: '', fetchedAt: r.captured_at }
        : presentMetric({ metric: nome, value: bruto, apiVersion: '', fetchedAt: r.captured_at });
    });
    metrics[nome] = buildBaseline(nome, amostras);
  }

  return { cohort: { mediaProductType, snapshotKind }, metrics };
}

/* ── Peças publicadas ─────────────────────────────────────────────────────── */

export async function publishedPieces(limit = 30): Promise<PublishedPiece[]> {
  const db = await supabaseServer();
  const { data: medias } = await db
    .from('instagram_media')
    .select('id, external_media_id, permalink, caption, published_at, media_product_type, trial_status, story_id, content_idea_id, creator_story(title, functional_pillar, structure, story_lens_id)')
    .order('published_at', { ascending: false })
    .limit(limit);

  const rows = medias ?? [];
  if (rows.length === 0) return [];

  const { data: snaps } = await db
    .from('instagram_media_snapshot')
    .select('media_id, snapshot_kind, captured_at, age_seconds, views, reach, likes, comments, saves, shares, follows, avg_watch_time_seconds')
    .in('media_id', rows.map((m) => m.id))
    .order('age_seconds', { ascending: true });

  const porMidia = new Map<string, SnapRow[]>();
  for (const s of (snaps ?? []) as unknown as SnapRow[]) {
    const lista = porMidia.get(s.media_id) ?? [];
    lista.push(s);
    porMidia.set(s.media_id, lista);
  }

  // Uma baseline por coorte encontrada, calculada uma vez.
  const coortes = new Map<string, BaselineSet>();
  const out: PublishedPiece[] = [];

  for (const m of rows) {
    const story = (m.creator_story ?? null) as { title?: string; functional_pillar?: string; structure?: Record<string, unknown>; story_lens_id?: string | null } | null;
    const lista = porMidia.get(m.id) ?? [];
    const ultimo = lista[lista.length - 1];

    let latest: PublishedPiece['latest'] = null;
    if (ultimo) {
      const chave = `${m.media_product_type}:${ultimo.snapshot_kind}`;
      if (!coortes.has(chave)) {
        coortes.set(chave, await baselineFor(m.media_product_type, ultimo.snapshot_kind as SnapshotKind, { excludeMediaId: m.id }));
      }
      const base = coortes.get(chave)!;
      const funcao = story?.functional_pillar as FunctionalPillar | undefined;
      const relevantes = funcao
        ? [...PILLAR_SPEC[funcao].primaryMetrics, ...PILLAR_SPEC[funcao].secondaryMetrics]
        : ['views', 'reach', 'comments'];

      latest = {
        kind: ultimo.snapshot_kind as SnapshotKind,
        readings: relevantes
          .filter((nome) => base.metrics[nome])
          .map((nome) => {
            const bruto = nome === 'avg_watch_time_seconds' ? numeric(ultimo.avg_watch_time_seconds) : (ultimo as unknown as Record<string, number | null>)[nome];
            return relativeToMedian({
              metric: nome,
              label: METRIC_LABEL[nome] ?? nome,
              value:
                bruto === null || bruto === undefined
                  ? { metric: nome, valueRaw: null, unitRaw: 'unknown', valueNormalizedSeconds: null, available: false, apiVersion: '', fetchedAt: ultimo.captured_at }
                  : presentMetric({ metric: nome, value: bruto, apiVersion: '', fetchedAt: ultimo.captured_at }),
              baseline: base.metrics[nome],
            });
          }),
      };
    }

    out.push({
      mediaId: m.id,
      externalMediaId: m.external_media_id,
      permalink: m.permalink,
      caption: m.caption,
      publishedAt: m.published_at,
      mediaProductType: m.media_product_type,
      trialStatus: m.trial_status,
      storyId: m.story_id,
      storyTitle: story?.title ?? null,
      contentIdeaId: m.content_idea_id,
      pillar: (story?.functional_pillar as FunctionalPillar | undefined) ?? null,
      mechanism: mechanismOf(story?.structure ?? null, story?.story_lens_id ?? null),
      snapshots: lista.map((s) => ({
        kind: s.snapshot_kind as SnapshotKind,
        ageSeconds: s.age_seconds,
        capturedAt: s.captured_at,
        metrics: {
          views: s.views, reach: s.reach, likes: s.likes, comments: s.comments,
          saves: s.saves, shares: s.shares, follows: s.follows,
          avg_watch_time_seconds: numeric(s.avg_watch_time_seconds),
        },
      })),
      latest,
    });
  }

  return out;
}

/** O mecanismo declarado na estrutura da peça.
 *
 *  O motor só aprende sobre mecanismo que esteja aqui. Sem isto, uma IA podia
 *  analisar o vídeo depois e inventar «gancho de vulnerabilidade» como causa.
 *
 *  A lente entra quando a história foi encontrada por ela — é o que permitirá,
 *  com amostra, dizer «expectativa x realidade parece render mais comentários».
 *  Com uma peça só, continua a ser observação: quem decide é a escada. */
function mechanismOf(
  structure: Record<string, unknown> | null,
  lensId?: string | null,
): string | null {
  const partes: string[] = [];
  if (lensId) partes.push(`lens:${lensId}`);

  if (structure) {
    const frame = structure.frame as { label?: string } | undefined;
    const formato = typeof structure.format === 'string' ? structure.format : null;
    if (formato) partes.push(frame?.label ? `${formato}:${frame.label}` : formato);
  }

  return partes.length ? partes.join(' · ') : null;
}

/* ── Escada ───────────────────────────────────────────────────────────────── */

export type LearningRow = {
  id: string;
  mechanism: string | null;
  statement: string;
  ladderState: string;
  confidence: string;
  sampleSize: number;
  evidenceIds: string[];
  derivedAt: string;
};

/** Deriva sinais e aprendizados a partir dos snapshots reais.
 *
 *  Corre num trabalho, nunca no render. Agrupa por mecanismo, monta a
 *  evidência e deixa a classificação para o domínio puro. */
export async function deriveLearnings(): Promise<{ evaluated: number; written: number; validated: number; failures: string[] }> {
  const db = supabaseService();
  const falhas: string[] = [];

  const { data: medias } = await db
    .from('instagram_media')
    .select('id, media_product_type, story_id, creator_story(functional_pillar, structure, story_lens_id)')
    .not('story_id', 'is', null)
    .limit(120);

  const rows = medias ?? [];
  if (rows.length === 0) return { evaluated: 0, written: 0, validated: 0, failures: [] };

  const { data: snaps } = await db
    .from('instagram_media_snapshot')
    .select('media_id, snapshot_kind, captured_at, age_seconds, views, reach, likes, comments, saves, shares, follows, avg_watch_time_seconds')
    .in('media_id', rows.map((m) => m.id));

  const porMidia = new Map<string, SnapRow[]>();
  for (const s of (snaps ?? []) as unknown as SnapRow[]) {
    const lista = porMidia.get(s.media_id) ?? [];
    lista.push(s);
    porMidia.set(s.media_id, lista);
  }

  // Agrupa por mecanismo. Uma peça sem mecanismo registado não conta — é a
  // regra que impede o motor de aprender sobre uma causa inventada.
  const porMecanismo = new Map<string, { pillar: FunctionalPillar | null; pieces: PieceEvidence[] }>();

  for (const m of rows) {
    const story = (m.creator_story ?? null) as { functional_pillar?: string; structure?: Record<string, unknown>; story_lens_id?: string | null } | null;
    const mecanismo = mechanismOf(story?.structure ?? null, story?.story_lens_id ?? null);
    if (!mecanismo) continue;

    const lista = (porMidia.get(m.id) ?? []).sort((a, b) => a.age_seconds - b.age_seconds);
    const snapshot = lista.find((s) => s.snapshot_kind === 't7d') ?? lista.find((s) => s.snapshot_kind === 't24h') ?? lista[lista.length - 1];
    if (!snapshot) continue;

    const pillar = (story?.functional_pillar as FunctionalPillar | undefined) ?? null;
    const base = await baselineFor(m.media_product_type, snapshot.snapshot_kind as SnapshotKind, { excludeMediaId: m.id });
    const alinhadas = pillar ? new Set(PILLAR_SPEC[pillar].primaryMetrics) : new Set(['reach', 'views']);

    const metrics = Object.keys(base.metrics)
      .map((nome) => {
        const b = base.metrics[nome];
        const bruto = nome === 'avg_watch_time_seconds' ? numeric(snapshot.avg_watch_time_seconds) : (snapshot as unknown as Record<string, number | null>)[nome];
        if (bruto === null || bruto === undefined || !b.sufficient || !b.median) return null;
        return { name: nome, relativeToMedian: bruto / b.median, alignedWithFunction: alinhadas.has(nome) };
      })
      .filter((x): x is { name: string; relativeToMedian: number; alignedWithFunction: boolean } => x !== null);

    const entrada = porMecanismo.get(mecanismo) ?? { pillar, pieces: [] };
    entrada.pieces.push({
      mediaId: m.id,
      contentId: null,
      mechanismDeclared: true,
      cohort: { platform: 'instagram', mediaType: m.media_product_type, snapshotKind: snapshot.snapshot_kind as SnapshotKind, pillar },
      metrics,
      externalCause: false,
    });
    porMecanismo.set(mecanismo, entrada);
  }

  let escritos = 0;
  let validados = 0;

  for (const [mecanismo, { pillar, pieces }] of porMecanismo) {
    const verdict: LadderVerdict = classifyLadder({ mechanism: mecanismo, pillar, evidence: pieces, contradictions: [] });
    if (verdict.state === 'observation') continue;

    const { error } = await db.from('content_learning').upsert(
      {
        dedupe_key: `mechanism:${mecanismo}`,
        statement: statementFor(mecanismo, verdict),
        kind: 'performance',
        ladder_state: verdict.state,
        mechanism: mecanismo,
        confidence: verdict.confidence,
        sample_size: verdict.sampleSize,
        evidence_ids: pieces.map((p) => p.mediaId),
        cohort: asJson(pieces[0]?.cohort ?? {}),
        policy_version: LEARNING_POLICY_V1.version,
        evidence: asJson({ metrics: verdict.agreeingMetrics, because: verdict.because }),
        derived_at: new Date().toISOString(),
        validated_at: verdict.state === 'validated' ? new Date().toISOString() : null,
        rejected_at: verdict.state === 'rejected' ? new Date().toISOString() : null,
        active: verdict.state !== 'rejected',
      },
      { onConflict: 'dedupe_key' },
    );

    if (error) falhas.push(`aprendizado ${mecanismo}: ${error.message.slice(0, 140)}`);
    else {
      escritos += 1;
      if (verdict.state === 'validated') validados += 1;
    }
  }

  return { evaluated: porMecanismo.size, written: escritos, validated: validados, failures: falhas };
}

const FORMAT_LABEL: Record<string, string> = {
  talking_head: 'falando',
  talking_broll: 'falando com B-roll',
  vlog: 'vlog',
  aesthetic: 'estético',
  humor_pov: 'humor',
  bts: 'bastidores',
  demo: 'demonstração',
  carousel: 'carrossel',
};

/** O mecanismo em português.
 *
 *  A chave interna é `formato:ponto` — `talking_head:eu complico tentando
 *  melhorar`. Isso é um identificador, e um identificador na tela é o sistema
 *  a falar consigo próprio à frente dela. */
function describeMechanism(mechanism: string): string {
  const partes: string[] = [];

  for (const bloco of mechanism.split(' · ')) {
    if (bloco.startsWith('lens:')) {
      const lens = lensById(bloco.slice(5));
      if (lens) partes.push(`«${lens.label}»`);
      continue;
    }
    const [formato, ...resto] = bloco.split(':');
    const ponto = resto.join(':').trim();
    const nome = FORMAT_LABEL[formato] ?? formato.replace(/_/g, ' ');
    partes.push(ponto ? `«${ponto}», ${nome}` : nome);
  }

  return partes.join(', ');
}

/** A frase que aparece na tela. O degrau da escada dita o verbo. */
function statementFor(mechanism: string, v: LadderVerdict): string {
  const m = describeMechanism(mechanism);
  const metricas = v.agreeingMetrics.map((x) => METRIC_LABEL[x] ?? x).join(' e ');
  if (v.state === 'validated') {
    return `Conteúdos como ${m} ficaram acima da sua mediana em ${metricas}, em ${v.sampleSize} peças. Dá para contar com isso.`;
  }
  if (v.state === 'hypothesis') {
    return `Conteúdos como ${m} parecem render mais em ${metricas}. Vale repetir esse caminho em outra história real.`;
  }
  if (v.state === 'rejected') {
    return `Conteúdos como ${m} não se sustentaram. Parei de tratar como padrão.`;
  }
  return `Há um sinal em conteúdos como ${m}${metricas ? ` (${metricas})` : ''}. Ainda não é um padrão.`;
}

export { describeMechanism };

export async function learningLadder(limit = 12): Promise<LearningRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('content_learning')
    .select('id, mechanism, statement, ladder_state, confidence, sample_size, evidence_ids, derived_at')
    .order('derived_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    mechanism: r.mechanism,
    statement: r.statement,
    ladderState: r.ladder_state,
    confidence: r.confidence,
    sampleSize: r.sample_size,
    evidenceIds: r.evidence_ids ?? [],
    derivedAt: r.derived_at,
  }));
}

export { formatMetric };
