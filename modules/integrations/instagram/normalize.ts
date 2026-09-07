/** Traduz o que a Meta devolve para o modelo do Content Brain.
 *
 *  Duas formas de resposta que a mesma API usa para coisas diferentes:
 *
 *    media insights   →  { name, period, values: [{ value }] }
 *    account insights →  { name, period, total_value: { value } }
 *
 *  E duas regras que este módulo existe para garantir:
 *
 *  1. Uma métrica que não veio fica `available: false`, nunca zero.
 *  2. O tempo guarda o bruto e a unidade documentada; os segundos derivam-se.
 *     `ig_reels_avg_watch_time` e `ig_reels_video_view_total_time` vêm em
 *     milissegundos — verificado contra a API a 05/09/2026, um Reel de ~18 s
 *     devolveu 11768.
 *
 *  Puro. Sem rede. */

import { z } from 'zod';
import { missingMetric, presentMetric, type MetricUnit, type MetricValue } from '@/modules/content-brain/metrics';

/* ── Unidades documentadas ────────────────────────────────────────────────── */

/** A unidade de cada métrica, pelo que o endpoint documenta. Uma métrica que
 *  não esteja aqui conta como `count` — e nunca como tempo, que é o erro caro. */
export const METRIC_UNIT: Record<string, MetricUnit> = {
  ig_reels_avg_watch_time: 'milliseconds',
  ig_reels_video_view_total_time: 'milliseconds',
};

export const unitFor = (metric: string): MetricUnit => METRIC_UNIT[metric] ?? 'count';

/* ── Conjuntos de métricas por tipo ───────────────────────────────────────── */

/** Verificado contra a API a 05/09/2026 com a conta @carolxqueiroz.
 *
 *  `profile_visits`, `follows`, `navigation` e `replies` são recusados para
 *  REELS com «does not support ... for this media product type». Pedi-los
 *  torna cada snapshot num erro; por isso o conjunto é por tipo. */
export const REELS_METRICS = [
  'views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions',
  'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time',
] as const;

export const FEED_METRICS = [
  'views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions',
] as const;

export const STORY_METRICS = [
  'views', 'reach', 'replies', 'navigation', 'shares', 'total_interactions', 'profile_activity', 'follows',
] as const;

export const ACCOUNT_METRICS = [
  'reach', 'views', 'accounts_engaged', 'total_interactions', 'profile_links_taps',
] as const;

export function metricsFor(mediaProductType: string, mediaType: string): readonly string[] {
  if (mediaProductType === 'REELS') return REELS_METRICS;
  if (mediaProductType === 'STORY') return STORY_METRICS;
  if (mediaType === 'VIDEO' || mediaType === 'IMAGE' || mediaType === 'CAROUSEL_ALBUM') return FEED_METRICS;
  return FEED_METRICS;
}

/* ── Schemas ──────────────────────────────────────────────────────────────── */

export const MeSchema = z.object({
  /** App-scoped ID. É o que `/me` chama `id`. */
  id: z.string(),
  /** ID da conta do Instagram. Semanticamente diferente do de cima. */
  user_id: z.string().optional(),
  username: z.string(),
  account_type: z.string().optional(),
  media_count: z.number().optional(),
  followers_count: z.number().optional(),
  follows_count: z.number().optional(),
});
export type MeProfile = z.infer<typeof MeSchema>;

export const MediaSchema = z.object({
  id: z.string(),
  caption: z.string().optional(),
  media_type: z.string().optional(),
  media_product_type: z.string().optional(),
  media_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
  permalink: z.string().optional(),
  timestamp: z.string(),
  is_shared_to_feed: z.boolean().optional(),
  comments_count: z.number().optional(),
  like_count: z.number().optional(),
});
export type RawMedia = z.infer<typeof MediaSchema>;

const InsightEntrySchema = z.object({
  name: z.string(),
  period: z.string().optional(),
  title: z.string().optional(),
  values: z.array(z.object({ value: z.unknown() })).optional(),
  total_value: z.object({ value: z.unknown() }).optional(),
});

export const InsightsSchema = z.object({ data: z.array(InsightEntrySchema) });

export const PagedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    paging: z
      .object({
        cursors: z.object({ before: z.string().optional(), after: z.string().optional() }).optional(),
        next: z.string().optional(),
      })
      .optional(),
  });

export const CommentSchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  timestamp: z.string().optional(),
  username: z.string().optional(),
  like_count: z.number().optional(),
  parent_id: z.string().optional(),
});
export type RawComment = z.infer<typeof CommentSchema>;

/* ── Normalização de insights ─────────────────────────────────────────────── */

export type NormalizedInsights = {
  metrics: Record<string, MetricValue>;
  apiVersion: string;
  fetchedAt: string;
};

const readValue = (entry: z.infer<typeof InsightEntrySchema>): number | null => {
  const direct = entry.total_value?.value;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  const first = entry.values?.[0]?.value;
  if (typeof first === 'number' && Number.isFinite(first)) return first;
  return null;
};

