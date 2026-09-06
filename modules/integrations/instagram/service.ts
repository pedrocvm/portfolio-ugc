/** Acesso a dados da integração Instagram.
 *
 *  Tudo o que escreve na base vive aqui; as regras vivem nos módulos puros ao
 *  lado. Um componente de cliente nunca importa este ficheiro.
 *
 *  Server-only. */

import 'server-only';

import { asJson } from '@/lib/supabase/json';
import { supabaseService } from '@/lib/supabase/service';
import { dueSnapshots, latestDue, type SnapshotKind, type TrialStatus } from '@/modules/content-brain/metrics';
import { groupStorySequences, type StorySequence } from '@/modules/content-brain/stories';
import { apiVersion } from './config';
import type { MeProfile, NormalizedMedia } from './normalize';
import { snapshotColumns } from './normalize';
import type { MetricValue } from '@/modules/content-brain/metrics';

export type AccountRow = {
  id: string;
  appUserId: string;
  igAccountId: string;
  igMeId: string | null;
  username: string;
  accountType: string | null;
  followersCount: number | null;
  mediaCount: number | null;
  status: string;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  apiVersion: string;
};

export const ACCOUNT_SELECT =
  'id, app_user_id, ig_account_id, ig_me_id, username, account_type, followers_count, media_count, status, last_sync_at, last_success_at, last_error_code, api_version';

export type RawAccount = {
  id: string; app_user_id: string; ig_account_id: string; ig_me_id: string | null;
  username: string; account_type: string | null; followers_count: number | null;
  media_count: number | null; status: string; last_sync_at: string | null;
  last_success_at: string | null; last_error_code: string | null; api_version: string;
};

export const toAccount = (r: RawAccount): AccountRow => ({
  id: r.id,
  appUserId: r.app_user_id,
  igAccountId: r.ig_account_id,
  igMeId: r.ig_me_id,
  username: r.username,
  accountType: r.account_type,
  followersCount: r.followers_count,
  mediaCount: r.media_count,
  status: r.status,
  lastSyncAt: r.last_sync_at,
  lastSuccessAt: r.last_success_at,
  lastErrorCode: r.last_error_code,
  apiVersion: r.api_version,
});

/** Grava a conta ligada.
 *
 *  `/me` devolve `id` (app-scoped) e `user_id` (a conta). Guardam-se os dois,
 *  em colunas diferentes, com a origem de cada um. Assumir que são a mesma
 *  coisa parte quando um endpoint aceita um e recusa o outro. */
export async function upsertAccount(
  appUserId: string,
  me: MeProfile,
  extra: { scopes?: readonly string[] } = {},
): Promise<AccountRow | null> {
  const db = supabaseService();
  const igAccountId = me.user_id ?? me.id;

  const { data, error } = await db
    .from('instagram_account')
    .upsert(
      {
        app_user_id: appUserId,
        ig_account_id: igAccountId,
        ig_account_id_source: me.user_id ? 'me.user_id' : 'me.id',
        ig_me_id: me.id,
        ig_me_id_source: 'me.id',
        username: me.username,
        account_type: me.account_type ?? null,
        media_count: me.media_count ?? null,
        followers_count: me.followers_count ?? null,
        follows_count: me.follows_count ?? null,
        scopes: extra.scopes ? [...extra.scopes] : undefined,
        api_version: apiVersion(),
        status: 'connected',
        last_success_at: new Date().toISOString(),
      },
      { onConflict: 'app_user_id,ig_account_id' },
    )
    .select(ACCOUNT_SELECT)
    .maybeSingle();

  if (error || !data) return null;
  return toAccount(data as RawAccount);
}

export async function currentAccount(): Promise<AccountRow | null> {
  const db = supabaseService();
  const { data } = await db
    .from('instagram_account')
    .select(ACCOUNT_SELECT)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toAccount(data as RawAccount) : null;
}

export async function markAccountError(accountId: string, code: string): Promise<void> {
  await supabaseService()
    .from('instagram_account')
    .update({ last_error_code: code, last_error_at: new Date().toISOString(), status: code === 'auth_revoked' ? 'revoked' : 'error' })
    .eq('id', accountId);
}

