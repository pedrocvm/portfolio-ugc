/** A ingestão: perfil, mídia, stories, insights e snapshots.
 *
 *  Um trabalho só, não um por endpoint. O volume é baixo — uma conta, quinze
 *  peças — e três crons a fazer três terços do mesmo trabalho só multiplicam
 *  as formas de o horário sair de ordem.
 *
 *  O que este ficheiro protege:
 *
 *  - uma métrica não suportada tira só aquela métrica, não o snapshot;
 *  - um erro parcial não apaga nada: guarda-se o que veio;
 *  - um token revogado vira uma ação no Hoje, uma só;
 *  - stories são apanhados enquanto existem, porque expiram em 24 h.
 *
 *  Server-only. */

import 'server-only';

import { localDay } from '@/lib/time';
import { snapshotAgeBucket, type SnapshotKind } from '@/modules/content-brain/metrics';
import { InstagramClient } from './client';
import { apiVersion } from './config';
import { MetaApiError, NEEDS_CAROL, USER_MESSAGE, type MetaErrorKind } from './errors';
import { markRevoked, readAccessToken, readConnection } from './oauth';
import {
  ACCOUNT_METRICS,
  MediaSchema,
  MeSchema,
  metricsFor,
  normalizeInsights,
  normalizeMedia,
  type RawMedia,
} from './normalize';
import {
  currentAccount,
  instagramCounts,
  markAccountError,
  markAccountSynced,
  pendingSnapshots,
  upsertAccount,
  upsertMedia,
  writeAccountSnapshot,
  writeSnapshot,
  type AccountRow,
} from './service';

export type SyncReport = {
  status: 'success' | 'error' | 'skipped';
  accountsSynced: number;
  mediaSeen: number;
  mediaInserted: number;
  storiesSeen: number;
  snapshotsWritten: number;
  accountSnapshots: number;
  apiCalls: number;
  errors: number;
  failures: string[];
  /** Métricas que a Meta recusou nesta corrida. Não é falha; é informação. */
  unsupportedMetrics: string[];
  durationMs: number;
  reason?: string;
};

const empty = (reason: string): SyncReport => ({
  status: 'skipped',
  accountsSynced: 0, mediaSeen: 0, mediaInserted: 0, storiesSeen: 0,
  snapshotsWritten: 0, accountSnapshots: 0, apiCalls: 0, errors: 0,
  failures: [], unsupportedMetrics: [], durationMs: 0, reason,
});

const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,permalink,timestamp,is_shared_to_feed,comments_count,like_count,thumbnail_url';

/** A corrida completa: perfil, mídia nova, stories ativos, snapshots devidos e
 *  o retrato diário da conta. */
export async function syncInstagram(opts: { now?: Date; maxSnapshots?: number } = {}): Promise<SyncReport> {
  const started = Date.now();
  const now = opts.now ?? new Date();

  const token = await readAccessToken();
  if (!token) return empty('O Instagram não está ligado.');

  const conexao = await readConnection();
  const client = new InstagramClient({ accessToken: token, version: apiVersion() });

  const report: SyncReport = { ...empty(''), status: 'success', reason: undefined };
  const naoSuportadas = new Set<string>();

  let conta: AccountRow | null = null;

  try {
    const meRaw = await client.request('me', {
      params: { fields: 'id,user_id,username,account_type,media_count,followers_count,follows_count' },
    });
    const me = MeSchema.parse(meRaw);

    const appUserId = conexao?.appUserId ?? (await firstAppUser());
    if (!appUserId) return empty('Não encontrei o usuário do CarolOS.');

    conta = await upsertAccount(appUserId, me);
    if (!conta) return { ...report, status: 'error', failures: ['Não consegui gravar a conta do Instagram.'], errors: 1, durationMs: Date.now() - started };
    report.accountsSynced = 1;

    /* Mídia */
    const brutas = await client.paginate<RawMedia>('me/media', { params: { fields: MEDIA_FIELDS, limit: 50 }, maxPages: 4 });
    const medias = brutas.map((m) => MediaSchema.parse(m)).map(normalizeMedia);
    const gravadas = await upsertMedia(conta.id, medias);
    report.mediaSeen = gravadas.seen;
    report.mediaInserted = gravadas.inserted;

    /* Stories: expiram em 24 h, por isso apanham-se e medem-se já. */
    try {
      const stories = await client.paginate<RawMedia>('me/stories', {
        params: { fields: 'id,media_type,media_product_type,permalink,timestamp,thumbnail_url' },
        maxPages: 2,
      });
      if (stories.length) {
        const normalizados = stories
          .map((s) => MediaSchema.parse({ ...s, media_product_type: s.media_product_type ?? 'STORY' }))
          .map(normalizeMedia);
        await upsertMedia(conta.id, normalizados);
        report.storiesSeen = normalizados.length;
      }
    } catch (error) {
      report.failures.push(describe(error, 'stories'));
      report.errors += 1;
    }

    /* Snapshots devidos */
    const devidos = await pendingSnapshots(conta.id, now);
    const teto = opts.maxSnapshots ?? 40;
    let feitos = 0;

    for (const { media, kinds } of devidos) {
      for (const kind of kinds) {
        if (feitos >= teto) break;
        const ok = await captureSnapshot(client, { mediaId: media.id, externalId: media.externalMediaId, mediaType: media.mediaType, productType: media.mediaProductType, publishedAt: media.publishedAt, kind, now }, naoSuportadas);
        if (ok) feitos += 1;
        else {
          report.errors += 1;
          report.failures.push(`Não consegui medir ${media.externalMediaId} em ${kind}.`);
        }
      }
    }
    report.snapshotsWritten = feitos;

    /* Retrato diário da conta */
    try {
      const ins = await client.insights(me.user_id ?? me.id, ACCOUNT_METRICS, { period: 'day', metric_type: 'total_value' });
      ins.unsupported.forEach((m) => naoSuportadas.add(m));
      const { metrics } = normalizeInsights({ requested: ACCOUNT_METRICS, payload: ins.payload, apiVersion: client.version, unsupported: ins.unsupported });
      await writeAccountSnapshot({
        accountId: conta.id,
        observedOn: localDay(now),
        metrics,
        followersCount: me.followers_count ?? null,
      });
      report.accountSnapshots = 1;
    } catch (error) {
      report.failures.push(describe(error, 'insights da conta'));
      report.errors += 1;
    }

    await markAccountSynced(conta.id);
  } catch (error) {
    const kind = error instanceof MetaApiError ? error.detail.kind : 'provider_unknown';
    if (kind === 'auth_revoked' || kind === 'token_expired') {
      await markRevoked(kind);
      await raiseReconnectAction(kind);
    }
    if (conta) await markAccountError(conta.id, kind);

    return {
      ...report,
      status: 'error',
      apiCalls: client.calls.length,
      errors: report.errors + 1,
      failures: [...report.failures, describe(error, 'sincronização')],
      unsupportedMetrics: [...naoSuportadas],
      durationMs: Date.now() - started,
    };
  }

  return {
    ...report,
    apiCalls: client.calls.length,
    unsupportedMetrics: [...naoSuportadas],
    status: report.errors > 0 && report.mediaSeen === 0 ? 'error' : 'success',
    durationMs: Date.now() - started,
  };
}