/** Converte a resposta de insights num mapa de métricas.
 *
 *  As pedidas que não vieram entram como indisponíveis com o motivo, em vez de
 *  desaparecerem. Uma métrica ausente do mapa seria indistinguível de uma
 *  métrica que ninguém pediu, e é dessa ambiguidade que nasce o zero falso. */
export function normalizeInsights(input: {
  requested: readonly string[];
  payload: unknown;
  apiVersion: string;
  fetchedAt?: string;
  /** Métricas que a API recusou explicitamente para este tipo de mídia. */
  unsupported?: readonly string[];
}): NormalizedInsights {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const parsed = InsightsSchema.safeParse(input.payload);
  const metrics: Record<string, MetricValue> = {};

  const entries = parsed.success ? parsed.data.data : [];
  for (const entry of entries) {
    const value = readValue(entry);
    metrics[entry.name] =
      value === null
        ? missingMetric({ metric: entry.name, reason: 'o Instagram devolveu a métrica sem valor', apiVersion: input.apiVersion, fetchedAt })
        : presentMetric({ metric: entry.name, value, unit: unitFor(entry.name), apiVersion: input.apiVersion, fetchedAt });
  }

  const naoSuportadas = new Set(input.unsupported ?? []);
  for (const name of input.requested) {
    if (metrics[name]) continue;
    metrics[name] = missingMetric({
      metric: name,
      reason: naoSuportadas.has(name)
        ? 'o Instagram não fornece essa métrica para este tipo de conteúdo'
        : 'o Instagram não devolveu essa métrica',
      apiVersion: input.apiVersion,
      fetchedAt,
    });
  }

  return { metrics, apiVersion: input.apiVersion, fetchedAt };
}

/** As colunas indexáveis da tabela de snapshot, a partir do mapa.
 *
 *  Devolve `null` — nunca `0` — para o que não veio. É a mesma regra dita em
 *  SQL: as colunas métricas são nullable e não têm default. */
export function snapshotColumns(m: Record<string, MetricValue>): {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  total_interactions: number | null;
  replies: number | null;
  navigation: number | null;
  profile_activity: number | null;
  follows: number | null;
  avg_watch_time_raw: number | null;
  avg_watch_time_seconds: number | null;
  total_watch_time_raw: number | null;
  total_watch_time_seconds: number | null;
} {
  const num = (k: string): number | null => {
    const v = m[k];
    return v && v.available && typeof v.valueRaw === 'number' ? v.valueRaw : null;
  };
  const secs = (k: string): number | null => {
    const v = m[k];
    return v && v.available ? v.valueNormalizedSeconds : null;
  };
  return {
    views: num('views'),
    reach: num('reach'),
    likes: num('likes'),
    comments: num('comments'),
    saves: num('saved'),
    shares: num('shares'),
    total_interactions: num('total_interactions'),
    replies: num('replies'),
    navigation: num('navigation'),
    profile_activity: num('profile_activity'),
    follows: num('follows'),
    avg_watch_time_raw: num('ig_reels_avg_watch_time'),
    avg_watch_time_seconds: secs('ig_reels_avg_watch_time'),
    total_watch_time_raw: num('ig_reels_video_view_total_time'),
    total_watch_time_seconds: secs('ig_reels_video_view_total_time'),
  };
}

/* ── Mídia ────────────────────────────────────────────────────────────────── */

export type NormalizedMedia = {
  externalMediaId: string;
  caption: string;
  mediaType: string;
  mediaProductType: string;
  permalink: string | null;
  publishedAt: string;
  /** Nunca guardado como storage: a URL da Meta expira. */
  thumbnailUrl: string | null;
  isSharedToFeed: boolean | null;
  commentsCount: number | null;
  likeCount: number | null;
};

export function normalizeMedia(raw: RawMedia): NormalizedMedia {
  return {
    externalMediaId: raw.id,
    caption: raw.caption ?? '',
    mediaType: raw.media_type ?? 'UNKNOWN',
    mediaProductType: raw.media_product_type ?? 'UNKNOWN',
    permalink: raw.permalink ?? null,
    publishedAt: raw.timestamp,
    thumbnailUrl: raw.thumbnail_url ?? raw.media_url ?? null,
    isSharedToFeed: raw.is_shared_to_feed ?? null,
    commentsCount: typeof raw.comments_count === 'number' ? raw.comments_count : null,
    likeCount: typeof raw.like_count === 'number' ? raw.like_count : null,
  };
}

/* ── Embed ────────────────────────────────────────────────────────────────── */

/** O endereço que o Instagram serve para ser mostrado dentro de um iframe.
 *
 *  Só publicações do feed têm um: um Story ou um perfil não, e um Reel que
 *  ficou só no separador Reels (`is_shared_to_feed=false`) devolve «este link
 *  pode estar quebrado» — verificado a 07/09/2026 com dois Reels da conta.
 *  Nesses casos a única saída é abrir no Instagram. */
export function instagramEmbedUrl(
  permalink: string | null | undefined,
  media: { isSharedToFeed?: boolean | null } = {},
): string | null {
  if (!permalink || media.isSharedToFeed === false) return null;
  let u: URL;
  try {
    u = new URL(permalink);
  } catch {
    return null;
  }
  if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?/);
  if (!m) return null;
  return `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/embed/`;
}