export async function markAccountSynced(accountId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabaseService()
    .from('instagram_account')
    .update({ last_sync_at: now, last_success_at: now, last_error_code: null, status: 'connected' })
    .eq('id', accountId);
}

/* ── Mídia ────────────────────────────────────────────────────────────────── */

export type MediaRow = {
  id: string;
  externalMediaId: string;
  mediaType: string;
  mediaProductType: string;
  permalink: string | null;
  caption: string;
  publishedAt: string;
  thumbnailUrl: string | null;
  isSharedToFeed: boolean | null;
  commentsCount: number | null;
  likeCount: number | null;
  trialStatus: TrialStatus;
  trialPromptedAt: string | null;
  contentIdeaId: string | null;
  storyId: string | null;
  linkPromptedAt: string | null;
  source: string;
  /** Stories: quando deixou de aparecer em `me/stories`. Nulo enquanto ativo. */
  expiredAt: string | null;
  lastSeenActiveAt: string | null;
  sequenceId: string | null;
};

export const MEDIA_SELECT =
  'id, external_media_id, media_type, media_product_type, permalink, caption, published_at, thumbnail_url, is_shared_to_feed, comments_count, like_count, trial_status, trial_prompted_at, content_idea_id, story_id, link_prompted_at, source, expired_at, last_seen_active_at, sequence_id';

export type RawMediaRow = {
  id: string; external_media_id: string; media_type: string; media_product_type: string;
  permalink: string | null; caption: string; published_at: string; thumbnail_url: string | null;
  is_shared_to_feed: boolean | null; comments_count: number | null; like_count: number | null;
  trial_status: string; trial_prompted_at: string | null; content_idea_id: string | null;
  story_id: string | null; link_prompted_at: string | null; source: string;
  expired_at: string | null; last_seen_active_at: string | null; sequence_id: string | null;
};

export const toMedia = (r: RawMediaRow): MediaRow => ({
  id: r.id,
  externalMediaId: r.external_media_id,
  mediaType: r.media_type,
  mediaProductType: r.media_product_type,
  permalink: r.permalink,
  caption: r.caption,
  publishedAt: r.published_at,
  thumbnailUrl: r.thumbnail_url,
  isSharedToFeed: r.is_shared_to_feed,
  commentsCount: r.comments_count,
  likeCount: r.like_count,
  trialStatus: r.trial_status as TrialStatus,
  trialPromptedAt: r.trial_prompted_at,
  contentIdeaId: r.content_idea_id,
  storyId: r.story_id,
  linkPromptedAt: r.link_prompted_at,
  source: r.source,
  expiredAt: r.expired_at,
  lastSeenActiveAt: r.last_seen_active_at,
  sequenceId: r.sequence_id,
});

/** Grava mídia de forma idempotente.
 *
 *  O `upsert` não toca em `trial_status`, `content_idea_id` nem `story_id`:
 *  são estado humano, e um sync não pode apagar uma confirmação dela. */
export async function upsertMedia(
  accountId: string,
  medias: readonly NormalizedMedia[],
  opts: { activeStories?: boolean; now?: Date } = {},
): Promise<{ seen: number; inserted: number }> {
  if (medias.length === 0) return { seen: 0, inserted: 0 };
  const db = supabaseService();
  const agora = (opts.now ?? new Date()).toISOString();

  const { data: existentes } = await db
    .from('instagram_media')
    .select('external_media_id')
    .eq('account_id', accountId)
    .in('external_media_id', medias.map((m) => m.externalMediaId));

  const conhecidas = new Set((existentes ?? []).map((r) => r.external_media_id));

  const { error } = await db.from('instagram_media').upsert(
    medias.map((m) => ({
      account_id: accountId,
      external_media_id: m.externalMediaId,
      media_type: m.mediaType,
      media_product_type: m.mediaProductType,
      permalink: m.permalink,
      caption: m.caption,
      published_at: m.publishedAt,
      thumbnail_url: m.thumbnailUrl,
      is_shared_to_feed: m.isSharedToFeed,
      comments_count: m.commentsCount,
      like_count: m.likeCount,
      observed_at: agora,
      // Um Story que veio de `me/stories` está ativo: a expiração marca-se
      // quando deixar de vir, nunca por adivinhação da hora.
      ...(opts.activeStories ? { last_seen_active_at: agora, expired_at: null } : {}),
    })),
    { onConflict: 'account_id,external_media_id' },
  );

  if (error) throw new Error(`instagram_media: ${error.message}`);
  return { seen: medias.length, inserted: medias.filter((m) => !conhecidas.has(m.externalMediaId)).length };
}