async function captureSnapshot(
  client: InstagramClient,
  m: { mediaId: string; externalId: string; mediaType: string; productType: string; publishedAt: string; kind: SnapshotKind; now: Date },
  naoSuportadas: Set<string>,
): Promise<boolean> {
  const pedidas = metricsFor(m.productType, m.mediaType);
  try {
    const ins = await client.insights(m.externalId, pedidas);
    ins.unsupported.forEach((x) => naoSuportadas.add(x));
    const { metrics } = normalizeInsights({
      requested: pedidas,
      payload: ins.payload,
      apiVersion: client.version,
      unsupported: ins.unsupported,
    });
    // Escreve mesmo quando tudo veio indisponível: é isso que regista que a
    // janela foi tentada e não fica a repetir-se para sempre.
    return await writeSnapshot({ mediaId: m.mediaId, kind: m.kind, publishedAt: m.publishedAt, metrics, now: m.now });
  } catch (error) {
    if (error instanceof MetaApiError && (error.detail.kind === 'auth_revoked' || error.detail.kind === 'token_expired')) throw error;
    return false;
  }
}

function describe(error: unknown, what: string): string {
  if (error instanceof MetaApiError) {
    const kind = error.detail.kind as MetaErrorKind;
    return `${what}: ${USER_MESSAGE[kind]}`;
  }
  return `${what}: ${error instanceof Error ? error.message.slice(0, 200) : 'falha desconhecida'}`;
}

async function firstAppUser(): Promise<string | null> {
  const { supabaseService } = await import('@/lib/supabase/service');
  const { data } = await supabaseService().from('app_user').select('id').limit(1).maybeSingle();
  return data?.id ?? null;
}

/** Uma integração partida não pode ficar invisível, e também não pode
 *  interromper todos os dias. Uma ação, deduplicada pela chave. */
async function raiseReconnectAction(kind: MetaErrorKind): Promise<void> {
  if (!NEEDS_CAROL.includes(kind)) return;
  const { supabaseService } = await import('@/lib/supabase/service');
  await supabaseService()
    .from('action_item')
    .upsert(
      {
        type: 'integration_fix' as const,
        title: 'O Instagram precisa ser ligado de novo',
        reason: USER_MESSAGE[kind],
        risk: 'high' as const,
        priority_score: 190,
        status: 'open' as const,
        requires_approval: false,
        dedupe_key: 'integration:instagram:reconnect',
      },
      { onConflict: 'dedupe_key' },
    );
}

/* ── Renovação de token ───────────────────────────────────────────────────── */

export type TokenRefreshReport = { refreshed: boolean; because: string; failures: string[] };

