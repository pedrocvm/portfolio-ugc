/** OAuth do Instagram, sem SDK.
 *
 *  Segue o mesmo desenho do Gmail: `state` assinado e amarrado à sessão, troca
 *  server-side, token cifrado antes de tocar na base, nunca de volta ao
 *  browser e nunca num log.
 *
 *  Duas trocas, não uma: o código dá um token de curta duração, e é preciso
 *  outra chamada para o converter em longa duração. Parar na primeira era o
 *  erro que fazia a ligação morrer numa hora.
 *
 *  Server-only. */

import 'server-only';

import { decryptSecret, encryptSecret, signPayload, verifyPayload } from '@/lib/crypto';
import { supabaseService } from '@/lib/supabase/service';
import { AUTH_HOST, GRAPH_HOST, INSTAGRAM_PROVIDER, INSTAGRAM_SCOPES, apiVersion, bootstrapToken, instagramConfig, type InstagramConfig } from './config';
import { redact } from './errors';
import { expiryFrom } from './token';

const AUTHORIZE_URL = `${AUTH_HOST}/oauth/authorize`;
const SHORT_TOKEN_URL = `${AUTH_HOST}/oauth/access_token`;
const LONG_TOKEN_PATH = 'access_token';
const REFRESH_PATH = 'refresh_access_token';

const STATE_TTL_MS = 15 * 60 * 1000;

export async function buildState(appUserId: string): Promise<string> {
  const payload = `${appUserId}.${Date.now()}.${crypto.randomUUID()}`;
  return `${Buffer.from(payload).toString('base64url')}.${await signPayload(payload)}`;
}

export async function readState(state: string): Promise<{ appUserId: string } | null> {
  const [encoded, signature] = state.split('.');
  if (!encoded || !signature) return null;

  const payload = Buffer.from(encoded, 'base64url').toString();
  if (!(await verifyPayload(payload, signature))) return null;

  const [appUserId, issuedAt] = payload.split('.');
  if (!appUserId || !issuedAt) return null;
  if (Date.now() - Number(issuedAt) > STATE_TTL_MS) return null;

  return { appUserId };
}

export function authorizeUrl(cfg: InstagramConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: INSTAGRAM_SCOPES.join(','),
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

type ShortTokenResponse = {
  access_token?: string;
  user_id?: number | string;
  permissions?: string;
  error_type?: string;
  error_message?: string;
};

type LongTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string; code?: number };
};

/** Código → token de curta duração. `application/x-www-form-urlencoded`, e o
 *  `client_secret` só existe deste lado. */