export async function listMedia(accountId: string, limit = 60): Promise<MediaRow[]> {
  const { data } = await supabaseService()
    .from('instagram_media')
    .select(MEDIA_SELECT)
    .eq('account_id', accountId)
    .order('published_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as RawMediaRow[]).map(toMedia);
}

/* ── Snapshots ────────────────────────────────────────────────────────────── */

export type PendingSnapshot = { media: MediaRow; kinds: SnapshotKind[] };

/** Que snapshots estão em janela agora.
 *
 *  Um varrimento sobre a mídia publicada, não seis crons por Reel. A unicidade
 *  `(media_id, snapshot_kind)` é que garante que uma corrida repetida não
 *  duplica — aqui só se evita o trabalho. */
export async function pendingSnapshots(accountId: string, now = new Date()): Promise<PendingSnapshot[]> {
  const db = supabaseService();
  const trintaDias = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();

  const { data: medias } = await db
    .from('instagram_media')
    .select(MEDIA_SELECT)
    .eq('account_id', accountId)
    .gte('published_at', trintaDias)
    .order('published_at', { ascending: false });

  const rows = ((medias ?? []) as RawMediaRow[]).map(toMedia);
  if (rows.length === 0) return [];

  const { data: feitos } = await db
    .from('instagram_media_snapshot')
    .select('media_id, snapshot_kind')
    .in('media_id', rows.map((r) => r.id));

  const porMidia = new Map<string, SnapshotKind[]>();
  for (const s of feitos ?? []) {
    const lista = porMidia.get(s.media_id) ?? [];
    lista.push(s.snapshot_kind as SnapshotKind);
    porMidia.set(s.media_id, lista);
  }

  return rows
    .map((media) => ({
      media,
      kinds: dueSnapshots({ publishedAt: media.publishedAt, existing: porMidia.get(media.id) ?? [], now, productType: media.mediaProductType }),
    }))
    .filter((p) => p.kinds.length > 0);
}

/** Que peças do Feed estão sem leitura atual, ou com uma leitura de há mais
 *  de um dia. É o que dá métrica às publicações de 2023: fora de qualquer
 *  janela, mas não fora da API. */
export async function pendingLatest(accountId: string, now = new Date(), limit = 30): Promise<MediaRow[]> {
  const db = supabaseService();
  const { data: medias } = await db
    .from('instagram_media')
    .select(MEDIA_SELECT)
    .eq('account_id', accountId)
    .neq('media_product_type', 'STORY')
    .order('published_at', { ascending: false });

  const rows = ((medias ?? []) as RawMediaRow[]).map(toMedia);
  if (rows.length === 0) return [];

  const { data: feitos } = await db
    .from('instagram_media_snapshot')
    .select('media_id, captured_at')
    .eq('snapshot_kind', 'latest')
    .in('media_id', rows.map((r) => r.id));
  const ultima = new Map((feitos ?? []).map((f) => [f.media_id, f.captured_at]));

  return rows
    .filter((m) => latestDue({ publishedAt: m.publishedAt, productType: m.mediaProductType, lastLatestAt: ultima.get(m.id) ?? null, now }))
    .slice(0, limit);
}

export async function writeSnapshot(input: {
  mediaId: string;
  kind: SnapshotKind;
  publishedAt: string;
  metrics: Record<string, MetricValue>;
  now?: Date;
  source?: 'api' | 'chrome_audit_t0' | 'manual';
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const cols = snapshotColumns(input.metrics);

  const { error } = await supabaseService()
    .from('instagram_media_snapshot')
    .upsert(
      {
        media_id: input.mediaId,
        snapshot_kind: input.kind,
        captured_at: now.toISOString(),
        age_seconds: Math.max(0, Math.round((now.getTime() - new Date(input.publishedAt).getTime()) / 1000)),
        ...cols,
        raw_metrics: asJson(input.metrics),
        api_version: apiVersion(),
        source: input.source ?? 'api',
      },
      // Uma janela não se reescreve: um trabalho repetido não põe números mais
      // velhos por cima dos que já lá estavam. A leitura atual é o contrário —
      // é sempre a mais recente, e por isso substitui.
      { onConflict: 'media_id,snapshot_kind', ignoreDuplicates: input.kind !== 'latest' },
    );

  return !error;
}

/* ── Stories: expiração e sequências ──────────────────────────────────────── */

/** Um Story que já não vem em `me/stories` e tem mais de 24 h expirou. Fica
 *  com a hora; não desaparece — é história, e é o que as sequências leem. */
export async function markExpiredStories(accountId: string, activeExternalIds: readonly string[], now = new Date()): Promise<number> {
  const db = supabaseService();
  const limite = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from('instagram_media')
    .select('id, external_media_id')
    .eq('account_id', accountId)
    .eq('media_product_type', 'STORY')
    .is('expired_at', null)
    .lte('published_at', limite);
  const ativos = new Set(activeExternalIds);
  const expirados = (data ?? []).filter((m) => !ativos.has(m.external_media_id)).map((m) => m.id);
  if (expirados.length === 0) return 0;
  await db.from('instagram_media').update({ expired_at: now.toISOString() }).in('id', expirados);
  return expirados.length;
}

export async function listStories(accountId: string, limit = 400): Promise<MediaRow[]> {
  const { data } = await supabaseService()
    .from('instagram_media')
    .select(MEDIA_SELECT)
    .eq('account_id', accountId)
    .eq('media_product_type', 'STORY')
    .order('published_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as RawMediaRow[]).map(toMedia);
}

/** Reagrupa os Stories em sequências pela regra determinística.
 *
 *  Uma sequência que ela corrigiu (`locked`) fica como está, com os frames
 *  dela; os outros frames reagrupam-se. Idempotente pela chave
 *  `(account_id, started_at)`. */
export async function rebuildStorySequences(accountId: string): Promise<{ sequences: number; frames: number }> {
  const db = supabaseService();
  const stories = await listStories(accountId);
  if (stories.length === 0) return { sequences: 0, frames: 0 };

  const { data: presas } = await db
    .from('instagram_story_sequence')
    .select('id')
    .eq('account_id', accountId)
    .eq('locked', true);
  const presasIds = new Set((presas ?? []).map((p) => p.id));
  const livres = stories.filter((s) => !s.sequenceId || !presasIds.has(s.sequenceId));

  const grupos: StorySequence[] = groupStorySequences(livres.map((s) => ({ id: s.id, publishedAt: s.publishedAt, expiredAt: s.expiredAt })));
  let frames = 0;

  for (const g of grupos) {
    const { data: seq } = await db
      .from('instagram_story_sequence')
      .upsert(
        { account_id: accountId, started_at: g.startedAt, ended_at: g.endedAt, story_count: g.storyCount, method: 'deterministic' },
        { onConflict: 'account_id,started_at' },
      )
      .select('id')
      .single();
    if (!seq) continue;
    await db.from('instagram_media').update({ sequence_id: seq.id }).in('id', g.storyIds);
    frames += g.storyIds.length;
  }

  // Sequências deterministas que ficaram sem frames deixam de existir.
  const { data: todas } = await db.from('instagram_story_sequence').select('id').eq('account_id', accountId).eq('locked', false);
  const vivas = new Set(grupos.map((g) => g.startedAt));
  const { data: comInicio } = await db.from('instagram_story_sequence').select('id, started_at').eq('account_id', accountId).eq('locked', false);
  const mortas = (comInicio ?? []).filter((s) => !vivas.has(s.started_at)).map((s) => s.id);
  if (mortas.length && (todas ?? []).length) await db.from('instagram_story_sequence').delete().in('id', mortas);

  return { sequences: grupos.length, frames };
}

export async function writeAccountSnapshot(input: {
  accountId: string;
  observedOn: string;
  metrics: Record<string, MetricValue>;
  followersCount: number | null;
}): Promise<void> {
  const num = (k: string) => {
    const v = input.metrics[k];
    return v && v.available && typeof v.valueRaw === 'number' ? v.valueRaw : null;
  };

  await supabaseService()
    .from('instagram_account_snapshot')
    .upsert(
      {
        account_id: input.accountId,
        observed_on: input.observedOn,
        period: 'day',
        reach: num('reach'),
        views: num('views'),
        accounts_engaged: num('accounts_engaged'),
        total_interactions: num('total_interactions'),
        profile_link_taps: num('profile_links_taps'),
        followers_count: input.followersCount,
        raw_metrics: asJson(input.metrics),
        api_version: apiVersion(),
      },
      { onConflict: 'account_id,observed_on,period' },
    );
}

/* ── Confirmações ─────────────────────────────────────────────────────────── */

export async function confirmTrial(mediaId: string, answer: 'yes' | 'no' | 'unknown'): Promise<void> {
  const now = new Date().toISOString();
  await supabaseService()
    .from('instagram_media')
    .update(
      answer === 'unknown'
        // «Não lembro» mantém desconhecido e marca que já se perguntou. É o que
        // impede o cartão de voltar todos os dias.
        ? { trial_prompted_at: now }
        : { trial_status: answer, trial_status_source: 'carol_confirmation', trial_confirmed_at: now, trial_prompted_at: now },
    )
    .eq('id', mediaId);
}

export async function linkMedia(input: {
  mediaId: string;
  contentIdeaId: string | null;
  storyId: string | null;
  confidence: number | null;
  source: 'exact' | 'confident' | 'carol_confirmation' | 'manual';
}): Promise<void> {
  await supabaseService()
    .from('instagram_media')
    .update({
      content_idea_id: input.contentIdeaId,
      story_id: input.storyId,
      link_confidence: input.confidence,
      link_source: input.source,
      link_prompted_at: new Date().toISOString(),
    })
    .eq('id', input.mediaId);
}

export async function markLinkPrompted(mediaId: string): Promise<void> {
  await supabaseService()
    .from('instagram_media')
    .update({ link_prompted_at: new Date().toISOString() })
    .eq('id', mediaId);
}

/* ── Contagens para o Hoje ────────────────────────────────────────────────── */

export type InstagramCounts = {
  unlinkedMedia: number;
  trialUnknown: number;
  mediaTotal: number;
  lastSyncAt: string | null;
};

export async function instagramCounts(): Promise<InstagramCounts> {
  const db = supabaseService();
  const conta = await currentAccount();
  if (!conta) return { unlinkedMedia: 0, trialUnknown: 0, mediaTotal: 0, lastSyncAt: null };

  // Só mídia recente: perguntar sobre um Reel de há três meses não ajuda
  // ninguém e ela já não se lembra.
  const limite = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [semLigacao, semTrial, total] = await Promise.all([
    db.from('instagram_media').select('id', { count: 'exact', head: true })
      .eq('account_id', conta.id).is('content_idea_id', null).is('story_id', null)
      .is('link_prompted_at', null).gte('published_at', limite),
    db.from('instagram_media').select('id', { count: 'exact', head: true })
      .eq('account_id', conta.id).eq('trial_status', 'unknown').eq('media_product_type', 'REELS')
      .is('trial_prompted_at', null).gte('published_at', limite),
    db.from('instagram_media').select('id', { count: 'exact', head: true }).eq('account_id', conta.id),
  ]);

  return {
    unlinkedMedia: semLigacao.count ?? 0,
    trialUnknown: semTrial.count ?? 0,
    mediaTotal: total.count ?? 0,
    lastSyncAt: conta.lastSyncAt,
  };
}