export async function refreshInstagramToken(now = new Date()): Promise<TokenRefreshReport> {
  const conexao = await readConnection();
  if (!conexao) return { refreshed: false, because: 'O Instagram não está ligado.', failures: [] };

  const { shouldRefresh } = await import('./token');
  const decisao = shouldRefresh(
    { expiresAt: conexao.expiresAt, status: conexao.status, lastRefreshAt: conexao.lastRefreshAt, issuedAt: null },
    now,
  );
  if (!decisao.refresh) return { refreshed: false, because: decisao.because, failures: [] };

  const token = await readAccessToken();
  if (!token) return { refreshed: false, because: 'Não há token salvo.', failures: [] };

  try {
    const { refreshLongLived } = await import('./oauth');
    const novo = await refreshLongLived(token);
    const { saveConnection } = await import('./oauth');
    const gravou = await saveConnection({
      appUserId: conexao.appUserId,
      account: conexao.account,
      token: novo.token,
      scopes: conexao.scopes,
      expiresAt: novo.expiresAt,
    });
    if (!gravou.ok) return { refreshed: false, because: 'A renovação correu mas não ficou gravada.', failures: [gravou.error] };
    return { refreshed: true, because: decisao.because, failures: [] };
  } catch (error) {
    return {
      refreshed: false,
      because: 'A renovação falhou.',
      failures: [error instanceof Error ? error.message.slice(0, 200) : 'falha desconhecida'],
    };
  }
}

/* ── Comentários (P1) ─────────────────────────────────────────────────────── */

export type CommentSyncReport = {
  status: 'success' | 'inconclusive' | 'error';
  mediaChecked: number;
  commentsIngested: number;
  /** Verdadeiro quando a API devolveu vazio em mídia que SABEMOS ter
   *  comentários. Uma lista vazia nessas condições não é sucesso. */
  emptyOnKnownComments: boolean;
  failures: string[];
};

/** Ingestão de comentários, com o portão de validação do briefing.
 *
 *  Numa corrida real a 05/09/2026 o endpoint devolveu `data: []` para uma
 *  mídia com 58 comentários. Por isso o relatório distingue «não há
 *  comentários» de «a API não os está a dar» — e a segunda não conta como
 *  sucesso, nem alimenta o Comments Intelligence. */
export async function syncComments(limitMedia = 10): Promise<CommentSyncReport> {
  const token = await readAccessToken();
  const conta = await currentAccount();
  if (!token || !conta) return { status: 'error', mediaChecked: 0, commentsIngested: 0, emptyOnKnownComments: false, failures: ['O Instagram não está ligado.'] };

  const { supabaseService } = await import('@/lib/supabase/service');
  const db = supabaseService();
  const client = new InstagramClient({ accessToken: token, version: apiVersion() });

  // Mídia que sabemos ter comentários: o próprio endpoint de mídia diz quantos.
  const { data: alvos } = await db
    .from('instagram_media')
    .select('id, external_media_id, comments_count')
    .eq('account_id', conta.id)
    .gt('comments_count', 0)
    .order('published_at', { ascending: false })
    .limit(limitMedia);

  const report: CommentSyncReport = { status: 'success', mediaChecked: 0, commentsIngested: 0, emptyOnKnownComments: false, failures: [] };
  let vaziosComComentarios = 0;

  for (const alvo of alvos ?? []) {
    report.mediaChecked += 1;
    try {
      const comentarios = await client.paginate<{ id: string; text?: string; timestamp?: string; username?: string; like_count?: number; parent_id?: string }>(
        `${alvo.external_media_id}/comments`,
        { params: { fields: 'id,text,timestamp,username,like_count' }, maxPages: 3 },
      );

      if (comentarios.length === 0 && (alvo.comments_count ?? 0) > 0) {
        vaziosComComentarios += 1;
        continue;
      }

      if (comentarios.length) {
        const { error } = await db.from('instagram_comment').upsert(
          comentarios.map((c) => ({
            media_id: alvo.id,
            external_comment_id: c.id,
            parent_external_id: c.parent_id ?? null,
            text: c.text ?? '',
            username: c.username ?? null,
            like_count: typeof c.like_count === 'number' ? c.like_count : null,
            commented_at: c.timestamp ?? null,
          })),
          { onConflict: 'media_id,external_comment_id', ignoreDuplicates: true },
        );
        if (error) report.failures.push(`comentários: ${error.message.slice(0, 160)}`);
        else report.commentsIngested += comentarios.length;
      }
    } catch (error) {
      report.failures.push(describe(error, `comentários de ${alvo.external_media_id}`));
    }
  }

  if (vaziosComComentarios > 0 && report.commentsIngested === 0) {
    report.status = 'inconclusive';
    report.emptyOnKnownComments = true;
    report.failures.push(
      `${vaziosComComentarios} ${vaziosComComentarios === 1 ? 'publicação tem' : 'publicações têm'} comentários no Instagram e a API devolveu lista vazia. Não é sucesso; é a leitura de comentários por validar.`,
    );
  }

  return report;
}

/* ── Leitura para o Hoje ──────────────────────────────────────────────────── */

export { instagramCounts, snapshotAgeBucket };
