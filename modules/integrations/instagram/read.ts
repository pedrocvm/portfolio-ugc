/** Leituras do Instagram para as telas.
 *
 *  Separado de `service.ts` por uma razão concreta: `supabaseServer` importa
 *  `next/headers`, e arrastá-lo para dentro do serviço punha um trabalho de
 *  fundo a depender do contexto de um pedido HTTP. O sync deixava de correr
 *  fora do Next.
 *
 *  Aqui corre-se com a sessão dela, e portanto sob RLS.
 *
 *  Server-only. */

import 'server-only';

import { supabaseServer } from '@/lib/supabase/server';
import type { MetricValue, SnapshotKind } from '@/modules/content-brain/metrics';
import {
  ACCOUNT_SELECT,
  MEDIA_SELECT,
  toAccount,
  toMedia,
  type AccountRow,
  type MediaRow,
  type RawAccount,
  type RawMediaRow,
} from './service';

export async function accountForScreen(): Promise<AccountRow | null> {
  const db = await supabaseServer();
  const { data } = await db
    .from('instagram_account')
    .select(ACCOUNT_SELECT)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toAccount(data as RawAccount) : null;
}

export async function listMediaForScreen(limit = 40): Promise<MediaRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('instagram_media')
    .select(MEDIA_SELECT)
    .order('published_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as RawMediaRow[]).map(toMedia);
}

export type SnapshotRow = {
  kind: SnapshotKind;
  capturedAt: string;
  ageSeconds: number;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  follows: number | null;
  avgWatchSeconds: number | null;
  rawMetrics: Record<string, MetricValue>;
};

export async function snapshotsFor(mediaIds: readonly string[]): Promise<Map<string, SnapshotRow[]>> {
  if (mediaIds.length === 0) return new Map();
  const db = await supabaseServer();
  const { data } = await db
    .from('instagram_media_snapshot')
    .select('media_id, snapshot_kind, captured_at, age_seconds, views, reach, likes, comments, saves, shares, follows, avg_watch_time_seconds, raw_metrics')
    .in('media_id', [...mediaIds])
    .order('age_seconds', { ascending: true });

  const out = new Map<string, SnapshotRow[]>();
  for (const r of data ?? []) {
    const lista = out.get(r.media_id) ?? [];
    lista.push({
      kind: r.snapshot_kind as SnapshotKind,
      capturedAt: r.captured_at,
      ageSeconds: r.age_seconds,
      views: r.views,
      reach: r.reach,
      likes: r.likes,
      comments: r.comments,
      saves: r.saves,
      shares: r.shares,
      follows: r.follows,
      avgWatchSeconds: r.avg_watch_time_seconds === null ? null : Number(r.avg_watch_time_seconds),
      rawMetrics: (r.raw_metrics ?? {}) as Record<string, MetricValue>,
    });
    out.set(r.media_id, lista);
  }
  return out;
}