export async function exchangeCode(cfg: InstagramConfig, code: string): Promise<{ token: string; userId: string; scopes: string[] }> {
  const res = await fetch(SHORT_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri,
      code,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as ShortTokenResponse;

  if (!res.ok || !json.access_token) {
    // Só o tipo do erro sai daqui: o corpo do pedido levava o segredo.
    throw new Error(`instagram_oauth:${json.error_type ?? res.status}`);
  }

  return {
    token: json.access_token,
    userId: String(json.user_id ?? ''),
    scopes: (json.permissions ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

/** Curta → longa duração. A validade vem na resposta; não se grava «60 dias». */
export async function exchangeForLongLived(
  cfg: InstagramConfig,
  shortToken: string,
): Promise<{ token: string; expiresAt: string | null }> {
  const url = new URL(`${GRAPH_HOST}/${LONG_TOKEN_PATH}`);
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', cfg.clientSecret);
  url.searchParams.set('access_token', shortToken);

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const json = (await res.json().catch(() => ({}))) as LongTokenResponse;

  if (!res.ok || !json.access_token) {
    throw new Error(`instagram_long_token:${json.error?.code ?? res.status}`);
  }
  return { token: json.access_token, expiresAt: expiryFrom(json.expires_in) };
}

/** Renova um token de longa duração. A Meta recusa tokens com menos de 24 h;
 *  quem decide se vale a pena chamar é `shouldRefresh`, em `token.ts`. */
export async function refreshLongLived(longToken: string): Promise<{ token: string; expiresAt: string | null }> {
  const url = new URL(`${GRAPH_HOST}/${REFRESH_PATH}`);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', longToken);

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const json = (await res.json().catch(() => ({}))) as LongTokenResponse;

  if (!res.ok || !json.access_token) {
    throw new Error(`instagram_refresh:${json.error?.code ?? res.status}`);
  }
  return { token: json.access_token, expiresAt: expiryFrom(json.expires_in) };
}

/* ── Persistência ─────────────────────────────────────────────────────────── */

export type StoredConnection = {
  id: string;
  appUserId: string;
  account: string;
  status: string;
  scopes: string[];
  expiresAt: string | null;
  lastSuccessAt: string | null;
  lastRefreshAt: string | null;
};

/** Reusa `integration_connection`, que já é a fonte única de credenciais do
 *  CarolOS. Uma segunda tabela de segredos seria um segundo sítio para os
 *  esquecer em rotação. */
export async function saveConnection(input: {
  appUserId: string;
  account: string;
  token: string;
  scopes: readonly string[];
  expiresAt: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const db = supabaseService();
  const encrypted = await encryptSecret(input.token);

  const { data, error } = await db
    .from('integration_connection')
    .upsert(
      {
        provider: INSTAGRAM_PROVIDER,
        app_user_id: input.appUserId,
        account_identifier: input.account,
        encrypted_access_token: encrypted,
        scopes: [...input.scopes],
        status: 'connected',
        token_expires_at: input.expiresAt,
        last_success_at: new Date().toISOString(),
        last_error_at: null,
        last_error_code: null,
      },
      { onConflict: 'provider,app_user_id,account_identifier' },
    )
    .select('id')
    .maybeSingle();

  // O cliente do Supabase devolve o erro em vez de o lançar. Ignorá-lo era
  // como o Gmail dizia «ligado» com a tabela vazia.
  if (error) return { ok: false, error: redact(error.message) };
  if (!data) return { ok: false, error: 'A ligação não foi gravada.' };
  return { ok: true, id: data.id };
}

export async function readConnection(): Promise<StoredConnection | null> {
  const db = supabaseService();
  const { data, error } = await db
    .from('integration_connection')
    .select('id, app_user_id, account_identifier, status, scopes, token_expires_at, last_success_at, updated_at')
    .eq('provider', INSTAGRAM_PROVIDER)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    appUserId: data.app_user_id,
    account: data.account_identifier,
    status: data.status,
    scopes: data.scopes ?? [],
    expiresAt: data.token_expires_at,
    lastSuccessAt: data.last_success_at,
    lastRefreshAt: data.updated_at,
  };
}

/** O token em claro, para o cliente. Nunca sai desta camada para cima com
 *  outro propósito, e nunca volta ao browser. */
export async function readAccessToken(): Promise<string | null> {
  const db = supabaseService();
  const { data } = await db
    .from('integration_connection')
    .select('encrypted_access_token, status')
    .eq('provider', INSTAGRAM_PROVIDER)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.encrypted_access_token && data.status !== 'revoked') {
    try {
      return await decryptSecret(data.encrypted_access_token);
    } catch {
      // Chave de cifra trocada: melhor pedir para ligar de novo do que
      // devolver lixo que a Meta vai recusar com um erro confuso.
      return null;
    }
  }

  // Caminho de arranque: valida o sync antes de o OAuth estar ligado. Não é a
  // arquitetura final e não existe tela para colar token.
  return bootstrapToken();
}

export async function markRevoked(reason: string): Promise<void> {
  const db = supabaseService();
  // A razão vai para `job_run`, que é onde há sítio para texto. Aqui fica o
  // código: a tabela guarda credenciais e não é lugar para prosa.
  void redact(reason);
  await db
    .from('integration_connection')
    .update({ status: 'revoked', last_error_code: 'auth_revoked', last_error_at: new Date().toISOString() })
    .eq('provider', INSTAGRAM_PROVIDER);
  await db.from('instagram_account').update({ status: 'revoked' }).eq('status', 'connected');
}

export async function disconnect(): Promise<void> {
  const db = supabaseService();
  // `disconnected` não passa no check da tabela; `revoked` é o estado real —
  // deixámos de ter acesso, seja por decisão dela ou da Meta.
  await db
    .from('integration_connection')
    .update({ status: 'revoked', encrypted_access_token: null, token_expires_at: null })
    .eq('provider', INSTAGRAM_PROVIDER);
  await db.from('instagram_account').update({ status: 'revoked' }).eq('status', 'connected');
}

/** Faz a troca completa a partir do código e deixa tudo gravado. */
export async function completeOAuth(code: string, appUserId: string): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const cfg = instagramConfig();
  if (!cfg) return { ok: false, error: 'Falta configurar INSTAGRAM_CLIENT_ID e INSTAGRAM_CLIENT_SECRET.' };

  try {
    const curto = await exchangeCode(cfg, code);
    const longo = await exchangeForLongLived(cfg, curto.token);

    const { InstagramClient } = await import('./client');
    const client = new InstagramClient({ accessToken: longo.token, version: apiVersion() });
    const me = await client.request<{ id: string; user_id?: string; username: string; account_type?: string }>('me', {
      params: { fields: 'id,user_id,username,account_type,media_count,followers_count,follows_count' },
    });

    const gravou = await saveConnection({
      appUserId,
      account: me.username,
      token: longo.token,
      scopes: curto.scopes.length ? curto.scopes : [...INSTAGRAM_SCOPES],
      expiresAt: longo.expiresAt,
    });
    if (!gravou.ok) return gravou;

    const { upsertAccount } = await import('./service');
    await upsertAccount(appUserId, me, { scopes: curto.scopes.length ? curto.scopes : [...INSTAGRAM_SCOPES] });

    return { ok: true, username: me.username };
  } catch (error) {
    return { ok: false, error: redact(error instanceof Error ? error.message : 'Falha ao ligar o Instagram.') };
  }
}
